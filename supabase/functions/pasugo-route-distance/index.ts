import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");

    if (!apiKey) {
      throw new Error("GOOGLE_MAPS_API_KEY is not configured");
    }

    const body = await req.json();

    const { pickup, delivery } = body;

    if (
      typeof pickup?.latitude !== "number" ||
      typeof pickup?.longitude !== "number" ||
      typeof delivery?.latitude !== "number" ||
      typeof delivery?.longitude !== "number"
    ) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "pickup and delivery coordinates are required",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const googleResponse = await fetch(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
        },
        body: JSON.stringify({
          origin: {
            location: {
              latLng: {
                latitude: pickup.latitude,
                longitude: pickup.longitude,
              },
            },
          },
          destination: {
            location: {
              latLng: {
                latitude: delivery.latitude,
                longitude: delivery.longitude,
              },
            },
          },
          travelMode: "DRIVE",
        }),
      },
    );

    const result = await googleResponse.json();

    if (!googleResponse.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          googleStatus: googleResponse.status,
          error: result,
        }),
        {
          status: googleResponse.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const route = result.routes?.[0];

    if (!route || typeof route.distanceMeters !== "number") {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "No road route found between pickup and delivery",
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const distanceKm = Math.round((route.distanceMeters / 1000) * 100) / 100;

    return new Response(
      JSON.stringify({
        ok: true,
        distanceMeters: route.distanceMeters,
        distanceKm,
        duration: route.duration ?? null,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});
