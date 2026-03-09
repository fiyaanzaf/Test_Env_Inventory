import { useEffect, useRef } from 'react';

/**
 * Hook that clears the user session when the app window/tab is closed.
 * The session stays alive indefinitely while the app is open — no idle timer.
 * Perfect for always-on cashier/POS terminals.
 *
 * Uses `beforeunload` to call the provided callback (e.g. logout)
 * right before the window closes or the Electron app shuts down.
 */
export const useLogoutOnClose = (onClose: () => void) => {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const handler = () => {
      onCloseRef.current();
    };

    window.addEventListener('beforeunload', handler);

    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, []);
};
