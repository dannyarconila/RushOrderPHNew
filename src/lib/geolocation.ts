export interface GeolocationOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

const DEFAULT_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15_000,
  maximumAge: 0,
};

export function getCurrentLocation(
  options: GeolocationOptions = {},
): Promise<GeolocationCoordinates> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.reject(new Error("Location is not supported by this browser."));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position.coords),
      (error) => reject(error),
      {
        ...DEFAULT_OPTIONS,
        ...options,
      },
    );
  });
}

export function watchLocation(
  onUpdate: (coords: GeolocationCoordinates) => void,
  onError?: (error: GeolocationPositionError) => void,
  options: GeolocationOptions = {},
): number | null {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return null;
  }

  return navigator.geolocation.watchPosition(
    (position) => onUpdate(position.coords),
    (error) => onError?.(error),
    {
      ...DEFAULT_OPTIONS,
      maximumAge: 3_000,
      timeout: 5_000,
      ...options,
    },
  );
}

export function stopWatchingLocation(watchId: number | null): void {
  if (watchId === null || typeof navigator === "undefined" || !navigator.geolocation) {
    return;
  }

  navigator.geolocation.clearWatch(watchId);
}

export function isLocationSupported(): boolean {
  return typeof navigator !== "undefined" && "geolocation" in navigator;
}
