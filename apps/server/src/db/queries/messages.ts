import type {
  TFile,
  TJoinedMessage,
  TJoinedMessageReaction,
  TMessage,
  TMessageReaction
} from '@sharkord/shared';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { db } from '..';
import { generateFileToken } from '../../helpers/files-crypto';
import {
  channels,
  files,
  messageFiles,
  messageReactions,
  messages
} from '../schema';

import { logger } from '../../logger';

const getMessageByFileId = async (
  fileId: number
): Promise<TMessage | undefined> => {
  const row = await db
    .select({ message: messages })
    .from(messageFiles)
    .innerJoin(messages, eq(messages.id, messageFiles.messageId))
    .where(eq(messageFiles.fileId, fileId))
    .get();

  return row?.message;
};

const getMessage = async (
  messageId: number
): Promise<TJoinedMessage | undefined> => {
  const message = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1)
    .get();

  if (!message) return undefined;

  const channel = await db
    .select({
      fileAccessToken: channels.fileAccessToken,
      private: channels.private
    })
    .from(channels)
    .where(eq(channels.id, message.channelId))
    .limit(1)
    .get();

  if (!channel) return undefined;

  const fileRows = await db
    .select({
      file: files
    })
    .from(messageFiles)
    .innerJoin(files, eq(messageFiles.fileId, files.id))
    .where(eq(messageFiles.messageId, messageId));

  const filesForMessage: TFile[] = fileRows.map((r) => {
    if (channel.private) {
      return {
        ...r.file,
        _accessToken: generateFileToken(r.file.id, channel.fileAccessToken)
      };
    }

    return r.file;
  });

  const reactionRows = await db
    .select({
      messageId: messageReactions.messageId,
      userId: messageReactions.userId,
      emoji: messageReactions.emoji,
      createdAt: messageReactions.createdAt,
      fileId: messageReactions.fileId,
      file: files
    })
    .from(messageReactions)
    .leftJoin(files, eq(messageReactions.fileId, files.id))
    .where(eq(messageReactions.messageId, messageId));

  const reactions: TJoinedMessageReaction[] = reactionRows.map((r) => ({
    messageId: r.messageId,
    userId: r.userId,
    emoji: r.emoji,
    createdAt: r.createdAt,
    fileId: r.fileId,
    file: r.file
  }));

  let replyCount = 0;

  if (!message.parentMessageId) {
    const replyCountRow = await db
      .select({ count: count() })
      .from(messages)
      .where(eq(messages.parentMessageId, messageId))
      .get();

    replyCount = replyCountRow?.count ?? 0;
  }

  return {
    ...message,
    files: filesForMessage ?? [],
    reactions: reactions ?? [],
    replyCount
  };
};

const getMessagesByUserId = async (userId: number): Promise<TMessage[]> =>
  db
    .select()
    .from(messages)
    .where(eq(messages.userId, userId))
    .orderBy(desc(messages.createdAt));

const getReaction = async (
  messageId: number,
  emoji: string,
  userId: number
): Promise<TMessageReaction | undefined> =>
  db
    .select()
    .from(messageReactions)
    .where(
      and(
        eq(messageReactions.messageId, messageId),
        eq(messageReactions.emoji, emoji),
        eq(messageReactions.userId, userId)
      )
    )
    .get();

type JoinHelpers = {
  rewriteMetadataUrls: typeof import('../../helpers/cache-remote-images').rewriteMetadataUrls;
  rewriteRemoteImages: typeof import('../../helpers/cache-remote-images').rewriteRemoteImages;
  processMessageMetadata: typeof import('../../queues/message-metadata/get-message-metadata').processMessageMetadata;
};

const joinMessagesWithRelations = async (
  rows: TMessage[],
  channel: {
    private: boolean;
    fileAccessToken: string;
  },
  helpers?: Partial<JoinHelpers>
): Promise<TJoinedMessage[]> => {
  if (rows.length === 0) return [];

  const messageIds = rows.map((m) => m.id);

  const [fileRows, reactionRows] = await Promise.all([
    db
      .select({
        messageId: messageFiles.messageId,
        file: files
      })
      .from(messageFiles)
      .innerJoin(files, eq(messageFiles.fileId, files.id))
      .where(inArray(messageFiles.messageId, messageIds)),
    db
      .select({
        messageId: messageReactions.messageId,
        userId: messageReactions.userId,
        emoji: messageReactions.emoji,
        createdAt: messageReactions.createdAt,
        fileId: messageReactions.fileId,
        file: files
      })
      .from(messageReactions)
      .leftJoin(files, eq(messageReactions.fileId, files.id))
      .where(inArray(messageReactions.messageId, messageIds))
  ]);

  const filesByMessage = fileRows.reduce<Record<number, TFile[]>>(
    (acc, row) => {
      if (!acc[row.messageId]) {
        acc[row.messageId] = [];
      }

      const rowCopy: TFile = { ...row.file };

      if (channel.private) {
        rowCopy._accessToken = generateFileToken(
          row.file.id,
          channel.fileAccessToken
        );
      }

      acc[row.messageId]!.push(rowCopy);

      return acc;
    },
    {}
  );

  const reactionsByMessage = reactionRows.reduce<
    Record<number, TJoinedMessageReaction[]>
  >((acc, r) => {
    const reaction: TJoinedMessageReaction = {
      messageId: r.messageId,
      userId: r.userId,
      emoji: r.emoji,
      createdAt: r.createdAt,
      fileId: r.fileId,
      file: r.file
    };

    if (!acc[r.messageId]) {
      acc[r.messageId] = [];
    }

    acc[r.messageId]!.push(reaction);

    return acc;
  }, {});

  // if there is metadata present we may need to rewrite any remote URLs
  // additionally, for rows without metadata we should generate it now so
  // the client sees embeds on first load instead of waiting for the background
  // queue.  Consumers (tests) can supply helper overrides to force failures
  // without modifying module exports.
  // resolve imports relative to this file rather than the caller's cwd; this
  // avoids errors when joinMessagesWithRelations is invoked from tests or other
  // code that changes cwd.
  const path = await import('path');
  const cachedPath = path.join(__dirname, '../../helpers/cache-remote-images');
  // `queues` lives one level above `queries`
  const procPath = path.join(__dirname, '../../queues/message-metadata/get-message-metadata');

  // dynamically import helper modules; wrap in try/catch so a failure
  // here doesn't crash the entire query. failing imports can happen if the
  // bundling process changes file locations or in pathological test setups.
  let rewriteMetadataUrls: JoinHelpers['rewriteMetadataUrls'];
  let rewriteRemoteImages: JoinHelpers['rewriteRemoteImages'];
  let processMessageMetadata: JoinHelpers['processMessageMetadata'];

  try {
    const [importedCache, importedProc] = await Promise.all([
      import(cachedPath),
      import(procPath)
    ]);
    rewriteMetadataUrls = importedCache.rewriteMetadataUrls;
    rewriteRemoteImages = importedCache.rewriteRemoteImages;
    processMessageMetadata = importedProc.processMessageMetadata;
  } catch (err) {
    // log and fall back to no-op implementations
    logger.error('failed to load helper modules in joinMessagesWithRelations', {
      err
    });
    rewriteMetadataUrls = async (m) => m;
    rewriteRemoteImages = async (h) => h;
    // provide a full dummy row matching the return type of processMessageMetadata
    processMessageMetadata = async () => {
      return {
        id: -1,
        userId: -1,
        createdAt: Date.now(),
        updatedAt: null,
        content: null,
        channelId: -1,
        parentMessageId: null,
        editable: null,
        metadata: []
      } as any;
    };
  }

  if (helpers) {
    if (helpers.rewriteMetadataUrls) {
      rewriteMetadataUrls = helpers.rewriteMetadataUrls;
    }
    if (helpers.rewriteRemoteImages) {
      rewriteRemoteImages = helpers.rewriteRemoteImages;
    }
    if (helpers.processMessageMetadata) {
      processMessageMetadata = helpers.processMessageMetadata;
    }
  }

  const rewrittenMetadataMap: Record<number, any[]> = {};
  const rewrittenContentMap: Record<number, string> = {};

  // wrap per-message processing in a try/catch so unexpected errors don't
  // bubble up to the router; we log and return unmodified rows instead.
  try {
    await Promise.all(
      rows.map(async (msg) => {
      // create metadata if absent and there is content to parse
      if ((!msg.metadata || msg.metadata.length === 0) && msg.content) {
        try {
          const updated = await processMessageMetadata(msg.content, msg.id);
          if (updated && updated.metadata) {
            msg.metadata = updated.metadata;
          }
        } catch {
          // ignore errors; we still want to return rows
        }
      }

      if (msg.metadata && msg.metadata.length > 0) {
        try {
          rewrittenMetadataMap[msg.id] = await rewriteMetadataUrls(msg.metadata as any[]);

          // repair any embed.url values that were accidentally rewritten to
          // local cache paths.  if we find one, try pulling the original
          // link out of the message content so clients show the correct
          // destination on first load.
          const arr = rewrittenMetadataMap[msg.id] || [];
          const needsFix = arr.some((item: any) => {
            const u = item.url;
            return typeof u === 'string' && u.startsWith('/remote/');
          });
          if (needsFix && msg.content) {
            const hrefMatch = msg.content.match(/<a[^>]*href="([^"]+)"/i);
            if (hrefMatch) {
              const original = hrefMatch[1];
              rewrittenMetadataMap[msg.id] = arr.map((item: any) => {
                const u = item.url;
                if (typeof u === 'string' && u.startsWith('/remote/')) {
                  return {
                    ...item,
                    url: original
                  };
                }
                return item;
              });

              // asynchronously update DB so next load is clean
              db.update(messages)
                .set({ metadata: rewrittenMetadataMap[msg.id] })
                .where(eq(messages.id, msg.id))
                .execute()
                .catch(() => {
                  /* ignore */
                });
            }
          }
        } catch (err) {
          // don't fail the whole query if a metadata rewrite blows up; we'll
          // just return the original metadata and log the error for diagnosis.
          logger.warn('failed to rewrite metadata urls in joinMessagesWithRelations', {
            err,
            messageId: msg.id
          });
        }
      }

      // rewrite content for older messages that may contain external
      // <img> tags or plain <a> links pointing directly at images. The
      // former is common when a user pastes an image URL and the sanitizer
      // converts it to an <img>; the latter happens when metadata already
      // rendered the URL but we still want the anchor rewritten as well.
      if (msg.content) {
        const hasImageTag = msg.content.includes('<img');
        const hasImageAnchor = /<a\s+[^>]*href="[^"]+\.(jpg|jpeg|png|gif|webp|avif|svg)(\?|\"|$)/i.test(msg.content);
        if (hasImageTag || hasImageAnchor) {
          try {
            rewrittenContentMap[msg.id] = await rewriteRemoteImages(msg.content);
          } catch (err) {
            logger.warn('failed to rewrite remote images on joinMessagesWithRelations', {
              err,
              messageId: msg.id
            });
          }
        }
      }
    })
  );
  } catch (err) {
    logger.error('unexpected error processing messages in joinMessagesWithRelations', { err });
    return rows.map((msg) => ({
      ...msg,
      content: msg.content,
      files: filesByMessage[msg.id] ?? [],
      reactions: reactionsByMessage[msg.id] ?? [],
      metadata: msg.metadata ?? null
    }));
  }

  return rows.map((msg) => ({
    ...msg,
    content: rewrittenContentMap[msg.id] ?? msg.content,
    files: filesByMessage[msg.id] ?? [],
    reactions: reactionsByMessage[msg.id] ?? [],
    metadata: rewrittenMetadataMap[msg.id] ?? msg.metadata ?? null // preserve null
  }));
};

export {
  getMessage,
  getMessageByFileId,
  getMessagesByUserId,
  getReaction,
  joinMessagesWithRelations
};
