import { memo } from 'react';
import LiteYouTubeEmbed from 'react-lite-youtube-embed';
import 'react-lite-youtube-embed/dist/LiteYouTubeEmbed.css';
import { OverrideLayout } from './layout';
import type { TMessageMetadata } from '@sharkord/shared/src/types';

type TYoutubeOverrideProps = {
  meta: TMessageMetadata;
  videoId: string;
};

const YoutubeOverride = memo(({ meta, videoId }: TYoutubeOverrideProps) => {
  return (
    <OverrideLayout>
      <div className="aspect-w-16 aspect-h-9 w-[600px]">
        <LiteYouTubeEmbed
          id={videoId}
          title={meta.title || 'YouTube video'}
        />
      </div>
    </OverrideLayout>
  );
});

export { YoutubeOverride };
