type MapCamera = {
  coordinates: { latitude: number; longitude: number };
  zoom: number;
};

/** A map view mounted moments ago may not be registered natively yet, so its first move is retried a few times. */
const CAMERA_ATTEMPTS = 4;
const CAMERA_RETRY_MS = 150;

export function sameCamera(a?: MapCamera, b?: MapCamera): boolean {
  if (!a || !b) return a === b;
  return (
    a.zoom === b.zoom &&
    a.coordinates.latitude === b.coordinates.latitude &&
    a.coordinates.longitude === b.coordinates.longitude
  );
}

/**
 * Runs `move` until it succeeds, reporting the error only once every attempt has failed.
 * Returns a cancel function; after it runs, nothing is retried or reported.
 */
export function moveCamera(
  move: () => Promise<void> | undefined,
  onFail: (error: unknown) => void,
): () => void {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const attempt = (left: number) => {
    move()?.catch((error: unknown) => {
      if (cancelled) return;
      if (left > 1)
        timer = setTimeout(() => attempt(left - 1), CAMERA_RETRY_MS);
      else onFail(error);
    });
  };
  attempt(CAMERA_ATTEMPTS);
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}
