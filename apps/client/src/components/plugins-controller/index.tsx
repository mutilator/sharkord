import { setPluginsLoading } from '@/features/app/actions';
import {
  processPluginComponents,
  setPluginComponents
} from '@/features/server/plugins/actions';
import { getUrlFromServer } from '@/helpers/get-file-url';
import { getLocalStorageItem, LocalStorageKey } from '@/helpers/storage';
import type { TPluginComponentsMapBySlotIdMapListByPlugin } from '@sharkord/shared';
import { memo, useCallback, useEffect } from 'react';

export type TPluginsController = {
  loading: boolean;
};

const PluginsController = memo(() => {
  const fetchPlugins = useCallback(async () => {
    try {
      // In Electron: only fetch if a custom server URL is configured
      // Otherwise skip to avoid fetching from the dev server
      const customServerUrl = getLocalStorageItem(LocalStorageKey.SERVER_URL);
      const url = getUrlFromServer();
      
      // Skip if using default dev server without explicit config
      if (!customServerUrl && url === 'http://localhost:4991') {
        setPluginsLoading(false);
        return;
      }

      const response = await fetch(`${url}/plugin-components`, {
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch plugins: ${response.statusText}`);
      }

      const slotsMap =
        (await response.json()) as TPluginComponentsMapBySlotIdMapListByPlugin;
      const components = await processPluginComponents(slotsMap);

      setPluginComponents(components);
    } catch (error) {
      console.error('Error fetching plugins:', error);
    } finally {
      setPluginsLoading(false);
    }
  }, []);

  useEffect(() => {
    // we need to fetch plugins here before joining the server
    // because there might be slots that need to be rendered in the login screen
    // once you are connected the the data flow is through trpc and not through this controller
    fetchPlugins();
  }, [fetchPlugins]);

  return null;
});

export { PluginsController };
