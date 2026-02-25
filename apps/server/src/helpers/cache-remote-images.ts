import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { PUBLIC_PATH } from './paths';
import { imageExtensions } from '@sharkord/shared';

const CACHE_DIR = path.join(PUBLIC_PATH, 'remote');

// simple mapping from content-type to extension for cases where the URL
// does not contain an extension. expand as needed.
const mimeToExt: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/svg+xml': '.svg'
};

const ensureCacheDir = async () => {
  await fs.mkdir(CACHE_DIR, { recursive: true });
};

const fileExists = async (p: string): Promise<boolean> => {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
};

// recursively walk an object/array and rewrite any string URLs using cacheImage
const rewriteObjectUrls = async (
  val: any,
  memo = new Map<string, string>(),
  key?: string,
  parentKey?: string
): Promise<any> => {
  if (typeof val === 'string') {
    if (/^https?:\/\//i.test(val)) {
      // do not rewrite the generic "url" property unless it's an image
      // inside an object (e.g. {image:{url:...}}). rewriting top-level url or
      // provider/author urls would change the visible link in preview cards,
      // which is undesirable. the parentKey check lets us rewrite nested
      // image URLs while leaving everything else alone.
      if (key === 'url' && parentKey !== 'image') {
        return val;
      }

      // only cache values that look like images; everything else can stay
      // untouched. this also prevents non-image urls from being rewritten in
      // other fields (e.g. embed.provider.url, author.url, etc.)
      const base = (val.split('?')[0] || '').toLowerCase();
      const isImage = imageExtensions.some((ext) => base.endsWith(ext));
      if (!isImage) {
        return val;
      }

      if (memo.has(val)) return memo.get(val);
      try {
        const local = await cacheImage(val);
        memo.set(val, local);
        return local;
      } catch {
        return val;
      }
    }
    return val;
  }
  if (Array.isArray(val)) {
    return Promise.all(val.map((v) => rewriteObjectUrls(v, memo, undefined, key)));
  }
  if (val && typeof val === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = await rewriteObjectUrls(v, memo, k, key);
    }
    return out;
  }
  return val;
};

/**
 * Rewrite any http(s) strings in a metadata array (including embed objects)
 * to point at cached local files.  Returns a new array with rewritten values.
 */
export const rewriteMetadataUrls = async (metadata: any[]): Promise<any[]> => {
  await ensureCacheDir();
  const memo = new Map<string, string>();
  const results: any[] = [];
  for (const item of metadata) {
    results.push(await rewriteObjectUrls(item, memo));
  }
  return results;
};

/**
 * Given some HTML content, locate any <img src="..."> tags that point at
 * http(s) URLs and rewrite them to point at a locally cached copy.  The
 * remote image is downloaded once and stored under PUBLIC_PATH/remote using
 * a SHA1 hash of the original URL as the filename.  Subsequent calls for the
 * same URL will reuse the cached file.
 */
export const rewriteRemoteImages = async (html: string): Promise<string> => {
  await ensureCacheDir();

  // gather promises to avoid re-fetching the same URL multiple times in a
  // single pass.  use a map from original -> local replacement
  const replacements: Record<string, string> = {};

  const imgRegex = /<img\s+[^>]*src="([^"]+)"[^>]*>/gi;
  const anchorRegex = /<a\s+[^>]*href="([^"]+)"[^>]*>/gi;
  let m;
  const tasks: Promise<void>[] = [];

  const queue = (rawUrl: string) => {
    if (!/^https?:\/\//i.test(rawUrl)) return;
    if (replacements[rawUrl]) return;
    tasks.push(
      (async () => {
        try {
          const local = await cacheImage(rawUrl);
          replacements[rawUrl] = local;
        } catch {
          // ignore
        }
      })()
    );
  };

  while ((m = imgRegex.exec(html)) !== null) {
    queue(m[1] || '');
  }
  // also rewrite <a> tags that point directly at an image url
  while ((m = anchorRegex.exec(html)) !== null) {
    const href = m[1] || '';
    // check extension after stripping query and fragment
    const clean = ((href.split('?')[0] || '').split('#')[0] || '').toLowerCase();
    const isImage = imageExtensions.some((ext) => clean.endsWith(ext));
    if (isImage) {
      queue(href);
    }
  }

  await Promise.all(tasks);

  // perform replacements only on attribute values to avoid altering link
  // text.  use regex that matches either src="..." or href="..." patterns.
  Object.entries(replacements).forEach(([orig, local]) => {
    const escaped = orig.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const attrRegex = new RegExp(`(src=\"|href=\")(?:${escaped})(\")`, 'g');
    html = html.replace(attrRegex, `$1${local}$2`);
  });

  return html;
};

/**
 * Download the remote image (if not already cached) and return the local
 * URL path for inclusion in HTML.
 */
async function cacheImage(url: string): Promise<string> {
  // some URLs we see in metadata/html are HTML-encoded (e.g. `&amp;` instead of
  // `&`).  Discord in particular often appends an extra `&amp;` at the end of a
  // CDN link.  Normalize before hashing/fetching so we only cache a single
  // canonical copy and the network request succeeds.
  const normalizeUrl = (u: string): string => {
    let decoded = u.replace(/&amp;/gi, '&');
    try {
      const parsed = new URL(decoded);
      // strip a trailing ampersand left over from encoding mistakes
      if (parsed.search.endsWith('&')) {
        parsed.search = parsed.search.slice(0, -1);
        decoded = parsed.toString();
      }
    } catch {
      // if URL constructor fails just keep the original
    }
    return decoded;
  };

  const canonical = normalizeUrl(url);
  const hash = createHash('sha1').update(canonical).digest('hex');
  let extension = path.extname(new URL(canonical).pathname).toLowerCase();
  let fileName = hash + extension;
  let dest = path.join(CACHE_DIR, fileName);

  if (await fileExists(dest)) {
    return `/remote/${fileName}`;
  }

  const { config } = await import('../config');
  const timeoutMs = config.cache.remoteImageTimeoutMs;
  const maxBytes = config.cache.remoteImageMaxBytes;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let resp;
  try {
    resp = await fetch(canonical, { signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
  clearTimeout(timer);

  if (!resp.ok) {
    throw new Error(`failed to fetch ${url}`);
  }

  // read body with limit
  const reader = resp.body?.getReader();
  let buffer: Buffer;
  if (reader) {
    const chunks: Uint8Array[] = [];
    let total = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.length;
        if (total > maxBytes) {
          controller.abort();
          throw new Error('download size limit exceeded');
        }
        chunks.push(value);
      }
    }
    buffer = Buffer.concat(chunks);
  } else {
    // fallback to ArrayBuffer if no stream available
    const ab = await resp.arrayBuffer();
    if (ab.byteLength > maxBytes) {
      throw new Error('download size limit exceeded');
    }
    buffer = Buffer.from(ab);
  }

  if (!extension) {
    const ct: string = ((resp.headers.get('content-type') || '').split(';')[0] || '');
    extension = mimeToExt[ct] || '';
    fileName = hash + extension;
    dest = path.join(CACHE_DIR, fileName);
  }

  await fs.writeFile(dest, buffer);

  return `/remote/${fileName}`;
}

// expose for unit testing
export { cacheImage };
