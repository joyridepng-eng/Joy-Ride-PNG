import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Alert, AppState, Platform } from 'react-native';
import { API_BASE_URL } from '@/constants/api';
import { loadDriverSession, subscribeToDriverSession, type DriverSession } from '@/services/driver-session';

export const usesBackgroundGPS = Platform.OS === 'android' && Constants.executionEnvironment !== 'storeClient';
const TASK = 'joyride-driver-gps-v1';
const CONTROL = 'joyride-driver-gps-control-v1';
type Control = { driverId: string; expiresAt: number; startedAt: number };
export type GPSLocation = { latitude: number; longitude: number; accuracy: number | null; heading: number | null; speed: number | null; recordedAt: string };
type Status = 'idle' | 'requesting-permission' | 'tracking' | 'permission-denied' | 'error';
type Snapshot = { status: Status; errorMessage: string; latestLocation: GPSLocation | null; enabled: boolean };
let snapshot: Snapshot = { status: 'idle', errorMessage: '', latestLocation: null, enabled: false };
const listeners = new Set<() => void>();
export const getBackgroundGPSSnapshot = () => snapshot;
export function subscribeBackgroundGPS(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function publish(change: Partial<Snapshot>) { snapshot = { ...snapshot, ...change }; listeners.forEach(fn => fn()); }
let epoch = 0;
let blocked = false;
let pending: Location.LocationObject | null = null;
let uploading: Promise<void> | null = null;
let lifecycle: Promise<void> = Promise.resolve();
const controllers = new Set<AbortController>();
let lastAccepted = 0;
let freshPositionRequest: { ticket: number; cancel: () => void; promise: Promise<void> } | null = null;

// Request one new foreground fix at start/resume instead of waiting for movement.
// The usual authenticated upload pipeline remains the only source of map positions.
function requestFreshPosition(ticket: number): Promise<void> {
  if (!usesBackgroundGPS || blocked || ticket !== epoch || !snapshot.enabled || AppState.currentState !== 'active') {
    return Promise.resolve();
  }
  if (freshPositionRequest?.ticket === ticket) return freshPositionRequest.promise;
  freshPositionRequest?.cancel();
  const acceptedAtStart = lastAccepted;
  const requestedAt = Date.now();
  let resolveRequest!: () => void;
  const promise = new Promise<void>(resolve => { resolveRequest = resolve; });
  let subscription: Location.LocationSubscription | null = null;
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const entry = { ticket, cancel: () => finish(), promise };
  function finish(sample?: Location.LocationObject, message?: string) {
    if (finished) return;
    finished = true;
    if (timer !== undefined) clearTimeout(timer);
    subscription?.remove();
    const complete = () => {
      if (freshPositionRequest === entry) freshPositionRequest = null;
      resolveRequest();
    };
    if (blocked || ticket !== epoch) { complete(); return; }
    if (sample) {
      void receiveBackgroundLocations([sample]).then(complete, () => {
        if (!blocked && ticket === epoch) publish({ status: 'error', errorMessage: 'Could not submit the fresh GPS position. Check your connection and enable GPS again.' });
        complete();
      });
      return;
    }
    // Do not replace a successful background fix or an upload error with a timeout.
    if (message && lastAccepted === acceptedAtStart && !snapshot.latestLocation && snapshot.status !== 'error') {
      publish({ status: 'error', errorMessage: message });
    }
    complete();
  }
  freshPositionRequest = entry;
  timer = setTimeout(() => finish(undefined,
    'No fresh GPS position yet. Move outdoors, check precise location permission, then tap Enable GPS.'), 30000);
  void Location.watchPositionAsync({
    accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0,
  }, location => {
    if (validSample(location) && location.timestamp >= requestedAt && location.timestamp > lastAccepted) finish(location);
  }, () => finish(undefined, 'Could not obtain a fresh GPS position. Check Android location settings and tap Enable GPS.'))
    .then(result => {
      // Android may finish registration after logout, timeout, or the first callback.
      if (finished || blocked || ticket !== epoch) result.remove();
      else subscription = result;
    })
    .catch(() => finish(undefined, 'Could not start the fresh GPS check. Check Android location permission and tap Enable GPS.'));
  return promise;
}

function serialized(work: () => Promise<void>) { const next = lifecycle.then(work, work); lifecycle = next.catch(() => {}); return next; }
function sameSession(session: DriverSession | null, control: Control): session is DriverSession {
  return !!session && session.driver.id === control.driverId && session.expiresAt === control.expiresAt && session.expiresAt > Date.now();
}
async function readControl(): Promise<Control | null> {
  const raw = await AsyncStorage.getItem(CONTROL);
  if (!raw) return null;
  const value = JSON.parse(raw) as Partial<Control>;
  return typeof value.driverId === 'string' && typeof value.expiresAt === 'number' &&
    Number.isFinite(value.expiresAt) && typeof value.startedAt === 'number' && Number.isFinite(value.startedAt)
    ? value as Control : null;
}
export function stopBackgroundGPS(reason = ''): Promise<void> {
  if (!usesBackgroundGPS) return Promise.resolve();
  blocked = true; epoch++; pending = null; lastAccepted = 0;
  freshPositionRequest?.cancel();
  controllers.forEach(controller => controller.abort());
  publish({ status: reason ? 'error' : 'idle', errorMessage: reason, latestLocation: null, enabled: false });
  return serialized(async () => {
    // Stop the native service even if storage removal fails.
    try { await AsyncStorage.removeItem(CONTROL); }
    finally {
      if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK);
    }
  });
}
async function request(session: DriverSession, path: string, options: RequestInit = {}) {
  const controller = new AbortController(); controllers.add(controller);
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    // The same account token is used throughout a GPS operation, even during account changes.
    const response = await fetch(`${API_BASE_URL}${path}`, { ...options, signal: controller.signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `${session.tokenType} ${session.accessToken}` } });
    const text = await response.text();
    let data: any = null;
    if (text.trim()) { try { data = JSON.parse(text); } catch { throw new Error('invalid-response'); } }
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'unauthorized' : `http-${response.status}`);
    return data;
  } finally { clearTimeout(timer); controllers.delete(controller); }
}
async function confirmOnline(session: DriverSession) {
  const driver = await request(session, '/drivers/me');
  if (!driver || driver.id !== session.driver.id || driver.status !== 'APPROVED' || driver.isOnline !== true) throw new Error('offline');
}
function validSample(location: Location.LocationObject) {
  const c = location.coords;
  return Number.isFinite(c.latitude) && Math.abs(c.latitude) <= 90 && Number.isFinite(c.longitude) && Math.abs(c.longitude) <= 180 &&
    Number.isFinite(location.timestamp) && location.timestamp > 0 && Number.isFinite(new Date(location.timestamp).getTime());
}
const nonNegative = (value: number | null) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
async function sendSamples() {
  while (pending && !blocked) {
    const sample = pending; pending = null;
    const operationEpoch = epoch;
    let stage = 'account check';
    try {
      const control = await readControl();
      const session = await loadDriverSession();
      if (blocked || operationEpoch !== epoch) return;
      if (!control || !sameSession(session, control)) { await stopBackgroundGPS('Tracking stopped. Sign in and enable GPS again.'); return; }
      // Drop native batches recorded before this driver's explicit tracking start.
      if (!validSample(sample) || sample.timestamp < control.startedAt || sample.timestamp <= lastAccepted) continue;
      await confirmOnline(session);
      stage = 'assigned ride check';
      const ride = await request(session, '/rides/driver/me/active');
      if (ride !== null && (!ride || typeof ride.id !== 'string' || ride.driver?.id !== control.driverId ||
          !['ACCEPTED', 'DRIVER_ARRIVED', 'IN_PROGRESS'].includes(ride.status))) throw new Error('invalid-response');
      const latestSession = await loadDriverSession();
      if (blocked || operationEpoch !== epoch || !sameSession(latestSession, control)) return;
      const c = sample.coords;
      const location: GPSLocation = { latitude: c.latitude, longitude: c.longitude, accuracy: nonNegative(c.accuracy),
        heading: c.heading !== null && c.heading < 360 ? nonNegative(c.heading) : null,
        speed: nonNegative(c.speed), recordedAt: new Date(sample.timestamp).toISOString() };
      stage = 'location upload';
      const accepted = await request(session, '/driver-locations/upsert', { method: 'POST', body: JSON.stringify({
        ...location, accuracy: location.accuracy ?? undefined, heading: location.heading ?? undefined,
        speed: location.speed ?? undefined, rideId: ride?.id,
      }) });
      if (blocked || operationEpoch !== epoch) return;
      if (!accepted || accepted.driverId !== control.driverId) throw new Error('invalid-response');
      lastAccepted = sample.timestamp;
      publish({ status: 'tracking', errorMessage: '', latestLocation: location, enabled: true });
    } catch (error) {
      if (blocked || operationEpoch !== epoch) return;
      const code = error instanceof Error ? error.message : '';
      if (code === 'unauthorized' || code === 'offline') {
        await stopBackgroundGPS(code === 'offline' ? 'GPS stopped: your driver account is offline or not approved.' : 'GPS stopped: sign in again.');
        return;
      }
      const http = /^http-(\d{3})$/.exec(code);
      publish({ status: 'error', errorMessage: http
        ? `GPS ${stage} failed (HTTP ${http[1]}). Retry Enable GPS or report this status.`
        : `GPS ${stage} could not be confirmed. Check your connection and tap Enable GPS to retry.` });
    }
  }
}
export async function receiveBackgroundLocations(locations: Location.LocationObject[]) {
  if (blocked) return;
  for (const location of locations) {
    if (validSample(location) && (!pending || location.timestamp > pending.timestamp)) pending = location;
  }
  if (!uploading) uploading = sendSamples().finally(() => { uploading = null; });
  await uploading;
  if (pending && !blocked) await receiveBackgroundLocations([]);
}
// Defined at module scope: Android may execute the task without mounting any screen.
if (usesBackgroundGPS && !TaskManager.isTaskDefined(TASK)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
    if (error) { publish({ status: 'error', errorMessage: 'Android could not obtain a background position. Check GPS permission and location settings.' }); return; }
    try { if (data?.locations) await receiveBackgroundLocations(data.locations); }
    catch { publish({ status: 'error', errorMessage: 'Background GPS paused. Open Availability to check tracking.' }); }
  });
  subscribeToDriverSession(session => {
    // Stop on logout or a new login; tracking is explicitly enabled for each session.
    void stopBackgroundGPS(session ? '' : 'GPS stopped: no signed-in driver session.').catch(() => {
      publish({ status: 'error', errorMessage: 'Could not stop the Android location service. Reopen the app and tap Stop GPS.' });
    });
  });
}
async function nativeStart() {
  await Location.startLocationUpdatesAsync(TASK, {
    accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 2,
    deferredUpdatesInterval: 0, deferredUpdatesDistance: 0,
    foregroundService: { notificationTitle: 'JoyRide Driver location sharing',
      notificationBody: 'Sharing your location while online. Open Availability to stop GPS or go offline.',
      notificationColor: '#2563eb', killServiceOnDestroy: true },
  });
}
export async function enableBackgroundGPS(): Promise<void> {
  if (!usesBackgroundGPS) return;
  const ticket = ++epoch;
  freshPositionRequest?.cancel();
  const session = await loadDriverSession();
  if (!session) throw new Error('Sign in before enabling GPS.');
  publish({ status: 'requesting-permission', errorMessage: '' });
  try {
    if (!(await TaskManager.isAvailableAsync())) throw new Error('Install the dedicated Driver APK to enable background GPS.');
    if (!(await Location.requestForegroundPermissionsAsync()).granted) throw new Error('Allow precise location access before enabling GPS.');
    if (!(await Location.getBackgroundPermissionsAsync()).granted) {
      const agreed = await new Promise<boolean>(resolve => Alert.alert('Background GPS',
        'JoyRide shares your location with fleet administrators while you are online, including when the screen is locked. Choose Allow all the time in Android location settings. Go Offline or Stop GPS ends tracking.',
        [{ text: 'Not now', style: 'cancel', onPress: () => resolve(false) }, { text: 'Continue', onPress: () => resolve(true) }],
        { cancelable: true, onDismiss: () => resolve(false) }));
      if (!agreed || !(await Location.requestBackgroundPermissionsAsync()).granted) throw new Error('Background permission was not granted. Enable GPS again when ready.');
    }
    if (!(await Location.hasServicesEnabledAsync())) throw new Error('Turn on Android location services, then enable GPS again.');
    if (AppState.currentState !== 'active') throw new Error('Return to the Driver App and tap Enable GPS again.');
    await confirmOnline(session);
    await serialized(async () => {
      const current = await loadDriverSession();
      if (ticket !== epoch || !current || current.accessToken !== session.accessToken) return;
      const previousControl = await readControl();
      if (ticket !== epoch) return;
      const resuming = previousControl !== null && sameSession(current, previousControl) && !blocked;
      const control: Control = resuming ? previousControl! : {
        driverId: session.driver.id, expiresAt: session.expiresAt, startedAt: Date.now(),
      };
      await AsyncStorage.setItem(CONTROL, JSON.stringify(control));
      if (ticket !== epoch) return;
      if (!resuming) {
        lastAccepted = 0;
        pending = null;
        publish({ latestLocation: null });
      }
      blocked = false;
      if (!(await Location.hasStartedLocationUpdatesAsync(TASK))) await nativeStart();
      if (ticket === epoch) publish({ enabled: true, status: 'tracking', errorMessage: '' });
    });
    if (ticket === epoch && !blocked) void requestFreshPosition(ticket);
  } catch (error) {
    if (ticket !== epoch) return;
    await stopBackgroundGPS().catch(() => {});
    const code = error instanceof Error ? error.message : '';
    const known = ['Sign in before enabling GPS.', 'Install the dedicated Driver APK to enable background GPS.',
      'Allow precise location access before enabling GPS.', 'Background permission was not granted. Enable GPS again when ready.',
      'Turn on Android location services, then enable GPS again.', 'Return to the Driver App and tap Enable GPS again.'];
    publish({ status: 'error', errorMessage: code === 'offline' ? 'Go online with an approved driver account first.'
      : known.includes(code) ? code : 'Could not start background GPS. Check your connection and Android permissions.' });
  }
}
export async function restoreBackgroundGPS() {
  if (!usesBackgroundGPS || AppState.currentState !== 'active') return;
  const ticket = epoch;
  try {
    const control = await readControl();
    if (!control || blocked) return;
    const session = await loadDriverSession();
    if (ticket !== epoch) return;
    if (!sameSession(session, control)) { await stopBackgroundGPS(); return; }
    await confirmOnline(session);
    if (!(await Location.getBackgroundPermissionsAsync()).granted) { await stopBackgroundGPS('GPS stopped: background permission is required.'); return; }
    await serialized(async () => {
      if (ticket !== epoch || blocked || AppState.currentState !== 'active') return;
      if (!(await Location.hasStartedLocationUpdatesAsync(TASK))) await nativeStart();
      if (ticket === epoch && !blocked) publish({ enabled: true, status: 'tracking', errorMessage: '' });
    });
    if (ticket === epoch && !blocked) void requestFreshPosition(ticket);
  } catch (error) {
    if (ticket !== epoch) return;
    const code = error instanceof Error ? error.message : '';
    if (code === 'offline' || code === 'unauthorized') {
      await stopBackgroundGPS('GPS stopped: check your sign-in and online status.').catch(() => {});
    } else publish({ status: 'error', errorMessage: 'Could not verify background GPS. Check your session and tap Enable GPS.' });
  }
}
