import { Keyboard } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';

type Hotkey = {
  keycode?: number;
  button?: number;
  alt: boolean;
  ctrl: boolean;
  shift: boolean;
  meta: boolean;
};

type PttKey = { hotkey: Hotkey; name: string } | null;

const PttSettings = memo(() => {
  const [open, setOpen] = useState(false);
  const [currentKey, setCurrentKey] = useState<PttKey>(null);
  const [hotkeysAvailable, setHotkeysAvailable] = useState<boolean>(true);
  const [recording, setRecording] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load current PTT key on mount and watch hotkey availability
  useEffect(() => {
    const api = (window as any).electronAPI;
    api?.getPushToTalkKey?.().then((k: PttKey) => setCurrentKey(k));

    const availHandler = (_: any, avail: boolean) => setHotkeysAvailable(avail);
    api?.onHotkeysAvailability?.(availHandler);

    const debugHandler = (_: any, data: any) => {
      //console.log('[hotkeys debug]', data);
    };
    api?.onHotkeysDebug?.(debugHandler);

    return () => {
      api?.offHotkeysAvailability?.(availHandler);
      api?.offHotkeysDebug?.(debugHandler);
    };
  }, []);

  // Close panel when clicking outside
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        if (recording) {
          (window as any).electronAPI?.cancelRecordPushToTalkKey?.();
          setRecording(false);
        }
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, recording]);

  const startRecording = async () => {
    const api = (window as any).electronAPI;
    if (!api?.recordPushToTalkKey) return;
    console.log('PTT: start recording');
    setRecording(true);
    setStatusMsg(null);
    const result: PttKey = await api.recordPushToTalkKey();
    console.log('PTT: record result', JSON.stringify(result));
    setRecording(false);
    if (result) {
      // persist through handler as well
      api?.setPushToTalkKey?.(result.hotkey);
      setCurrentKey(result);
      setStatusMsg(`PTT set to: ${result.name}`);
    } else {
      setStatusMsg('Cancelled');
    }
    setTimeout(() => setStatusMsg(null), 2000);
  };

  return (
    <div className="relative h-full flex items-center">
      <button
        className="h-full px-3 flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-colors"
        onClick={() => setOpen((v) => !v)}
        title="Push-to-talk settings"
      >
        <Keyboard className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-9 w-56 rounded-lg border border-white/10 bg-[#1a1a1a] shadow-xl p-3 z-[10000] flex flex-col gap-2"
        >
          <p className="text-xs font-semibold text-white/70 uppercase tracking-wider">
            Push-to-Talk
          </p>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-white/50">Current key</span>
            <span className="text-xs font-mono bg-white/10 rounded px-1.5 py-0.5 text-white/80">
              {currentKey?.name ?? 'None'}
            </span>
          </div>

          {recording ? (
            <div className="mt-1 rounded bg-white/5 border border-white/10 p-2 text-center">
              <p className="text-xs text-white/60 animate-pulse">
                Press any key…
              </p>
              <button
                className="mt-1 text-[10px] text-white/30 hover:text-white/60 transition-colors"
                onClick={() => {
                  (window as any).electronAPI?.cancelRecordPushToTalkKey?.();
                  setRecording(false);
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="mt-1 w-full rounded bg-white/10 hover:bg-white/20 transition-colors text-xs text-white/70 py-1.5"
              onClick={startRecording}
            >
              Change key
            </button>
          )}

          {statusMsg && (
            <p className="text-xs text-center text-green-400/80">{statusMsg}</p>
          )}

          <p className="text-[10px] text-white/25 leading-tight">
            Works globally even when the window is not focused.
          </p>
          {!hotkeysAvailable && (
            <p className="text-[10px] text-red-400 leading-tight">
              Global hotkeys are not available on this system; hold window "in
              focus" to transmit.
            </p>
          )}
        </div>
      )}
    </div>
  );
});

PttSettings.displayName = 'PttSettings';

export { PttSettings };
