import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { API_BASE_URL } from '../constants/api';
import {
  loadDriverSession,
  subscribeToDriverSession,
} from './driver-session';
import {
  OfflineTelemetryQueue,
  type TelemetryQueueEvent,
} from './offline-telemetry-queue';

export interface TelemetryPoint {
  id: string;
  rideId: string;
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  timestamp: string;
  status: 'ASSIGNED' | 'EN_ROUTE' | 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED';
}

export interface OfflineTelemetryStatus {
  event: TelemetryQueueEvent | 'idle';
  pending: number | null;
  updatedAt: number;
}

class OfflineTelemetryService {
  private status: OfflineTelemetryStatus = {
    event: 'idle',
    pending: null,
    updatedAt: Date.now(),
  };
  private readonly listeners =
    new Set<(status: OfflineTelemetryStatus) => void>();
  private readonly queue: OfflineTelemetryQueue;
  private readonly cleanup: (() => void)[] = [];
  private foreground =
    AppState.currentState !== 'background' &&
    AppState.currentState !== 'inactive';
  private connected = false;
  private eligible = false;
  private disposed = false;
  private networkRevision = 0;
  private pointSequence = 0;

  constructor() {
    this.queue = new OfflineTelemetryQueue({
      read: key => AsyncStorage.getItem(key),
      write: (key, value) => AsyncStorage.setItem(key, value),
      session: async () => {
        const session = await loadDriverSession();
        if (!session) return null;
        return {
          driverId: session.driver.id,
          accessToken: session.accessToken,
          expiresAt: session.expiresAt,
        };
      },
      send: async (owner, points, signal) => {
        const response = await fetch(
          API_BASE_URL.replace(/\/$/, '') +
            '/driver-locations/history/batch',
          {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              Authorization: 'Bearer ' + owner.accessToken,
            },
            body: JSON.stringify({ points }),
            signal,
          },
        );
        if (!response.ok) {
          // Never clear a potentially newer login because an old upload failed.
          throw new Error('History upload rejected');
        }
        const body: unknown = await response.json();
        if (!body || typeof body !== 'object' ||
            !('acceptedIds' in body) ||
            !Array.isArray(body.acceptedIds) ||
            !body.acceptedIds.every(
              (id: unknown) => typeof id === 'string',
            )) {
          throw new Error('Invalid history acknowledgement');
        }
        return { acceptedIds: body.acceptedIds as string[] };
      },
      report: (event, pending) => this.publish(event, pending),
    });

    const removeNetwork = NetInfo.addEventListener(state => {
      this.networkRevision++;
      this.connected =
        state.isConnected === true &&
        state.isInternetReachable !== false;
      this.updateEligibility();
    });
    this.cleanup.push(removeNetwork);

    const revision = this.networkRevision;
    void NetInfo.fetch().then(state => {
      if (this.disposed || revision !== this.networkRevision) return;
      this.connected =
        state.isConnected === true &&
        state.isInternetReachable !== false;
      this.updateEligibility();
    }).catch(() => {
      if (!this.disposed) this.publish('needs-attention');
    });

    const appState = AppState.addEventListener('change', state => {
      this.foreground = state === 'active';
      this.updateEligibility();
    });
    this.cleanup.push(() => appState.remove());

    this.cleanup.push(subscribeToDriverSession(() => {
      this.status = {
        event: 'idle', pending: null, updatedAt: Date.now(),
      };
      this.notify();
      this.queue.sessionChanged();
    }));
  }

  private publish(event: TelemetryQueueEvent, pending?: number): void {
    if (this.disposed) return;
    this.status = {
      event: event === 'queued' &&
        ['retrying', 'needs-attention', 'queue-full', 'storage-error']
          .includes(this.status.event)
        ? this.status.event : event,
      pending: pending ?? this.status.pending,
      updatedAt: Date.now(),
    };
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener({ ...this.status });
      } catch {
        // One subscriber must not interrupt delivery or other subscribers.
      }
    }
  }

  private updateEligibility(): void {
    if (this.disposed) return;
    const eligible = this.foreground && this.connected;
    if (eligible === this.eligible) return;
    this.eligible = eligible;
    if (eligible) this.queue.resume();
    else this.queue.pause();
  }

  getStatus(): OfflineTelemetryStatus {
    return { ...this.status };
  }

  subscribe(
    listener: (status: OfflineTelemetryStatus) => void,
  ): () => void {
    this.listeners.add(listener);
    try {
      listener(this.getStatus());
    } catch {
      // Subscribing must not interrupt the queue.
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  async enqueuePoint(point: Omit<TelemetryPoint, 'id'>): Promise<void> {
    if (this.disposed) return;
    this.pointSequence++;
    // Correlation identifier only; authentication uses the Driver JWT.
    const id = Date.now().toString(36) + '_' +
      this.pointSequence.toString(36) + '_' +
      Math.random().toString(36).slice(2) + '_' +
      Math.random().toString(36).slice(2);

    const saved = await this.queue.enqueue({
      id,
      rideId: point.rideId,
      latitude: point.latitude,
      longitude: point.longitude,
      recordedAt: point.timestamp,
      ...(point.heading !== undefined ? { heading: point.heading } : {}),
      ...(point.speed !== undefined ? { speed: point.speed } : {}),
    });
    if (!saved && !this.disposed &&
        this.status.event !== 'queue-full' &&
        this.status.event !== 'storage-error') {
      this.publish('needs-attention');
    }
  }

  retryQueue(): void {
    if (this.eligible && !this.disposed) this.queue.resume();
  }

  async flushQueue(): Promise<void> {
    await this.queue.flush();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.queue.dispose();
    for (const remove of this.cleanup) remove();
    this.listeners.clear();
  }
}

export const offlineTelemetryService = new OfflineTelemetryService();
