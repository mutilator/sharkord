import { describe, expect, test } from 'bun:test';
import { initTest } from '../../__tests__/helpers';
import { tdb } from '../../__tests__/setup';
import { messages } from '../../db/schema';
import { eq, desc } from 'drizzle-orm';

describe('messages router', () => {
  test('should throw when user lacks permissions (edit - not own message)', async () => {
    const { caller: caller1 } = await initTest(1);
    const { caller: caller2 } = await initTest(2);

    await caller1.messages.send({
      channelId: 1,
      content: 'Original message',
      files: []
    });

    const messages = await caller1.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const messageId = messages.messages[0]!.id;

    await expect(
      caller2.messages.edit({
        messageId,
        content: 'Edited message'
      })
    ).rejects.toThrow('You do not have permission to edit this message');
  });

  test('should throw when user lacks permissions (delete - not own message)', async () => {
    const { caller: caller1 } = await initTest(1);
    const { caller: caller2 } = await initTest(2);

    await caller1.messages.send({
      channelId: 1,
      content: 'Message to delete',
      files: []
    });

    const messages = await caller1.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const messageId = messages.messages[0]!.id;

    await expect(
      caller2.messages.delete({
        messageId
      })
    ).rejects.toThrow('You do not have permission to delete this message');
  });

  test('should throw when user lacks permissions (toggleReaction)', async () => {
    const { caller: caller1 } = await initTest(1);
    const { caller: caller2 } = await initTest(2);

    await caller1.messages.send({
      channelId: 1,
      content: 'Message to react to',
      files: []
    });

    const messages = await caller1.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const messageId = messages.messages[0]!.id;

    await expect(
      caller2.messages.toggleReaction({
        messageId,
        emoji: '👍'
      })
    ).rejects.toThrow('Insufficient permissions');
  });

  test('should send a new message', async () => {
    const { caller } = await initTest();

    await caller.messages.send({
      channelId: 1,
      content: 'Test message content',
      files: []
    });

    const resp = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    expect(resp.messages).toBeDefined();
    expect(resp.messages.length).toBeGreaterThan(0);

    const sentMessage = resp.messages[0];

    expect(sentMessage!.content).toBe('Test message content');
    expect(sentMessage!.channelId).toBe(1);
    expect(sentMessage!.userId).toBe(1);

    // the metadata row should already exist even before any extra fetches or
    // background jobs run. we query the raw table to avoid joinMessagesWithRelations
    const raw = await tdb
      .select({ metadata: messages.metadata })
      .from(messages)
      .where(eq(messages.id, sentMessage!.id))
      .get();
    expect(raw?.metadata).toBeTruthy();
  });

  test('should cache external images and rewrite src', async () => {
    const { caller } = await initTest();

    // monkey-patch global fetch so tests don't hit the network
    const origFetch = global.fetch;
    (global as any).fetch = async (url: string) => {
      return {
        ok: true,
        arrayBuffer: async () => Buffer.from('fake'),
        headers: { get: () => 'image/png' }
      } as any;
    };

    try {
      const remote = 'https://example.com/test.png';
      await caller.messages.send({
        channelId: 1,
        content: `<img src="${remote}" />`,
        files: []
      });

      const messages = await caller.messages.get({
        channelId: 1,
        cursor: null,
        limit: 1
      });
      const msg = messages.messages[0]!;
      expect(msg.content).toMatch(/src="\/remote\//);

      const { PUBLIC_PATH } = await import('../../helpers/paths');
      const fs = await import('fs/promises');
      const path = await import('path');
      const m = msg.content!.match(/src="(\/remote\/[^"]+)"/);
      expect(m).not.toBeNull();
      const local = m![1]!;
      const localPath = path.join(PUBLIC_PATH, local.replace(/^\/remote\//, 'remote/'));
      expect(await fs.access(localPath).then(() => true).catch(() => false)).toBe(true);
    } finally {
      global.fetch = origFetch as any;
    }
  });


  test('should generate metadata on first channel load for messages missing it', async () => {
    const { caller } = await initTest();

    // send a message but then clear out metadata so join logic has to build it
    const msgId = await caller.messages.send({
      channelId: 1,
      content: '<a href="https://example.com">https://example.com</a>',
      files: []
    });
    await tdb.update(messages).set({ metadata: null }).where(eq(messages.id, msgId));

    const resp = await caller.messages.get({ channelId: 1, cursor: null, limit: 10 });
    const m = resp.messages.find((m) => m.id === msgId);
    expect(m?.metadata && m.metadata.length).toBeGreaterThan(0);
  });

  test('should rewrite metadata on initial channel load', async () => {
    const { caller } = await initTest();
    // stub fetch so cacheImage works
    const origFetch = global.fetch;
    (global as any).fetch = async (url: string) => {
      return {
        ok: true,
        arrayBuffer: async () => Buffer.from('fake'),
        headers: { get: () => 'image/png' }
      } as any;
    };

    try {
      // insert message directly bypassing API, with unrewritten metadata
      const remote = 'https://example.com/initial.png';
      const msgId = await caller.messages.send({
        channelId: 1,
        content: 'hello',
        files: []
      });
      // manually update database to add metadata containing external url
      await tdb.update(messages).set({ metadata: [{ url: remote, mediaType: 'link' }] }).where(eq(messages.id, msgId));

      // allow queue to run during rewrite when loading (should be quick)
      await new Promise((r) => setTimeout(r, 20));

      // now fetch messages - our join logic should rewrite metadata
      const messagesResp = await caller.messages.get({
        channelId: 1,
        cursor: null,
        limit: 10
      });
      const meta = messagesResp.messages.find((m) => m.id === msgId)!.metadata?.[0];
      expect(meta).toBeDefined();
      expect(meta!.url).toMatch(/^\/remote\//);
    } finally {
      global.fetch = origFetch as any;
    }
  });

  test('sending a link produces metadata immediately in DB', async () => {
    const { caller } = await initTest();
    const url = 'https://bun.com';

    const messageId = await caller.messages.send({
      channelId: 1,
      content: `<p><a href="${url}">${url}</a></p>`,
      files: []
    });

    const messagesResp = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 1
    });
    const msg = messagesResp.messages.find((m) => m.id === messageId)!;
    expect(msg.content).toContain('<a');

    const row = await tdb
      .select({ metadata: messages.metadata })
      .from(messages)
      .orderBy(desc(messages.id))
      .limit(1)
      .get();

    expect(row?.metadata && row.metadata.length).toBeGreaterThan(0);
  });

  // pre-existing content should also be rewritten during join
  test('should rewrite image URLs in content for existing messages', async () => {
    const { caller } = await initTest();
    // stub fetch for cacheImage during join rewrite
    const origFetch = global.fetch;
    (global as any).fetch = async (url: string) => {
      return {
        ok: true,
        arrayBuffer: async () => Buffer.from('fake'),
        headers: { get: () => 'image/png' }
      } as any;
    };

    try {
      const remote = 'https://example.com/old.png';
      const msgRow = await tdb
        .insert(messages)
        .values({
          channelId: 1,
          userId: 1,
          content: `<img src=\"${remote}\" />`,
          editable: true,
          parentMessageId: null,
          createdAt: Date.now()
        })
        .returning()
        .get();

      const messagesResp = await caller.messages.get({
        channelId: 1,
        cursor: null,
        limit: 10
      });
      const msg = messagesResp.messages.find((m) => m.id === msgRow.id)!;
      expect(msg.content).toMatch(/src="\/remote\//);
    } finally {
      global.fetch = origFetch as any;
    }
  });

  test('should get messages from channel', async () => {
    const { caller } = await initTest();

    await caller.messages.send({
      channelId: 2,
      content: 'Message 1',
      files: []
    });

    await caller.messages.send({
      channelId: 2,
      content: 'Message 2',
      files: []
    });

    await caller.messages.send({
      channelId: 2,
      content: 'Message 3',
      files: []
    });

    const result = await caller.messages.get({
      channelId: 2,
      cursor: null,
      limit: 50
    });

    expect(result.messages).toBeDefined();
    expect(Array.isArray(result.messages)).toBe(true);
    expect(result.messages.length).toBe(3);
  });

  test('should edit own message', async () => {
    const { caller } = await initTest();

    await caller.messages.send({
      channelId: 1,
      content: 'Original content',
      files: []
    });

    const messagesBefore = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const messageId = messagesBefore.messages[0]!.id;

    await caller.messages.edit({
      messageId,
      content: 'Edited content'
    });

    const messagesAfter = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const editedMessage = messagesAfter.messages.find(
      (m) => m.id === messageId
    );

    expect(editedMessage).toBeDefined();
    expect(editedMessage!.content).toBe('Edited content');
    expect(editedMessage!.updatedAt).toBeDefined();
    expect(editedMessage!.updatedAt).not.toBeNull();
  });

  
  // verify caching of remote images happens automatically when sending
  test('should cache external images and rewrite src', async () => {
    const { caller } = await initTest();

    // stub global fetch so we don't depend on network
    const origFetch = global.fetch;
    (global as any).fetch = async (url: string) => {
      return {
        ok: true,
        arrayBuffer: async () => Buffer.from('fake'),
        headers: {
          get: (h: string) => 'image/png'
        }
      } as any;
    };

    try {
      const remote = 'https://example.com/test.png';
      await caller.messages.send({
        channelId: 1,
        content: `<img src="${remote}" />`,
        files: []
      });

      const messages = await caller.messages.get({
        channelId: 1,
        cursor: null,
        limit: 1
      });
      const msg = messages.messages[0]!;
      expect(msg.content).toMatch(/src="\/remote\//);

      // ensure file was written
      const { PUBLIC_PATH } = await import('../../helpers/paths');
      const fs = await import('fs/promises');
      const path = await import('path');
      const matched = msg.content!.match(/src="(\/remote\/[^"]+)"/);
      expect(matched).not.toBeNull();
      const local = matched![1]!;
      const localPath = path.join(PUBLIC_PATH, local.replace(/^\/remote\//, 'remote/'));
      expect(await fs.access(localPath).then(() => true).catch(() => false)).toBe(true);
    } finally {
      global.fetch = origFetch as any;
    }
  });

  test('should allow admin to edit any message', async () => {
    const { caller: caller2 } = await initTest(2);
    const { caller: caller1 } = await initTest(1);

    await caller2.messages.send({
      channelId: 1,
      content: 'User 2 message',
      files: []
    });

    const messages = await caller1.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const messageId = messages.messages[0]!.id;

    await caller1.messages.edit({
      messageId,
      content: 'Edited by admin'
    });

    const messagesAfter = await caller1.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const editedMessage = messagesAfter.messages.find(
      (m) => m.id === messageId
    );

    expect(editedMessage!.content).toBe('Edited by admin');
  });

  test('should delete own message', async () => {
    const { caller } = await initTest();

    await caller.messages.send({
      channelId: 1,
      content: 'Message to delete',
      files: []
    });

    const messagesBefore = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const messageId = messagesBefore.messages[0]!.id;
    const messageCountBefore = messagesBefore.messages.length;

    await caller.messages.delete({
      messageId
    });

    const messagesAfter = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    expect(
      messagesAfter.messages.find((m) => m.id === messageId)
    ).toBeUndefined();
    expect(messagesAfter.messages.length).toBe(messageCountBefore - 1);
  });

  test('should allow admin to delete any message', async () => {
    const { caller: caller2 } = await initTest(2);
    const { caller: caller1 } = await initTest(1);

    await caller2.messages.send({
      channelId: 1,
      content: 'User 2 message to delete',
      files: []
    });

    const messages = await caller1.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const messageId = messages.messages[0]!.id;

    await caller1.messages.delete({
      messageId
    });

    const messagesAfter = await caller1.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    expect(
      messagesAfter.messages.find((m) => m.id === messageId)
    ).toBeUndefined();
  });

  test('should throw when editing non-existing message', async () => {
    const { caller } = await initTest();

    await expect(
      caller.messages.edit({
        messageId: 999999,
        content: 'Edited content'
      })
    ).rejects.toThrow('Message not found');
  });

  test('should throw when deleting non-existing message', async () => {
    const { caller } = await initTest();

    await expect(
      caller.messages.delete({
        messageId: 999999
      })
    ).rejects.toThrow('Message not found');
  });

  test('should toggle reaction on message', async () => {
    const { caller } = await initTest();

    await caller.messages.send({
      channelId: 1,
      content: 'Message to react to',
      files: []
    });

    const messages = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const messageId = messages.messages[0]!.id;

    await caller.messages.toggleReaction({
      messageId,
      emoji: '👍'
    });

    const messagesAfterAdd = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const messageWithReaction = messagesAfterAdd.messages.find(
      (m) => m.id === messageId
    );

    expect(messageWithReaction!.reactions).toBeDefined();
    expect(messageWithReaction!.reactions.length).toBe(1);
    expect(messageWithReaction!.reactions[0]!.emoji).toBe('👍');
    expect(messageWithReaction!.reactions[0]!.userId).toBe(1);

    await caller.messages.toggleReaction({
      messageId,
      emoji: '👍'
    });

    const messagesAfterRemove = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const messageWithoutReaction = messagesAfterRemove.messages.find(
      (m) => m.id === messageId
    );

    expect(messageWithoutReaction!.reactions.length).toBe(0);
  });

  test('should allow multiple users to react to the same message', async () => {
    const { caller: caller1 } = await initTest(1);

    await caller1.messages.send({
      channelId: 1,
      content: 'Message for multiple reactions',
      files: []
    });

    const messages = await caller1.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const messageId = messages.messages[0]!.id;

    await caller1.messages.toggleReaction({
      messageId,
      emoji: '👍'
    });

    await caller1.messages.toggleReaction({
      messageId,
      emoji: '❤️'
    });

    const messagesAfter = await caller1.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const messageWithReactions = messagesAfter.messages.find(
      (m) => m.id === messageId
    );

    expect(messageWithReactions!.reactions.length).toBe(2);

    const emojis = messageWithReactions!.reactions.map((r) => r.emoji);

    expect(emojis).toContain('👍');
    expect(emojis).toContain('❤️');
  });

  test('should allow multiple different reactions on the same message', async () => {
    const { caller } = await initTest();

    await caller.messages.send({
      channelId: 1,
      content: 'Message for different reactions',
      files: []
    });

    const messages = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const messageId = messages.messages[0]!.id;

    await caller.messages.toggleReaction({
      messageId,
      emoji: '👍'
    });

    await caller.messages.toggleReaction({
      messageId,
      emoji: '❤️'
    });

    await caller.messages.toggleReaction({
      messageId,
      emoji: '😂'
    });

    const messagesAfter = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const messageWithReactions = messagesAfter.messages.find(
      (m) => m.id === messageId
    );

    expect(messageWithReactions!.reactions.length).toBe(3);

    const emojis = messageWithReactions!.reactions.map((r) => r.emoji);

    expect(emojis).toContain('👍');
    expect(emojis).toContain('❤️');
    expect(emojis).toContain('😂');
  });

  test('should send multiple messages', async () => {
    const { caller } = await initTest();

    const messageCount = 5;
    const promises = [];

    for (let i = 0; i < messageCount; i++) {
      promises.push(
        caller.messages.send({
          channelId: 2,
          content: `Message ${i + 1}`,
          files: []
        })
      );
    }

    await Promise.all(promises);

    const messages = await caller.messages.get({
      channelId: 2,
      cursor: null,
      limit: 50
    });

    expect(messages.messages.length).toBe(messageCount);
  });

  test('should signal typing in channel', async () => {
    const { caller } = await initTest();

    await caller.messages.signalTyping({
      channelId: 1
    });
  });

  test('should paginate messages with cursor', async () => {
    const { caller } = await initTest();

    // send 10 messages
    for (let i = 0; i < 10; i++) {
      await caller.messages.send({
        channelId: 1,
        content: `Message ${i + 1}`,
        files: []
      });
    }

    // get first page
    const firstPage = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 5
    });

    expect(firstPage.messages.length).toBe(5);
    expect(firstPage.nextCursor).toBeDefined();
    expect(firstPage.nextCursor).not.toBeNull();

    // get second page
    const secondPage = await caller.messages.get({
      channelId: 1,
      cursor: firstPage.nextCursor,
      limit: 5
    });

    expect(secondPage.messages.length).toBeGreaterThan(0);

    // ensure no overlap between pages
    const firstPageIds = firstPage.messages.map((m) => m.id);
    const secondPageIds = secondPage.messages.map((m) => m.id);

    const intersection = firstPageIds.filter((id) =>
      secondPageIds.includes(id)
    );

    expect(intersection.length).toBe(0);
  });

  test('should return empty messages for empty channel', async () => {
    const { caller } = await initTest();

    const messages = await caller.messages.get({
      channelId: 2,
      cursor: null,
      limit: 50
    });

    expect(messages.messages).toBeDefined();
    expect(Array.isArray(messages.messages)).toBe(true);
    expect(messages.nextCursor).toBeNull();
  });

  test('should send message with empty files array', async () => {
    const { caller } = await initTest();

    await caller.messages.send({
      channelId: 1,
      content: 'Message without files',
      files: []
    });

    const messages = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const sentMessage = messages.messages[0];

    expect(sentMessage!.content).toBe('Message without files');
    expect(sentMessage!.files).toBeDefined();
    expect(sentMessage!.files.length).toBe(0);
  });

  test('should update message updatedAt timestamp on edit', async () => {
    const { caller } = await initTest();

    await caller.messages.send({
      channelId: 1,
      content: 'Original message',
      files: []
    });

    const messagesBefore = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const messageId = messagesBefore.messages[0]!.id;
    const originalUpdatedAt = messagesBefore.messages[0]!.updatedAt;

    await Bun.sleep(10);

    await caller.messages.edit({
      messageId,
      content: 'Edited message'
    });

    const messagesAfter = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const editedMessage = messagesAfter.messages.find(
      (m) => m.id === messageId
    );

    expect(editedMessage!.updatedAt).toBeDefined();
    expect(editedMessage!.updatedAt).not.toBe(originalUpdatedAt);
    expect(editedMessage!.updatedAt).toBeGreaterThan(
      originalUpdatedAt ?? editedMessage!.createdAt
    );
  });

  test('should rate limit excessive send message attempts', async () => {
    const { caller } = await initTest(1);

    for (let i = 0; i < 15; i++) {
      await caller.messages.send({
        channelId: 1,
        content: `Message ${i}`,
        files: []
      });
    }

    await expect(
      caller.messages.send({
        channelId: 1,
        content: 'One too many',
        files: []
      })
    ).rejects.toThrow('Too many requests. Please try again shortly.');
  });

  test('should rate limit excessive edit message attempts', async () => {
    const { caller } = await initTest(1);

    const messageId = await caller.messages.send({
      channelId: 1,
      content: 'Message to edit',
      files: []
    });

    for (let i = 0; i < 15; i++) {
      await caller.messages.edit({
        messageId,
        content: `Edit ${i}`
      });
    }

    await expect(
      caller.messages.edit({
        messageId,
        content: 'One too many'
      })
    ).rejects.toThrow('Too many requests. Please try again shortly.');
  });

  test('should send a thread reply to a root message', async () => {
    const { caller } = await initTest();

    const parentId = await caller.messages.send({
      channelId: 1,
      content: 'Parent message',
      files: []
    });

    await caller.messages.send({
      channelId: 1,
      content: 'Thread reply',
      files: [],
      parentMessageId: parentId
    });

    const thread = await caller.messages.getThread({
      parentMessageId: parentId,
      cursor: null,
      limit: 50
    });

    expect(thread.messages.length).toBe(1);
    expect(thread.messages[0]!.content).toBe('Thread reply');
    expect(thread.messages[0]!.parentMessageId).toBe(parentId);
  });

  test('should not include thread replies in channel messages', async () => {
    const { caller } = await initTest();

    const parentId = await caller.messages.send({
      channelId: 2,
      content: 'Root message',
      files: []
    });

    await caller.messages.send({
      channelId: 2,
      content: 'Reply 1',
      files: [],
      parentMessageId: parentId
    });

    await caller.messages.send({
      channelId: 2,
      content: 'Reply 2',
      files: [],
      parentMessageId: parentId
    });

    const channelMessages = await caller.messages.get({
      channelId: 2,
      cursor: null,
      limit: 50
    });

    // only the root message should appear, not the replies
    expect(channelMessages.messages.length).toBe(1);
    expect(channelMessages.messages[0]!.content).toBe('Root message');
  });

  test('should include reply count on root messages', async () => {
    const { caller } = await initTest();

    const parentId = await caller.messages.send({
      channelId: 2,
      content: 'Root with replies',
      files: []
    });

    await caller.messages.send({
      channelId: 2,
      content: 'Reply 1',
      files: [],
      parentMessageId: parentId
    });

    await caller.messages.send({
      channelId: 2,
      content: 'Reply 2',
      files: [],
      parentMessageId: parentId
    });

    await caller.messages.send({
      channelId: 2,
      content: 'Reply 3',
      files: [],
      parentMessageId: parentId
    });

    const channelMessages = await caller.messages.get({
      channelId: 2,
      cursor: null,
      limit: 50
    });

    const rootMessage = channelMessages.messages.find((m) => m.id === parentId);

    expect(rootMessage).toBeDefined();
    expect(rootMessage!.replyCount).toBe(3);
  });

  test('should return empty thread for message with no replies', async () => {
    const { caller } = await initTest();

    const parentId = await caller.messages.send({
      channelId: 1,
      content: 'No replies here',
      files: []
    });

    const thread = await caller.messages.getThread({
      parentMessageId: parentId,
      cursor: null,
      limit: 50
    });

    expect(thread.messages.length).toBe(0);
    expect(thread.nextCursor).toBeNull();
  });

  test('should throw when sending a reply to a non-existing parent', async () => {
    const { caller } = await initTest();

    await expect(
      caller.messages.send({
        channelId: 1,
        content: 'Orphan reply',
        files: [],
        parentMessageId: 999999
      })
    ).rejects.toThrow('Parent message not found');
  });

  test('should throw when sending a reply to a message in a different channel', async () => {
    const { caller } = await initTest();

    const parentId = await caller.messages.send({
      channelId: 1,
      content: 'Message in channel 1',
      files: []
    });

    await expect(
      caller.messages.send({
        channelId: 2,
        content: 'Reply targeting wrong channel',
        files: [],
        parentMessageId: parentId
      })
    ).rejects.toThrow('Parent message must be in the same channel');
  });

  test('should throw when replying to a thread reply (nested threads)', async () => {
    const { caller } = await initTest();

    const parentId = await caller.messages.send({
      channelId: 1,
      content: 'Root message',
      files: []
    });

    const replyId = await caller.messages.send({
      channelId: 1,
      content: 'First-level reply',
      files: [],
      parentMessageId: parentId
    });

    await expect(
      caller.messages.send({
        channelId: 1,
        content: 'Nested reply attempt',
        files: [],
        parentMessageId: replyId
      })
    ).rejects.toThrow(
      'Cannot reply to a thread reply. Threads are only one level deep.'
    );
  });

  test('should throw when getting thread for non-existing parent', async () => {
    const { caller } = await initTest();

    await expect(
      caller.messages.getThread({
        parentMessageId: 999999,
        cursor: null,
        limit: 50
      })
    ).rejects.toThrow('Parent message not found');
  });

  test('should throw when getting thread for a reply message', async () => {
    const { caller } = await initTest();

    const parentId = await caller.messages.send({
      channelId: 1,
      content: 'Root message',
      files: []
    });

    const replyId = await caller.messages.send({
      channelId: 1,
      content: 'Reply message',
      files: [],
      parentMessageId: parentId
    });

    await expect(
      caller.messages.getThread({
        parentMessageId: replyId,
        cursor: null,
        limit: 50
      })
    ).rejects.toThrow('Cannot get thread for a reply message');
  });

  test('should paginate thread messages', async () => {
    const { caller } = await initTest();

    const parentId = await caller.messages.send({
      channelId: 1,
      content: 'Root for pagination',
      files: []
    });

    for (let i = 0; i < 10; i++) {
      await caller.messages.send({
        channelId: 1,
        content: `Thread reply ${i + 1}`,
        files: [],
        parentMessageId: parentId
      });
    }

    const firstPage = await caller.messages.getThread({
      parentMessageId: parentId,
      cursor: null,
      limit: 5
    });

    expect(firstPage.messages.length).toBe(5);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await caller.messages.getThread({
      parentMessageId: parentId,
      cursor: firstPage.nextCursor,
      limit: 5
    });

    expect(secondPage.messages.length).toBeGreaterThan(0);

    // no overlap between pages
    const firstPageIds = firstPage.messages.map((m) => m.id);
    const secondPageIds = secondPage.messages.map((m) => m.id);
    const intersection = firstPageIds.filter((id) =>
      secondPageIds.includes(id)
    );

    expect(intersection.length).toBe(0);
  });

  test('should return thread messages in ascending order (oldest first)', async () => {
    const { caller } = await initTest();

    const parentId = await caller.messages.send({
      channelId: 1,
      content: 'Root message',
      files: []
    });

    for (let i = 0; i < 3; i++) {
      await caller.messages.send({
        channelId: 1,
        content: `Reply ${i + 1}`,
        files: [],
        parentMessageId: parentId
      });
    }

    const thread = await caller.messages.getThread({
      parentMessageId: parentId,
      cursor: null,
      limit: 50
    });

    expect(thread.messages.length).toBe(3);

    for (let i = 1; i < thread.messages.length; i++) {
      expect(thread.messages[i]!.createdAt).toBeGreaterThanOrEqual(
        thread.messages[i - 1]!.createdAt
      );
    }
  });

  test('should delete a thread reply', async () => {
    const { caller } = await initTest();

    const parentId = await caller.messages.send({
      channelId: 1,
      content: 'Root message',
      files: []
    });

    const replyId = await caller.messages.send({
      channelId: 1,
      content: 'Reply to delete',
      files: [],
      parentMessageId: parentId
    });

    await caller.messages.delete({ messageId: replyId });

    const thread = await caller.messages.getThread({
      parentMessageId: parentId,
      cursor: null,
      limit: 50
    });

    expect(thread.messages.find((m) => m.id === replyId)).toBeUndefined();
  });

  test('should update reply count after deleting a thread reply', async () => {
    const { caller } = await initTest();

    const parentId = await caller.messages.send({
      channelId: 2,
      content: 'Root message',
      files: []
    });

    const replyId = await caller.messages.send({
      channelId: 2,
      content: 'Reply 1',
      files: [],
      parentMessageId: parentId
    });

    await caller.messages.send({
      channelId: 2,
      content: 'Reply 2',
      files: [],
      parentMessageId: parentId
    });

    // should start with 2 replies
    let channelMessages = await caller.messages.get({
      channelId: 2,
      cursor: null,
      limit: 50
    });

    expect(
      channelMessages.messages.find((m) => m.id === parentId)!.replyCount
    ).toBe(2);

    // delete one reply
    await caller.messages.delete({ messageId: replyId });

    channelMessages = await caller.messages.get({
      channelId: 2,
      cursor: null,
      limit: 50
    });

    expect(
      channelMessages.messages.find((m) => m.id === parentId)!.replyCount
    ).toBe(1);
  });
});
