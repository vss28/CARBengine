import { getCurrentAccessToken } from "./supabase";

export type RiverForecastStatus = "ready" | "warming" | "stale" | "unconfigured" | "connecting" | "error";

export type RiverForecast = {
  status: RiverForecastStatus;
  samples: number;
  minimumReadySamples: number;
  pendingSamples: number;
  lastRecordedAt: string | null;
  powerW: number | null;
  maeW: number | null;
  error?: string;
};

export type LivePowerForecast = RiverForecast & {
  energyKwh: number | null;
  carbonKg: number | null;
};

const RIVER_API_URL = import.meta.env.VITE_RIVER_API_URL?.trim().replace(/\/+$/, "") ?? "";

const emptyForecast = (status: RiverForecastStatus, error?: string): RiverForecast => ({
  status,
  samples: 0,
  minimumReadySamples: 12,
  pendingSamples: 0,
  lastRecordedAt: null,
  powerW: null,
  maeW: null,
  ...(error ? { error } : {}),
});

export async function fetchRiverForecast(deviceId: string): Promise<RiverForecast> {
  if (!RIVER_API_URL) {
    return emptyForecast("unconfigured", "Set VITE_RIVER_API_URL to the deployed River service URL.");
  }
  const accessToken = await getCurrentAccessToken();
  if (!accessToken) throw new Error("Sign in to load the live forecast.");

  const response = await fetch(
    `${RIVER_API_URL}/api/forecast?device_id=${encodeURIComponent(deviceId)}`,
    { headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { detail?: unknown } | null;
    throw new Error(typeof problem?.detail === "string" ? problem.detail : `River service returned HTTP ${response.status}.`);
  }

  const payload = await response.json() as Partial<RiverForecast>;
  if (!(["ready", "warming", "stale"] as const).includes(payload.status as "ready" | "warming" | "stale")) {
    throw new Error("River service returned an invalid forecast response.");
  }

  return {
    status: payload.status as RiverForecastStatus,
    samples: Number.isFinite(payload.samples) ? Number(payload.samples) : 0,
    minimumReadySamples: Number.isFinite(payload.minimumReadySamples) ? Number(payload.minimumReadySamples) : 12,
    pendingSamples: Number.isFinite(payload.pendingSamples) ? Number(payload.pendingSamples) : 0,
    lastRecordedAt: typeof payload.lastRecordedAt === "string" ? payload.lastRecordedAt : null,
    powerW: Number.isFinite(payload.powerW) ? Number(payload.powerW) : null,
    maeW: Number.isFinite(payload.maeW) ? Number(payload.maeW) : null,
  };
}

export function projectRiverForecast(
  forecast: RiverForecast,
  emissionFactorKgPerKwh: number,
): LivePowerForecast {
  if (forecast.powerW === null || (forecast.status !== "ready" && forecast.status !== "warming")) {
    return { ...forecast, energyKwh: null, carbonKg: null };
  }

  const energyKwh = forecast.powerW / 1000 * (5 / 60);
  return {
    ...forecast,
    energyKwh,
    carbonKg: energyKwh * emissionFactorKgPerKwh,
  };
}

export function riverForecastError(previous: RiverForecast, error: unknown): RiverForecast {
  return {
    ...previous,
    status: "error",
    powerW: null,
    maeW: null,
    error: error instanceof Error ? error.message : "Could not reach the River forecast service.",
  };
}

export function initialRiverForecast(): RiverForecast {
  return emptyForecast(RIVER_API_URL ? "connecting" : "unconfigured");
}
