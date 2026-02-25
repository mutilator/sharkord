import { imageExtensions, parseDomCommand } from '@sharkord/shared';
import { Element, type DOMNode } from 'html-react-parser';
import { CommandOverride } from '../overrides/command';
import { TwitterOverride } from '../overrides/twitter';
import { YoutubeOverride } from '../overrides/youtube';
import { PreviewOverride } from '../overrides/preview';
import { ImageOverride } from '../overrides/image';

const twitterRegex = /https:\/\/(twitter|x).com\/\w+\/status\/(\d+)/g;
const youtubeRegex =
  /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;

const serializer = (
  domNode: DOMNode,
  messageId: number,
  metadataMap?: Map<string, any>
) => {
  try {
    // convert any <img> elements into our override component so that they
    // bypass the global `.msg-content img` size rule and gain fullscreen
    // behaviour. this handles images inserted directly by users or plugins.
    if (domNode instanceof Element && domNode.name === 'img') {
      const src = domNode.attribs.src;
      if (src) {
        return <ImageOverride src={src} alt={domNode.attribs.alt} />;
      }
      return null;
    }

    if (domNode instanceof Element && domNode.name === 'a') {
      const href = domNode.attribs.href;
      if (!href) return null;

      // detect image links by extension even if the URL class refuses to
      // parse them (some contain stray HTML entities or other invalid
      // characters).  stripping query parameters first makes sure we look at
      // the actual path segment.
      const cleanHref = href.split('?')[0].toLowerCase();
      const isImage = imageExtensions.some((ext) => cleanHref.endsWith(ext));
      if (isImage) {
        // turn an image link into a standalone image component instead of
        // rendering the <a> or its text.
        const textLabel =
          domNode.children && domNode.children[0] && 'data' in domNode.children[0]
            ? (domNode.children[0] as any).data
            : href;
        return <ImageOverride src={href} label={textLabel} />;
      }

      // the more complex previews (twitter/youtube) require a valid URL object
      if (!URL.canParse(href)) {
        return null;
      }
      const normalize = (u: string) => {
        try {
          return new URL(u).toString();
        } catch {
          return u;
        }
      };
      const url = new URL(href);
      const m = metadataMap!.get(normalize(href));
      

      const isTweet =
        url.hostname.match(/(twitter|x).com/) && href.match(twitterRegex);
      const isYoutube =
        url.hostname.match(/(youtube.com|youtu.be)/) &&
        href.match(youtubeRegex);

      if (isTweet) {
        const tweetId = href.match(twitterRegex)?.[0].split('/').pop();

        if (tweetId) {
          return <TwitterOverride tweetId={tweetId} />;
        }
      } else if (isYoutube) {
        const videoId = href.match(
          /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/
        )?.[7];

        if (videoId) {
          return <YoutubeOverride meta={m} videoId={videoId} />;
        }
      }
      // if metadata provided and this URL has an entry, render appropriate
      // element. this covers `website` entries in particular (the old
      // renderer used to only treat them as "links"), as well as videos,
      // images, etc. we no longer push a media object for links; the serializer
      // itself produces the card/video/image nodes.
      
      if (m && !(isTweet || isYoutube)) {
        // inline purely-image metadata as a normal image override
        if (m.mediaType === 'image') {
          const imageUrl = m.image?.url || (Array.isArray(m.images) ? m.images[0] : undefined);
          if (imageUrl) {
            return <ImageOverride src={imageUrl} />;
          }
        }
        // delegate other types to the override component
        return <PreviewOverride meta={m} href={href} />;
      }
    
      // no metadata or not rendered; continue falling through to other parser
    } else if (domNode instanceof Element && domNode.name === 'command') {
      const command = parseDomCommand(domNode);

      return <CommandOverride command={command} />;
    }
  } catch (error) {
    console.error(`Error parsing DOM node for message ID ${messageId}:`, error);
  }

  return undefined;
};

export { serializer };
