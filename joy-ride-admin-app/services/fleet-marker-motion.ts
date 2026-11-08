type Coordinate = [latitude: number, longitude: number];
type MovingMarker = {
  getLatLng(): { lat: number; lng: number };
  setLatLng(point: Coordinate): unknown;
};
type Scheduler = {
  request(callback: (time: number) => void): number;
  cancel(frame: number): void;
};
type Motion = {
  target: Coordinate;
  timestamp: number;
  frame: number | null;
};

function valid(point: Coordinate): boolean {
  return Number.isFinite(point[0]) && Math.abs(point[0]) <= 90 &&
    Number.isFinite(point[1]) && Math.abs(point[1]) <= 180;
}

export function createFleetMarkerMotion(
  scheduler: Scheduler = {
    request: callback => requestAnimationFrame(callback),
    cancel: frame => cancelAnimationFrame(frame),
  },
) {
  const motions = new Map<string, Motion>();

  function remove(driverId: string) {
    const motion = motions.get(driverId);
    if (motion?.frame !== null && motion?.frame !== undefined) {
      scheduler.cancel(motion.frame);
    }
    motions.delete(driverId);
  }

  function move(
    driverId: string,
    marker: MovingMarker,
    target: Coordinate,
    recordedAt: string,
    animate = true,
  ) {
    const timestamp = Date.parse(recordedAt);
    if (!valid(target) || !Number.isFinite(timestamp)) return;
    const previous = motions.get(driverId);
    if (previous && timestamp < previous.timestamp) return;

    if (previous &&
        previous.target[0] === target[0] &&
        previous.target[1] === target[1]) {
      previous.timestamp = timestamp;
      if (!animate && previous.frame !== null) {
        scheduler.cancel(previous.frame);
        previous.frame = null;
        marker.setLatLng(target);
      }
      return;
    }

    remove(driverId);
    const current = marker.getLatLng();
    const start: Coordinate = [current.lat, current.lng];
    const motion: Motion = { target: [...target], timestamp, frame: null };
    motions.set(driverId, motion);

    if (!animate || !valid(start) ||
        Math.abs(start[0] - target[0]) > 0.05 ||
        Math.abs(start[1] - target[1]) > 0.05 ||
        (start[0] === target[0] && start[1] === target[1])) {
      marker.setLatLng(target);
      return;
    }

    let started: number | null = null;
    let lastFrame = -Infinity;
    const step = (time: number) => {
      if (motions.get(driverId) !== motion) return;
      if (started === null) started = time;
      const progress = Math.max(0, Math.min(1, (time - started) / 2000));
      if (time - lastFrame >= 32 || progress === 1) {
        marker.setLatLng([
          start[0] + (target[0] - start[0]) * progress,
          start[1] + (target[1] - start[1]) * progress,
        ]);
        lastFrame = time;
      }
      motion.frame = progress < 1 ? scheduler.request(step) : null;
    };
    motion.frame = scheduler.request(step);
  }

  return {
    move,
    remove,
    clear() {
      for (const id of [...motions.keys()]) remove(id);
    },
  };
}
