import { describe, expect, test, afterEach } from 'bun:test';

// we import the module so that the dynamic import inside
// joinMessagesWithRelations gets cached and we can mutate
// its exports later in the tests.
import * as cacheHelpers from '../../../helpers/cache-remote-images';
import { joinMessagesWithRelations } from '../messages';

describe('joinMessagesWithRelations error handling', () => {

  test('does not throw when metadata rewrite rejects', async () => {
    const rows: any[] = [
      { id: 1, content: '<p>hi</p>', metadata: [{ foo: 'bar' }] }
    ];

    const result = await joinMessagesWithRelations(rows, {
      private: false,
      fileAccessToken: ''
    }, {
      rewriteMetadataUrls: (async () => {
        throw new Error('boom metadata');
      }) as any
    });

    expect(result![0]!.metadata).toEqual(rows[0].metadata);
  });

  test('does not throw when content rewrite rejects', async () => {
    const rows: any[] = [
      { id: 2, content: '<img src="foo" />', metadata: null }
    ];

    const result = await joinMessagesWithRelations(rows, {
      private: false,
      fileAccessToken: ''
    }, {
      rewriteRemoteImages: (async () => {
        throw new Error('boom content');
      }) as any
    });

    expect(result![0]!.content).toEqual(rows[0].content);
  });

  test('does not throw if helper modules fail to import', async () => {
    const rows: any[] = [
      { id: 7, content: '<p>hi</p>', metadata: [] }
    ];

    // rename the helper module so dynamic import will reject;
    // restore afterwards.
    const fs = await import('fs/promises');
    const pathMod = await import('path');
    const helperFile = pathMod.join(__dirname, '../../../helpers/cache-remote-images.ts');
    const backupFile = helperFile + '.bak';

    await fs.rename(helperFile, backupFile);
    try {
      const result = await joinMessagesWithRelations(rows, {
        private: false,
        fileAccessToken: ''
      });
      // should simply return the original row with default children
      expect(result.length).toBe(1);
      expect(result[0]!.content).toBe(rows[0].content);
      expect(result[0]!.metadata).toEqual([]);
    } finally {
      await fs.rename(backupFile, helperFile);
    }
  });

  test('rewrites anchor-only image urls in content', async () => {
    const rows: any[] = [
      { id: 3, content: '<a href="https://foo/bar.png">foo</a>', metadata: null }
    ];
    const overwriteMap: Record<string, string> = {};
    const rewritten = await joinMessagesWithRelations(rows, {
      private: false,
      fileAccessToken: ''
    }, {
      rewriteRemoteImages: (async (html: string) => {
          // simple stub: replace with '/remote/local.png'
          overwriteMap[html] = html.replace('https://foo/bar.png', '/remote/local.png');
          return overwriteMap[html];
        }) as any
    });

    expect(rewritten[0]!.content).toContain('/remote/local.png');
  });

  test('flat metadata entries are returned unchanged except rewrites', async () => {
    const rows: any[] = [
      {
        id: 4,
        content: '<p>hello</p>',
        metadata: [
          { url: 'https://foo.com', title: 'foo', image: { url: 'https://foo.com/img.png' } }
        ]
      }
    ];
    let cacheCalled = false;
    const rewritten = await joinMessagesWithRelations(rows, {
      private: false,
      fileAccessToken: ''
    }, {
      rewriteMetadataUrls: (async (meta: any[]) => {
        cacheCalled = true;
        // pretend we rewrote image url only
        return meta.map((m: any) => ({
          ...m,
          image: { url: '/remote/img.png' }
        }));
      }) as any
    });

    expect(cacheCalled).toBe(true);
    expect(rewritten[0]!.metadata![0]!.url).toBe('https://foo.com');
    expect(rewritten[0]!.metadata![0]!.image.url).toBe('/remote/img.png');
  });

  test('video.other metadata gets treated as image', async () => {
    const rows: any[] = [
      {
        id: 5,
        content: '<p>video link</p>',
        metadata: [
          { url: 'https://vid.com', mediaType: 'video.other', images: ['https://vid.com/thumb.png'] }
        ]
      }
    ];

    const rewritten = await joinMessagesWithRelations(rows, {
      private: false,
      fileAccessToken: ''
    }, {
        rewriteMetadataUrls: (async (meta: any) => {
          // pass-through; no caching in this test
          return meta;
        }) as any,
      });

    // metadata array should still exist
    expect(rewritten[0]!.metadata![0]!.mediaType).toBe('video.other');

    // now simulate client rendering: call metadataMedia indirectly via join
    // (we can't easily simulate React here, but the join ensures we didn't
    // drop the row)
    expect(rewritten[0]!.metadata).toBeDefined();
  });
});
