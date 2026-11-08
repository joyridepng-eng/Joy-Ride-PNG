import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useDriverAuth } from '@/contexts/driver-auth-context';
import { restoreBackgroundGPS, stopBackgroundGPS, usesBackgroundGPS } from '@/services/background-gps';

export default function BackgroundGPSBridge() {
  const { session, isLoading } = useDriverAuth();
  useEffect(() => {
    if (!usesBackgroundGPS || isLoading) return;
    if (!session) { void stopBackgroundGPS().catch(() => {}); return; }
    void restoreBackgroundGPS();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void restoreBackgroundGPS();
    });
    // Root screen changes never stop the native tracking service.
    return () => subscription.remove();
  }, [isLoading, session]);
  return null;
}
