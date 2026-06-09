import { useState, useEffect, useCallback } from 'react';

const NOTIFICATION_PERMISSION_KEY = 'uknow_inbox_notifications_enabled';

export const useDesktopNotifications = () => {
  const [permission, setPermission] = useState('default');
  const [isEnabled, setIsEnabled] = useState(false);

  useEffect(() => {
    // Check stored preference
    const stored = localStorage.getItem(NOTIFICATION_PERMISSION_KEY);
    if (stored === 'true') {
      setIsEnabled(true);
    }

    // Check browser notification permission
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      console.warn('Desktop notifications not supported');
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      
      if (result === 'granted') {
        localStorage.setItem(NOTIFICATION_PERMISSION_KEY, 'true');
        setIsEnabled(true);
        return true;
      } else {
        localStorage.setItem(NOTIFICATION_PERMISSION_KEY, 'false');
        setIsEnabled(false);
        return false;
      }
    } catch (err) {
      console.error('Failed to request notification permission:', err);
      return false;
    }
  }, []);

  const toggleNotifications = useCallback(async () => {
    if (!isEnabled && permission !== 'granted') {
      return await requestPermission();
    }

    const newValue = !isEnabled;
    localStorage.setItem(NOTIFICATION_PERMISSION_KEY, String(newValue));
    setIsEnabled(newValue);
    return newValue;
  }, [isEnabled, permission, requestPermission]);

  const showNotification = useCallback((title, options = {}) => {
    if (!isEnabled || permission !== 'granted') {
      return null;
    }

    try {
      const notification = new Notification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        ...options,
      });

      // Auto close after 5 seconds
      setTimeout(() => notification.close(), 5000);

      // Handle click - focus window
      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      return notification;
    } catch (err) {
      console.error('Failed to show notification:', err);
      return null;
    }
  }, [isEnabled, permission]);

  return {
    permission,
    isEnabled,
    requestPermission,
    toggleNotifications,
    showNotification,
  };
};

export default useDesktopNotifications;
