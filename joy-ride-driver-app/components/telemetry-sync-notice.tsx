import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDriverAuth } from '@/contexts/driver-auth-context';
import {
  offlineTelemetryService,
  type OfflineTelemetryStatus,
} from '@/services/offline-telemetry';

export default function TelemetrySyncNotice() {
  const { session, isLoading } = useDriverAuth();
  const [status, setStatus] = useState<OfflineTelemetryStatus>(
    () => offlineTelemetryService.getStatus(),
  );
  const [cooldown, setCooldown] = useState(false);
  const retryAllowedAt = useRef(0);

  useEffect(() => offlineTelemetryService.subscribe(setStatus), []);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(false), 30000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  if (isLoading || !session) return null;

  const messages: Partial<Record<OfflineTelemetryStatus['event'], string>> = {
    retrying:
      'Some location history is waiting to sync. Automatic retries are running.',
    'needs-attention':
      'Location history needs attention. Check internet access and retry. If this continues, contact your operator.',
    'queue-full':
      'Location history storage is full. New points cannot be saved until space is available. Contact your operator if syncing does not resume.',
    'storage-error':
      'Location history could not be read or saved. Contact your operator if this continues.',
  };
  const message = messages[status.event];
  if (!message) return null;

  function retry() {
    if (cooldown || Date.now() < retryAllowedAt.current) return;
    retryAllowedAt.current = Date.now() + 30000;
    setCooldown(true);
    offlineTelemetryService.retryQueue();
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.notice}>
        <View style={styles.copy} accessibilityLiveRegion="polite">
          <Text style={styles.title}>Location history sync</Text>
          <Text style={styles.message}>{message}</Text>
        </View>
        {status.event === 'needs-attention' && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry location history sync"
            accessibilityState={{ disabled: cooldown }}
            disabled={cooldown}
            onPress={retry}
            style={({ pressed }) => [
              styles.button,
              (pressed || cooldown) && styles.dimmed,
            ]}
          >
            <Text style={styles.buttonText}>
              {cooldown ? 'Please wait' : 'Retry'}
            </Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#fff3cd' },
  notice: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  copy: { flex: 1 },
  title: { color: '#533f03', fontWeight: '700', fontSize: 14 },
  message: { color: '#533f03', fontSize: 13, marginTop: 3 },
  button: {
    backgroundColor: '#533f03',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 6,
  },
  buttonText: { color: '#ffffff', fontWeight: '600' },
  dimmed: { opacity: 0.6 },
});
