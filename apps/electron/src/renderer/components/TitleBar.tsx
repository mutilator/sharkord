import { useIsConnected, useServerName } from '@/features/server/hooks';
import { Minus, Square, X } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { PttSettings } from './PttSettings';

const TitleBar = memo(() => {
  const serverName = useServerName();
  const isConnected = useIsConnected();
  const title = isConnected && serverName ? `${serverName} - Sharkord` : 'Sharkord';

  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const api = (window as any).electronAPI;
    const handler = (_: any, maximized: boolean) => setIsMaximized(maximized);
    api?.onWindowMaximized?.(handler);
    return () => api?.offWindowMaximized?.(handler);
  }, []);

  const minimize = () => (window as any).electronAPI?.minimizeWindow?.();
  const maximize = () => (window as any).electronAPI?.maximizeWindow?.();
  const close = () => (window as any).electronAPI?.closeWindow?.();

  return (
    <div
      className="fixed left-0 right-0 h-8 z-[9999] flex items-center bg-black/90 border-b border-white/5 select-none"
      style={{ top: isMaximized ? 8 : 0, WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* App icon / left spacer */}
      <div className="w-11 flex-shrink-0" />

      {/* Title centred */}
      <span className="flex-1 text-center text-xs font-medium text-white/40 truncate px-2">
        {title}
      </span>

      {/* PTT settings + Window controls */}
      <div
        className="flex h-full flex-shrink-0 items-center"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <PttSettings />
        <button
          className="h-full w-11 flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-colors"
          onClick={minimize}
          title="Minimize"
        >
          <Minus className="h-3 w-3" />
        </button>
        <button
          className="h-full w-11 flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-colors"
          onClick={maximize}
          title="Maximize / Restore"
        >
          <Square className="h-3 w-3" />
        </button>
        <button
          className="h-full w-11 flex items-center justify-center text-white/40 hover:bg-red-500 hover:text-white transition-colors"
          onClick={close}
          title="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
});

TitleBar.displayName = 'TitleBar';

export { TitleBar };
