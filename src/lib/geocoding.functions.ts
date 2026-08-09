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

interface NominatimAddress {
  house_number?: string;
  road?: string;
  street?: string;
  pedestrian?: string;
  footway?: string;
  residential?: string;
  path?: string;

  barangay?: string;
  neighbourhood?: string;
  neighborhood?: string;
  suburb?: string;
  quarter?: string;
  locality?: string;
  village?: string;
  town?: string;
  municipality?: string;
  city?: string;

  city_district?: string;
  district?: string;
  county?: string;
  state_district?: string;

  state?: string;
  region?: string;
  province?: string;

  postcode?: string;

  country?: string;
  country_code?: string;
}

interface NominatimResult {
  place_id?: number;
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: NominatimAddress;
}

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";

const NOMINATIM_HEADERS = {
  Accept: "application/json",
  "User-Agent": "RushOrderPH/1.0 (https://rushorderph.online)",
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const result = clean(value);

    if (result) {
      return result;
    }
  }

  return "";
}

function parseCoordinates(result: NominatimResult): {
  latitude: number;
  longitude: number;
} {
  const latitude = Number(result.lat);
  const longitude = Number(result.lon);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error("The geocoding service returned invalid coordinates.");
  }

  return {
    latitude,
    longitude,
  };
}

function buildLine1(address: NominatimAddress): string {
  const houseNumber = firstNonEmpty(address.house_number);

  const street = firstNonEmpty(
    address.road,
    address.street,
    address.residential,
    address.pedestrian,
    address.footway,
    address.path,
  );

  return [houseNumber, street].filter(Boolean).join(" ").trim();
}

function parseAddress(address: NominatimAddress | undefined) {
  const source = address ?? {};

  const line1 = buildLine1(source);

  const barangay = firstNonEmpty(
    source.barangay,
    source.suburb,
    source.neighbourhood,
    source.neighborhood,
    source.quarter,
    source.village,
    source.locality,
  );

  const city = firstNonEmpty(
    source.municipality,
    source.city,
    source.town,
    source.city_district,
    source.district,
    source.county,
  );

  const province = firstNonEmpty(
    source.province,
    source.state,
    source.region,
    source.state_district,
  );

  const postalCode = firstNonEmpty(source.postcode);

  return {
    line1,
    barangay,
    city,
    province,
    postal_code: postalCode,
  };
}

/**
 * Forward geocoding:
 * human-readable address -> latitude / longitude.
 *
 * Used by checkout when the user enters an address manually.
 */
export const geocodeAddressFn = createServerFn({ method: "POST" })
  .inputValidator((data: GeocodeAddressInput) => data)
  .handler(async ({ data }): Promise<GeocodeResult> => {
    const address = [
      data.line1,
      data.barangay,
      data.city,
      data.province,
      data.postal_code,
      "Philippines",
    ]
      .map(clean)
      .filter(Boolean)
      .join(", ");

    if (address.length < 8) {
      throw new Error("Enter a more complete delivery address.");
    }

    const url = new URL(`${NOMINATIM_BASE_URL}/search`);

    url.searchParams.set("q", address);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("countrycodes", "ph");
    url.searchParams.set("limit", "1");
    url.searchParams.set("accept-language", "en");

    const response = await fetch(url, {
      headers: NOMINATIM_HEADERS,
    });

    if (!response.ok) {
      throw new Error("Unable to locate this delivery address.");
    }

    const payload = (await response.json()) as NominatimResult[];

    const result = payload[0];

    if (!result) {
      throw new Error("We could not find this delivery address.");
    }

    const coordinates = parseCoordinates(result);

    return {
      ...coordinates,
      place_name: result.display_name ?? address,
    };
  });

/**
 * Reverse geocoding:
 * browser GPS coordinates -> human-readable address.
 *
 * Used by My Store / customer address location flows.
 */
export const reverseGeocodeFn = createServerFn({ method: "POST" })
  .inputValidator((data: ReverseGeocodeInput) => data)
  .handler(async ({ data }): Promise<ReverseGeocodeResult> => {
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

    const url = new URL(`${NOMINATIM_BASE_URL}/reverse`);

    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("zoom", "18");
    url.searchParams.set("accept-language", "en");

    const response = await fetch(url, {
      headers: NOMINATIM_HEADERS,
    });

    if (!response.ok) {
      const responseText = await response.text();

      console.error("Nominatim reverse geocoding failed:", {
        status: response.status,
        statusText: response.statusText,
        response: responseText,
      });

      throw new Error(
        `Unable to determine the address for this location. HTTP ${response.status}.`,
      );
    }

    const result = (await response.json()) as NominatimResult;

    if (!result || !result.display_name) {
      throw new Error("No address was found for this location.");
    }

    return {
      latitude,
      longitude,
      place_name: result.display_name,
      address: parseAddress(result.address),
    };
  });
