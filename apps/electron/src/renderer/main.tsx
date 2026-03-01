import { Toaster } from '@sharkord/ui';
import 'prosemirror-view/style/prosemirror.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { DevicesProvider } from '@/components/devices-provider/index.tsx';
import { DialogsProvider } from '@/components/dialogs/index.tsx';
import { PluginsController } from '@/components/plugins-controller/index.tsx';
import { Routing } from '@/components/routing/index.tsx';
import { ServerScreensProvider } from '@/components/server-screens/index.tsx';
import { ThemeProvider } from '@/components/theme-provider/index.tsx';
import { store } from '@/features/store.ts';
import { LocalStorageKey } from '@/helpers/storage.ts';
import { PttController } from './components/PttController.tsx';
import { TitleBar } from './components/TitleBar.tsx';
import './index.css';

console.log('renderer entrypoint running');
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider
      defaultTheme="dark"
      storageKey={LocalStorageKey.VITE_UI_THEME}
    >
      <Toaster />
      <Provider store={store}>
          <TitleBar />
          <PttController />
          <DevicesProvider>
            <PluginsController />
            <DialogsProvider />
            <ServerScreensProvider />
            <Routing />
          </DevicesProvider>
      </Provider>
      {/* log after render start */}
      {console.log('render tree mounted')}
    </ThemeProvider>
  </StrictMode>,
);

// Hide loading screen once app is mounted
setTimeout(() => {
  if (typeof window.hideLoadingScreen === 'function') {
    window.hideLoadingScreen();
  }
}, 100);

