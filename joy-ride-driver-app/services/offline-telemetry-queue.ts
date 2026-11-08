export interface QueuedTelemetryPoint {
  id: string;
  rideId: string;
  latitude: number;
  longitude: number;
  recordedAt: string;
  heading?: number;
  speed?: number;
}

export interface TelemetryOwner {
  driverId: string;
  accessToken: string;
  expiresAt: number;
}

export type TelemetryQueueEvent =
  | 'queued'
  | 'delivered'
  | 'retrying'
  | 'needs-attention'
  | 'queue-full'
  | 'storage-error';

export interface TelemetryQueueDependencies {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  session(): Promise<TelemetryOwner | null>;
  send(
    owner: TelemetryOwner,
    points: QueuedTelemetryPoint[],
    signal: AbortSignal,
  ): Promise<{ acceptedIds: string[] }>;
  report(event: TelemetryQueueEvent, pending?: number): void;
}

function validPoint(value: unknown): value is QueuedTelemetryPoint {
  if (!value || typeof value !== 'object') return false;
  const point = value as Partial<QueuedTelemetryPoint>;
  return typeof point.id === 'string' &&
    /^[A-Za-z0-9_-]{16,100}$/.test(point.id) &&
    typeof point.rideId === 'string' &&
    point.rideId.trim().length > 0 &&
    point.rideId.length <= 100 &&
    typeof point.latitude === 'number' &&
    Number.isFinite(point.latitude) &&
    Math.abs(point.latitude) <= 90 &&
    typeof point.longitude === 'number' &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.longitude) <= 180 &&
    typeof point.recordedAt === 'string' &&
    Number.isFinite(Date.parse(point.recordedAt)) &&
    (point.heading === undefined ||
      (Number.isFinite(point.heading) &&
       point.heading >= 0 && point.heading < 360)) &&
    (point.speed === undefined ||
      (Number.isFinite(point.speed) && point.speed >= 0));
}

function sameOwner(
  left: TelemetryOwner,
  right: TelemetryOwner | null,
): boolean {
  return right !== null &&
    left.driverId === right.driverId &&
    left.accessToken === right.accessToken &&
    left.expiresAt === right.expiresAt &&
    right.expiresAt > Date.now();
}

export class OfflineTelemetryQueue {
  private storageTail: Promise<void> = Promise.resolve();
  private active = false;
  private disposed = false;
  private generation = 0;
  private running = false;
  private failures = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private controller: AbortController | undefined;

  constructor(private readonly dependencies: TelemetryQueueDependencies) {}

  private report(event: TelemetryQueueEvent, pending?: number): void {
    try {
      this.dependencies.report(event, pending);
    } catch {
      // Reporting must never break queue persistence or delivery.
    }
  }

  private locked<T>(work: () => Promise<T>): Promise<T> {
    const result = this.storageTail.then(work, work);
    this.storageTail = result.then(() => undefined, () => undefined);
    return result;
  }

  private key(owner: TelemetryOwner): string {
    return 'joyride.telemetry.owned.v1:' + encodeURIComponent(owner.driverId);
  }

  private async read(owner: TelemetryOwner): Promise<QueuedTelemetryPoint[]> {
    const raw = await this.dependencies.read(this.key(owner));
    if (raw === null) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid owned queue');
    }
    const envelope = parsed as {
      version?: unknown;
      driverId?: unknown;
      points?: unknown;
    };

    if (envelope.version !== 1 ||
        envelope.driverId !== owner.driverId ||
        !Array.isArray(envelope.points) ||
        envelope.points.length > 500 ||
        !envelope.points.every(validPoint) ||
        new Set(envelope.points.map(point => point.id)).size !==
          envelope.points.length) {
      throw new Error('Invalid owned queue');
    }
    return envelope.points;
  }

  private async write(
    owner: TelemetryOwner,
    points: QueuedTelemetryPoint[],
  ): Promise<void> {
    await this.dependencies.write(this.key(owner), JSON.stringify({
      version: 1,
      driverId: owner.driverId,
      points,
    }));
  }

  async enqueue(point: QueuedTelemetryPoint): Promise<boolean> {
    if (this.disposed || !validPoint(point)) return false;
    const generation = this.generation;

    // Snapshot caller data before the first asynchronous operation.
    const snapshot: QueuedTelemetryPoint = {
      id: point.id,
      rideId: point.rideId,
      latitude: point.latitude,
      longitude: point.longitude,
      recordedAt: point.recordedAt,
      ...(point.heading !== undefined ? { heading: point.heading } : {}),
      ...(point.speed !== undefined ? { speed: point.speed } : {}),
    };

    try {
      const owner = await this.dependencies.session();
      if (!owner || !owner.driverId ||
          owner.expiresAt <= Date.now() ||
          generation !== this.generation || this.disposed) {
        return false;
      }

      const saved = await this.locked(async () => {
        if (generation !== this.generation || this.disposed ||
            !sameOwner(owner, await this.dependencies.session())) {
          return false;
        }

        const points = await this.read(owner);
        const duplicate = points.find(item => item.id === snapshot.id);
        if (duplicate) {
          if (JSON.stringify(duplicate) !== JSON.stringify(snapshot)) {
            this.report('needs-attention', points.length);
            return false;
          }
          return true;
        }

        if (points.length >= 500) {
          this.report('queue-full', points.length);
          return false;
        }

        points.push(snapshot);
        await this.write(owner, points);
        this.report('queued', points.length);
        return true;
      });

      if (saved) void this.flush();
      return saved;
    } catch {
      this.report('storage-error');
      return false;
    }
  }

  resume(): void {
    if (this.disposed) return;
    this.active = true;
    this.failures = 0;
    if (this.retryTimer !== undefined) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    void this.flush();
  }

  pause(): void {
    this.active = false;
    this.generation++;
    if (this.retryTimer !== undefined) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.controller?.abort();
  }

  sessionChanged(): void {
    const resume = this.active;
    this.pause();
    this.failures = 0;
    if (resume) this.resume();
  }

  dispose(): void {
    this.pause();
    this.disposed = true;
  }

  private schedule(delay: number): void {
    if (!this.active || this.disposed ||
        this.retryTimer !== undefined) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.flush();
    }, delay);
  }

  async flush(): Promise<void> {
    if (!this.active || this.disposed || this.running ||
        this.retryTimer !== undefined || this.failures >= 5) return;

    this.running = true;
    const generation = this.generation;
    let requestTimeout: ReturnType<typeof setTimeout> | undefined;

    try {
      const owner = await this.dependencies.session();
      if (!owner || owner.expiresAt <= Date.now() ||
          generation !== this.generation) return;

      const batch = await this.locked(async () =>
        (await this.read(owner)).slice(0, 100));
      if (!batch.length || !this.active ||
          generation !== this.generation ||
          !sameOwner(owner, await this.dependencies.session())) return;

      const controller = new AbortController();
      this.controller = controller;

      const timeout = new Promise<never>((_, reject) => {
        requestTimeout = setTimeout(() => {
          controller.abort();
          reject(new Error('Telemetry request timeout'));
        }, 15000);
      });

      const response = await Promise.race([
        this.dependencies.send(owner, batch, controller.signal),
        timeout,
      ]);

      if (generation !== this.generation || !this.active ||
          !sameOwner(owner, await this.dependencies.session())) return;

      const sentIds = new Set(batch.map(point => point.id));
      const accepted = response?.acceptedIds;
      if (!Array.isArray(accepted) ||
          accepted.length !== batch.length ||
          accepted.some(id => typeof id !== 'string' || !sentIds.has(id)) ||
          new Set(accepted).size !== batch.length) {
        throw new Error('Invalid telemetry acknowledgement');
      }

      const remaining = await this.locked(async () => {
        if (generation !== this.generation ||
            !sameOwner(owner, await this.dependencies.session())) {
          return null;
        }
        const current = await this.read(owner);
        const next = current.filter(point => !sentIds.has(point.id));
        await this.write(owner, next);
        return next.length;
      });

      if (remaining === null) return;
      this.failures = 0;
      this.report('delivered', remaining);
      if (remaining > 0) this.schedule(0);
    } catch {
      if (generation === this.generation && this.active && !this.disposed) {
        this.failures++;
        if (this.failures >= 5) {
          this.report('needs-attention');
        } else {
          this.report('retrying');
          this.schedule(Math.min(60000, 5000 * 2 ** (this.failures - 1)));
        }
      }
    } finally {
      if (requestTimeout !== undefined) clearTimeout(requestTimeout);
      this.controller = undefined;
      this.running = false;

      // Resume after a session or lifecycle change that interrupted a request.
      if (generation !== this.generation &&
          this.active && !this.disposed) {
        this.schedule(0);
      }
    }
  }
}
