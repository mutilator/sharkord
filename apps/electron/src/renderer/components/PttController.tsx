import { getVoiceControlsBridge } from '@/components/voice-provider/controls-bridge';
import { useCurrentVoiceChannelId } from '@/features/server/channels/hooks';
import { Mic } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';

const PttController = memo(() => {
  const [pttActive, setPttActive] = useState(false);
  const currentVoiceChannelId = useCurrentVoiceChannelId();
  // Use a ref so handlers always read the latest channel ID without re-registering
  const channelIdRef = useRef(currentVoiceChannelId);
  useEffect(() => {
    channelIdRef.current = currentVoiceChannelId;
  }, [currentVoiceChannelId]);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api) return;

    const handlePttStart = () => {
      setPttActive(true);
      if (channelIdRef.current) {
        // PTT pressed → unmute microphone
        getVoiceControlsBridge()?.setMicMuted(false);
      }
    };

    const handlePttStop = () => {
      setPttActive(false);
      if (channelIdRef.current) {
        // PTT released → mute microphone
        getVoiceControlsBridge()?.setMicMuted(true);
      }
    };

    api.onPushToTalkStart?.(handlePttStart);
    api.onPushToTalkStop?.(handlePttStop);

    return () => {
      api.offPushToTalkStart?.(handlePttStart);
      api.offPushToTalkStop?.(handlePttStop);
    };
  }, []);

  // Only show indicator while actively transmitting in a voice channel
  if (!pttActive || !currentVoiceChannelId) return null;

  return (
    <div
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9998] flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/15 border border-green-500/50 backdrop-blur-sm pointer-events-none"
    >
      <Mic className="h-4 w-4 text-green-400 animate-pulse" />
      <span className="text-xs font-semibold text-green-400 tracking-wide">Transmitting</span>
    </div>
  );
});

PttController.displayName = 'PttController';

export { PttController };
