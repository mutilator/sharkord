/// <reference types="vite/client" />

declare const VITE_APP_VERSION: string;

interface Window {
  electronAPI?: {
    onPushToTalkStart: (callback: () => void) => void;
    onPushToTalkStop: (callback: () => void) => void;
    setPushToTalkKey: (key: string) => Promise<void>;
    getPushToTalkKey: () => Promise<string>;
  };
}
