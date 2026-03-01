import { useModViewOpen } from '@/features/app/hooks';
import { closeServerScreens } from '@/features/server-screens/actions';
import { useServerScreenInfo } from '@/features/server-screens/hooks';
import { createElement, memo, useCallback, useEffect, useRef, type JSX } from 'react';
import { createPortal } from 'react-dom';
import { CategorySettings } from './category-settings';
import { ChannelSettings } from './channel-settings';
import { ServerScreen } from './screens';
import { ServerSettings } from './server-settings';
import { UserSettings } from './user-settings';

const ScreensMap = {
  [ServerScreen.SERVER_SETTINGS]: ServerSettings,
  [ServerScreen.CHANNEL_SETTINGS]: ChannelSettings,
  [ServerScreen.USER_SETTINGS]: UserSettings,
  [ServerScreen.CATEGORY_SETTINGS]: CategorySettings
};

// lookup the portal lazily once the DOM has been painted. if we try to grab it at
// module load time there’s a chance the `<div id="portal"/>` hasn’t been parsed yet
// (particularly in tests), which results in `null` and hard-to-debug crashes later.
//
// the variable needs to live in a ref so it persists across renders without
// triggering rerenders.

type TComponentWrapperProps = {
  children: React.ReactNode;
};

const ComponentWrapper = ({ children }: TComponentWrapperProps) => {
  const { isOpen } = useModViewOpen();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // when mod view is open, do not close server screens
      if (isOpen) return;

      if (e.key === 'Escape') {
        closeServerScreens();
      }
    },
    [isOpen]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return children;
};

const ServerScreensProvider = memo(() => {
  const { isOpen, props, openServerScreen } = useServerScreenInfo();
  const portalRef = useRef<HTMLElement | null>(null);


  // grab the portal DOM element as soon as the component is mounted; keep it in a
  // ref so we don’t re-query on every render and so we can guard against it
  // being missing (which would previously cause a hard crash).
  useEffect(() => {
    portalRef.current = document.getElementById('portal');
    if (!portalRef.current) {
      console.warn('[ServerScreensProvider] portal root #portal not found');
    }
  }, []);

  let component: JSX.Element | null = null;

  if (openServerScreen && ScreensMap[openServerScreen]) {
    const baseProps = {
      ...props,
      isOpen,
      close: closeServerScreens
    };

    // @ts-expect-error - é lidar irmoum
    component = createElement(ScreensMap[openServerScreen], baseProps);
  }

  const realIsOpen = isOpen && !!component;

  // show/hide the portal container itself rather than relying on the child
  // component’s markup; this keeps the portal from intercepting clicks when
  // there’s nothing inside it.
  if (portalRef.current) {
    portalRef.current.style.display = realIsOpen ? 'block' : 'none';
  }

  if (!realIsOpen || !portalRef.current) return null;

  return createPortal(
    <ComponentWrapper>{component}</ComponentWrapper>,
    portalRef.current
  );
});

export { ServerScreensProvider };
