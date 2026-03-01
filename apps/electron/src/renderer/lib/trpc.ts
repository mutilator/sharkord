import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../../../apps/server/src/routers';

const serverUrl = (() => {
  // in development, connect to localhost:4991
  // in production, will need to be configured based on where the server is
  if (import.meta.env.MODE === 'development') {
    return 'http://localhost:4991';
  }
  // TODO: implement production server URL resolution
  return 'http://localhost:4991';
})();

const getTRPCClient = () => {
  return createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${serverUrl}/trpc`,
        async fetch(url, options) {
          const response = await fetch(url, {
            ...options,
            credentials: 'include',
          });
          return response;
        },
      }),
    ],
  });
};

export { getTRPCClient };
