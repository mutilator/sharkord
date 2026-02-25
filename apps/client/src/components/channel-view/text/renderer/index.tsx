import { requestConfirmation } from '@/features/dialogs/actions';
import { useOwnUserId } from '@/features/server/users/hooks';
import { getFileUrl } from '@/helpers/get-file-url';
import { getTRPCClient } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import {
  imageExtensions,
  isEmojiOnlyMessage,
  type TJoinedMessage
} from '@sharkord/shared';
import parse from 'html-react-parser';
import { memo, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { FileCard } from '../file-card';
import { MessageReactions } from '../message-reactions';
import { serializer } from './serializer';
import { ImageOverride } from '../overrides/image';

type TMessageRendererProps = {
  message: TJoinedMessage;
};

const MessageRenderer = memo(({ message }: TMessageRendererProps) => {
  const ownUserId = useOwnUserId();
  const isOwnMessage = useMemo(
    () => message.userId === ownUserId,
    [message.userId, ownUserId]
  );

  const emojiOnly = useMemo(
    () => isEmojiOnlyMessage(message.content),
    [message.content]
  );

  const messageHtml = useMemo(() => {
    const metadataMap = new Map<string, any>();
    const normalize = (u: string) => {
      try {
        return new URL(u).toString();
      } catch {
        return u;
      }
    };
    (message.metadata || []).forEach((m) => {
      if (m && typeof m.url === 'string') {
        metadataMap.set(normalize(m.url), m);
      }
    });

    return parse(message.content ?? '', {
      replace: (domNode) => serializer(domNode, message.id, metadataMap)
    });
  }, [message.content, message.metadata, message.id]);

  // uploaded image files should also appear inline below the message rather
  // than only as a separate file card. this mirrors the previous
  // "allMedia" logic that combined foundMedia and file images.
  const imageFiles = useMemo(
    () =>
      message.files
        .filter((file) =>
          imageExtensions.includes(file.extension.toLowerCase())
        )
        .map((file) => ({
          url: getFileUrl(file),
          label: file.originalName
        })),
    [message.files]
  );

  // metadata and rich previews are fully handled by serializer via metadataMap;
  // plain <img> tags and image links are converted into ImageOverride by the
  // serializer so they aren't collapsed by the global msg-content stylesheet.

  const onRemoveFileClick = useCallback(async (fileId: number) => {
    if (!fileId) return;

    const choice = await requestConfirmation({
      title: 'Delete file',
      message: 'Are you sure you want to delete this file?',
      confirmLabel: 'Delete'
    });

    if (!choice) return;

    const trpc = getTRPCClient();

    try {
      await trpc.files.delete.mutate({
        fileId
      });

      toast.success('File deleted');
    } catch {
      toast.error('Failed to delete file');
    }
  }, []);


  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          'prose max-w-full wrap-break-word msg-content',
          emojiOnly && 'emoji-only'
        )}
      >
        {messageHtml}
      </div>


      <MessageReactions reactions={message.reactions} messageId={message.id} />

      {/* render inline image uploads */}
      {imageFiles.map((file, index) => (
        <ImageOverride
          key={`file-image-${index}`}
          src={file.url}
          label={file.label}
        />
      ))}

      {message.files.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {message.files.map((file) => (
            <FileCard
              key={file.id}
              name={file.originalName}
              extension={file.extension}
              size={file.size}
              onRemove={
                isOwnMessage ? () => onRemoveFileClick(file.id) : undefined
              }
              href={getFileUrl(file)}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export { MessageRenderer };
