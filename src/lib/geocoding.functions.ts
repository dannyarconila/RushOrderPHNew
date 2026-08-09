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

interface ReverseGeocodeInput {
  latitude: number;
  longitude: number;
}

interface ReverseGeocodeResult {
  latitude: number;
  longitude: number;
  place_name: string;
  address: {
    line1: string;
    barangay: string;
    city: string;
    province: string;
    postal_code: string;
  };
}

export const reverseGeocodeFn = createServerFn({ method: "POST" })
  .inputValidator((data: ReverseGeocodeInput) => data)
  .handler(async ({ data }): Promise<ReverseGeocodeResult> => {
    const token = process.env.MAPBOX_SECRET_TOKEN;

    if (!token) {
      throw new Error("Map geocoding is not configured.");
    }

    const { latitude, longitude } = data;

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new Error("Invalid location coordinates.");
    }

    const url = new URL("https://api.mapbox.com/search/geocode/v6/reverse");

    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("access_token", token);
    url.searchParams.set("country", "PH");
    url.searchParams.set("language", "en");

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("Unable to determine the address for this location.");
    }

    const payload = (await response.json()) as {
      features?: Array<{
        id?: string;
        place_name?: string;
        properties?: {
          address?: string;
          postcode?: string;
        };
        text?: string;
        context?: Array<{
          id?: string;
          text?: string;
          wikidata?: string;
        }>;
      }>;
    };

    const feature = payload.features?.[0];

    if (!feature) {
      throw new Error("No address was found for this location.");
    }

    const context = feature.context ?? [];

    const findContext = (...types: string[]) =>
      context.find((item) => types.some((type) => item.id?.startsWith(`${type}.`)))?.text ?? "";

    const addressLine = feature.properties?.address ?? feature.text ?? "";

    const barangay = findContext("locality", "neighborhood", "district");

    const city = findContext("place", "municipality");

    const province = findContext("region");

    const postalCode = feature.properties?.postcode ?? findContext("postcode");

    return {
      latitude,
      longitude,
      place_name: feature.place_name ?? addressLine,
      address: {
        line1: addressLine,
        barangay,
        city,
        province,
        postal_code: postalCode,
      },
    };
  });
