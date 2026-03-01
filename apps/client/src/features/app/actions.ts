import { getUrlFromServer } from '@/helpers/get-file-url';
import { getLocalStorageItem, LocalStorageKey, setLocalStorageItemBool } from '@/helpers/storage';
import type { TServerInfo } from '@sharkord/shared';
import { toast } from 'sonner';
import { setInfo } from '../server/actions';
import { store } from '../store';
import { appSliceActions } from './slice';

export const setAppLoading = (loading: boolean) =>
  store.dispatch(appSliceActions.setAppLoading(loading));

export const setPluginsLoading = (loading: boolean) =>
  store.dispatch(appSliceActions.setLoadingPlugins(loading));

export const fetchServerInfo = async (): Promise<TServerInfo | undefined> => {
  try {
    const url = getUrlFromServer();
    const response = await fetch(`${url}/info`, {
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });

    if (!response.ok) {
      throw new Error('Failed to fetch server info');
    }

    const data = await response.json();

    return data;
  } catch (error) {
    console.error('Error fetching server info:', error);
  }
};

export const loadApp = async () => {
  // In Electron: only fetch server info if a custom server URL is configured
  // Otherwise skip to avoid fetching from the dev server
  const customServerUrl = getLocalStorageItem(LocalStorageKey.SERVER_URL);
  const url = getUrlFromServer();
  
  if (!customServerUrl && url === 'http://localhost:4991') {
    setAppLoading(false);
    return;
  }

  const info = await fetchServerInfo();

  if (!info) {
    console.error('Failed to load server info during app load');
    // Don't show error toast here - let the app load and user can re-try
    setAppLoading(false);
    return;
  }

  setInfo(info);
  setAppLoading(false);
};

export const setModViewOpen = (isOpen: boolean, userId?: number) =>
  store.dispatch(
    appSliceActions.setModViewOpen({
      modViewOpen: isOpen,
      userId
    })
  );

export const openThreadSidebar = (parentMessageId: number, channelId: number) =>
  store.dispatch(
    appSliceActions.setThreadSidebarOpen({
      open: true,
      parentMessageId,
      channelId
    })
  );

export const closeThreadSidebar = () =>
  store.dispatch(
    appSliceActions.setThreadSidebarOpen({
      open: false,
      parentMessageId: undefined,
      channelId: undefined
    })
  );

export const resetApp = () => {
  store.dispatch(
    appSliceActions.setModViewOpen({
      modViewOpen: false,
      userId: undefined
    })
  );
  store.dispatch(
    appSliceActions.setThreadSidebarOpen({
      open: false,
      parentMessageId: undefined,
      channelId: undefined
    })
  );
};

export const setAutoJoinLastChannel = (autoJoin: boolean) => {
  store.dispatch(appSliceActions.setAutoJoinLastChannel(autoJoin));

  setLocalStorageItemBool(LocalStorageKey.AUTO_JOIN_LAST_CHANNEL, autoJoin);
};
