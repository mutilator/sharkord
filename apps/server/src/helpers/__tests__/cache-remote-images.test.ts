import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { config } from '../../config';

// tests for remote image caching behaviour

describe('cache-remote-images helper', () => {
  let origFetch: typeof global.fetch;

  beforeEach(() => {
    origFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = origFetch;
  });

  test('extensionless URL uses content-type to pick extension', async () => {
    const { rewriteRemoteImages } = await import('../cache-remote-images');

(global as any).fetch = async (url: string) => {
      return {
        ok: true,
        arrayBuffer: async () => Buffer.from('foo'),
        headers: { get: () => 'image/png' }
      } as any;
    };

    const html = await rewriteRemoteImages('<img src="https://foo/bar" />');
    expect(html).toMatch(/src="\/remote\/[0-9a-f]+\.png"/);
  });

  test('timeout is honoured when download takes too long', async () => {
    // shorten timeout for test
    config.cache.remoteImageTimeoutMs = 1;
    config.cache.remoteImageMaxBytes = 1000000;

    const { cacheImage } = await import('../cache-remote-images');

    (global as any).fetch = (url: string, opts: any) => {
      return new Promise((_res, rej) => {
        if (opts && opts.signal) {
          opts.signal.addEventListener('abort', () => {
            rej(new Error('aborted'));
          });
        }
        // otherwise never resolve
      });
    };

    await expect(cacheImage('https://foo/slow')).rejects.toThrow(/abort/i);
  });

  test('size limit is enforced during streaming download', async () => {
    config.cache.remoteImageTimeoutMs = 5000;
    config.cache.remoteImageMaxBytes = 5;

    const { cacheImage } = await import('../cache-remote-images');

    (global as any).fetch = async (url: string) => {
      return {
        ok: true,
        body: {
          getReader: () => ({
            read: async () => ({ done: false, value: new Uint8Array(10) })
          })
        },
        headers: { get: () => 'image/png' }
      } as any;
    };

    await expect(cacheImage('https://foo/big')).rejects.toThrow(
      /size limit/i
    );
  });

  test('normalizes HTML-encoded ampersands when caching', async () => {
    // ensure we hit the normalization branch
    const { cacheImage, rewriteMetadataUrls, rewriteRemoteImages } = await import('../cache-remote-images');

    // patch fetch to record requested url and return dummy data
    let fetchedUrl: string | null = null;
    (global as any).fetch = async (url: string) => {
      fetchedUrl = url;
      return {
        ok: true,
        arrayBuffer: async () => Buffer.from('img'),
        headers: { get: () => 'image/png' }
      } as any;
    };

    const encoded = 'https://example.com/foo.jpg?x=1&amp;y=2&amp;';
    const local = await cacheImage(encoded);
    expect(local).toMatch(/^\/remote\/[0-9a-f]+\.jpg$/);
    expect(fetchedUrl!).toBe('https://example.com/foo.jpg?x=1&y=2');

    // url fields are intentionally left untouched; only image URLs are
    // cached/re-written. include both so we exercise the normalization logic
    // on metadata as well as HTML.
    const meta = await rewriteMetadataUrls([
      { url: encoded, image: { url: encoded } } as any
    ]);

    expect(meta[0].url).toBe(encoded); // top-level url preserved
    expect(meta[0].image.url).toMatch(/^\/remote\//); // rewritten

    // rewrite in HTML
    const html = await rewriteRemoteImages(`<img src="${encoded}" />`);
    expect(html).toBe(`<img src="${local}" />`);

    // also rewrite anchor links
    const html2 = await rewriteRemoteImages(`<a href="${encoded}">link</a>`);
    expect(html2).toBe(`<a href="${local}">link</a>`);
  });

  test('metadata url field is preserved but image url rewritten', async () => {
    const { rewriteMetadataUrls, cacheImage } = await import('../cache-remote-images');

    const metadata = [
      {
        url: 'https://example.com/page',
        image: { url: 'https://example.com/image.png' }
      }
    ];

    // compute what the local path will be (the function is deterministic
    // given our fetch stub below).
    const origFetch = global.fetch;
    (global as any).fetch = async (url: string) => {
      return {
        ok: true,
        arrayBuffer: async () => Buffer.from('fake'),
        headers: { get: () => 'image/png' }
      } as any;
    };
    const expectedLocal = await cacheImage(metadata[0]!.image!.url);
    global.fetch = origFetch as any;

    const rewritten = await rewriteMetadataUrls(metadata as any);

    expect(rewritten[0].url).toBe('https://example.com/page');
    expect(rewritten[0].image.url).toBe(expectedLocal);
  });
});
