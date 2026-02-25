import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { TMessageMetadata } from '@sharkord/shared';

// component that renders the same card we previously inlined in serializer

type TPreviewOverrideProps = {
  meta: TMessageMetadata;
  href: string;
};

const PreviewOverride = memo(({ meta, href }: TPreviewOverrideProps) => {
  const imageUrl = meta.image?.url || (Array.isArray(meta.images) ? meta.images[0] : undefined);
  const hostname = (() => {
    try {
      return new URL(href).hostname;
    } catch {
      return '';
    }
  })();

  // video metadata
  const hasVideo = Array.isArray(meta.videos) && meta.videos.length > 0;
  const isVideo = meta.mediaType?.startsWith('video');

  if (hasVideo || isVideo) {
    const videoUrl =
      typeof meta.videos?.[0] === 'string'
        ? meta.videos![0]
        : meta.videos?.[0]?.url || href;
    return (
      <div key={`meta-video-${href}`} className="mt-2 max-w-[432px] w-full">
        {(meta.title || meta.description) && (
          <div className="px-2 pt-2">
            {meta.title && (
              <div className="font-medium text-blue-600 hover:underline">
                {meta.title}
              </div>
            )}
            {meta.description && (
              <p className="text-sm text-gray-600 mt-1">
                {meta.description}
              </p>
            )}
          </div>
        )}
        <video
          controls
          src={videoUrl}
          poster={imageUrl}
          className="w-full h-auto"
        >
          Your browser does not support the video tag.
        </video>
      </div>
    );
  }

  if (meta.mediaType === 'image' && imageUrl) {
    // serializer now renders simple image metadata inline, so nothing to do here
    return null;
  }

  // link card
  return (
    <div
      key={`meta-${href}`}
      className="mt-2 border-l-4 border-gray-300 rounded overflow-hidden max-w-[432px] w-full flex flex-col"
    >
      <div className="p-2">
        {hostname && (
          <div className="text-xs text-gray-500 mb-1">{hostname}</div>
        )}
        {meta.siteName && meta.siteName !== hostname && (
          <div className="text-xs text-gray-500 mb-1">{meta.siteName}</div>
        )}
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-blue-600 hover:underline block"
        >
          {meta.title || href}
        </a>
        {meta.description && (
          <p className="text-sm text-gray-600 mt-1">
            {meta.description}
          </p>
        )}
      </div>
      {imageUrl && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full"
        >
          <div className="relative">
            <img
              src={imageUrl}
              alt={meta.title || 'preview'}
              // images inside .msg-content inherit a small fixed size; we
              // need to force their natural dimensions here.
              className="!h-auto !w-auto w-full h-auto object-cover"
            />
            {meta.mediaType?.startsWith('video') && (
              <div className="absolute inset-0 flex items-center justify-center text-white text-4xl bg-black bg-opacity-20">
                ▶
              </div>
            )}
          </div>
        </a>
      )}
    </div>
  );
});

export { PreviewOverride };
