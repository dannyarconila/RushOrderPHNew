import { createServerFn } from "@tanstack/react-start";

interface GeocodeAddressInput {
  line1: string;
  barangay: string;
  city: string;
  province: string;
  postal_code: string;
}

interface GeocodeResult {
  latitude: number;
  longitude: number;
  place_name: string;
}

export const geocodeAddressFn = createServerFn({ method: "POST" })
  .inputValidator((data: GeocodeAddressInput) => data)
  .handler(async ({ data }): Promise<GeocodeResult> => {
    const token = process.env.MAPBOX_SECRET_TOKEN;

    if (!token) {
      throw new Error("Map geocoding is not configured.");
    }

    const address = [
      data.line1,
      data.barangay,
      data.city,
      data.province,
      data.postal_code,
      "Philippines",
    ]
      .map((value) => value.trim())
      .filter(Boolean)
      .join(", ");

    if (address.length < 8) {
      throw new Error("Enter a more complete delivery address.");
    }

    const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");

    url.searchParams.set("q", address);
    url.searchParams.set("access_token", token);
    url.searchParams.set("country", "PH");
    url.searchParams.set("limit", "1");
    url.searchParams.set("language", "en");

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("Unable to locate this delivery address.");
    }

    const payload = (await response.json()) as {
      features?: Array<{
        place_name?: string;
        geometry?: {
          coordinates?: [number, number];
        };
      }>;
    };

    const feature = payload.features?.[0];
    const coordinates = feature?.geometry?.coordinates;

    if (
      !coordinates ||
      coordinates.length < 2 ||
      !Number.isFinite(coordinates[0]) ||
      !Number.isFinite(coordinates[1])
    ) {
      throw new Error("We could not find an exact map location for this address.");
    }

    return {
      longitude: coordinates[0],
      latitude: coordinates[1],
      place_name: feature.place_name ?? address,
    };
  });
