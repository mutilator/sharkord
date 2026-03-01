import type { TFile } from '@sharkord/shared';

const getHostFromServer = () => {
  // Allow overriding using localStorage (used by Electron, mobile, etc.)
  // Extract host from stored URL if present
  const stored = localStorage.getItem('sharkord-server-url');
  if (stored) {
    try {
      const url = new URL(stored);
      return url.host;
    } catch {
      // If not a valid URL, treat as host:port directly
      return stored;
    }
  }

  if (import.meta.env.MODE === 'development') {
    return 'localhost:4991';
  }

  return window.location.host;
};

const getUrlFromServer = () => {
  // allow overriding using localStorage (used by Electron, mobile, etc.)
  const stored = localStorage.getItem('sharkord-server-url');
  if (stored) {
    return stored;
  }

  if (import.meta.env.MODE === 'development') {
    return 'http://localhost:4991';
  }

  const host = window.location.host;
  const currentProtocol = window.location.protocol;

  const finalUrl = `${currentProtocol}//${host}`;

  return finalUrl;
};

const getFileUrl = (file: TFile | undefined | null) => {
  if (!file) return '';

  const url = getUrlFromServer();

  let baseUrl = `${url}/public/${file.name}`;

  if (file._accessToken) {
    baseUrl += `?accessToken=${file._accessToken}`;
  }

  return encodeURI(baseUrl);
};

export { getFileUrl, getHostFromServer, getUrlFromServer };
