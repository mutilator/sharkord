import parse from 'html-react-parser';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { serializer } from '../serializer';

// the serializer uses html-react-parser's DOMNode objects; the easiest way to
// obtain one is to run parse with a temporary replacer that captures it. the
// tests below basically replicate the same path the real renderer follows and
// assert that the resulting React tree contains the expected card/override.

describe('message serializer', () => {
  function extractNode(html: string) {
    let captured: any = null;
    // run parse only to get the DOM node; we don't care about the output
    parse(html, {
      replace: (node) => {
        if (!captured) captured = node;
        return null;
      }
    });
    return captured;
  }

  it('renders an anchor with website metadata as a preview card', () => {
    const href = 'https://example.com/page';
    const metadataMap = new Map<string, any>();
    metadataMap.set(new URL(href).toString(), {
      url: href,
      mediaType: 'website',
      title: 'Example page',
      description: 'An example description',
      siteName: 'ExampleSite'
    });

    const domNode = extractNode(`<a href="${href}">link text</a>`);
    const element = serializer(domNode, 123, metadataMap);

    // the serializer should return a React element (PreviewOverride)
    expect(React.isValidElement(element)).toBe(true);

    const rendered = renderToString(<>{element}</>);
    expect(rendered).toContain('Example page');
    expect(rendered).toContain('An example description');
    expect(rendered).toContain('ExampleSite');

    // verify the img in the preview card includes the forced auto sizing
    expect(rendered).toMatch(/class="[^"]*!h-auto[^"]*!w-auto[^"]*"/);
  });

  it('does not transform a plain link when no metadata exists', () => {
    const href = 'https://no-metadata.example/';
    const domNode = extractNode(`<a href="${href}">foo</a>`);
    const element = serializer(domNode, 1, new Map());

    // without metadata the serializer returns undefined and parser will
    // render the original <a> element; make sure we didn't fabricate a card.
    expect(element).toBeUndefined();
  });
  it('renders image metadata inline via ImageOverride', () => {
    const href = 'https://example.com/pic.jpg';
    const metadataMap = new Map<string, any>();
    metadataMap.set(new URL(href).toString(), {
      url: href,
      mediaType: 'image',
      images: [href]
    });

    const domNode = extractNode(`<a href=\"${href}\">photo</a>`);
    const element = serializer(domNode, 2, metadataMap);

    // should return an ImageOverride element (renders <img> inside)
    expect(React.isValidElement(element)).toBe(true);
    const rendered = renderToString(<>{element}</>);
    expect(rendered).toContain('src="https://example.com/pic.jpg"');
  });

  it('converts inline <img> tags to ImageOverride', () => {
    const src = 'https://example.com/foo.png';
    const domNode = extractNode(`<img src=\"${src}\" alt=\"foo\" />`);
    const element = serializer(domNode, 3, new Map());

    expect(React.isValidElement(element)).toBe(true);
    const rendered = renderToString(<>{element}</>);
    expect(rendered).toContain('src="https://example.com/foo.png"');
    // should not render the original <img> tag directly
    expect(rendered).not.toContain('<img src="');
  });});
