import { eq } from 'drizzle-orm';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { db } from '../db';
import { isFileOrphaned } from '../db/queries/files';
import { getMessageByFileId } from '../db/queries/messages';
import { channels, files } from '../db/schema';
import { verifyFileToken } from '../helpers/files-crypto';
import { PUBLIC_PATH } from '../helpers/paths';
import { logger } from '../logger';

// lightweight extension -> mime lookup for cached remote files
const extToMime: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg'
};

const lookupMime = (ext: string) => extToMime[ext.toLowerCase()] || 'application/octet-stream';

const publicRouteHandler = async (
  req: http.IncomingMessage,
  res: http.ServerResponse
) => {
  if (!req.url) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad request' }));
    return;
  }

  const url = new URL(req.url!, `http://${req.headers.host}`);
  const fileName = decodeURIComponent(path.basename(url.pathname));

  // special case: files cached under /remote are not stored in the database
  if (url.pathname.startsWith('/remote/')) {
    // treat the remainder as a simple path under PUBLIC_PATH/remote
    const localName = path.basename(url.pathname);
    const localPath = path.join(PUBLIC_PATH, 'remote', localName);

    if (!fs.existsSync(localPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'File not found' }));
      return;
    }

    const stat = fs.statSync(localPath);
    const ext = path.extname(localName).toLowerCase();
    const mimeType = lookupMime(ext) || 'application/octet-stream';

    const stream = fs.createReadStream(localPath);
    res.writeHead(200, {
      'Content-Type': mimeType,
      'Content-Length': stat.size,
      'Content-Disposition': 'inline'
    });
    stream.pipe(res);
    stream.on('error', (err) => {
      logger.error('Error serving remote file:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
    stream.on('end', () => res.end());
    return;
  }

  const dbFile = await db
    .select()
    .from(files)
    .where(eq(files.name, fileName))
    .get();

  if (!dbFile) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'File not found' }));
    return;
  }

  const isOrphaned = await isFileOrphaned(dbFile.id);

  if (isOrphaned) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'File not found' }));
    return;
  }

  // it's gonna be defined if it's a message file
  // otherwise is something like an avatar or banner or something else
  // we can assume this because of the orphaned check above
  const associatedMessage = await getMessageByFileId(dbFile.id);

  if (associatedMessage) {
    const channel = await db
      .select()
      .from(channels)
      .where(eq(channels.id, associatedMessage.channelId))
      .get();

    if (channel && channel.private) {
      const accessToken = url.searchParams.get('accessToken');
      const isValidToken = verifyFileToken(
        dbFile.id,
        channel.fileAccessToken,
        accessToken || ''
      );

      if (!isValidToken) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden' }));
        return;
      }
    }
  }

  const filePath = path.join(PUBLIC_PATH, dbFile.name);

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'File not found on disk' }));
    return;
  }

  const fileStream = fs.createReadStream(filePath);

  const inlineAllowlist = [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/avif',
    'video/mp4',
    'audio/mpeg'
  ];

  const contentDisposition = inlineAllowlist.includes(dbFile.mimeType)
    ? 'inline'
    : 'attachment';

  const safeFileName = dbFile.originalName
    .replace(/[\r\n]/g, '') // strip CR/LF to prevent header injection
    .replace(/"/g, '\\"'); // escape double quotes for header safety

  const encodedFileName = encodeURIComponent(dbFile.originalName).replace(
    /'/g,
    '%27'
  );

  res.writeHead(200, {
    'Content-Type': dbFile.mimeType,
    'Content-Length': dbFile.size,
    'Content-Disposition': `${contentDisposition}; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`
  });

  fileStream.pipe(res);

  fileStream.on('error', (err) => {
    logger.error('Error serving file:', err);

    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });

  res.on('close', () => {
    fileStream.destroy();
  });

  fileStream.on('end', () => {
    res.end();
  });

  return res;
};

export { publicRouteHandler };
