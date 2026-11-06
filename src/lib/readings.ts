import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";

// This matches the existing sensor_readings columns supplied for CARBengine.
export type SensorReading = {
  id?: string | number;
  device_id: string;
  recorded_at: string;
  voltage_v: number | string;
  current_a: number | string;
  power_w: number | string;
  energy_kwh: number | string;
  frequency_hz: number | string | null;
  power_factor: number | string | null;
};

function requireClient() {
  if (!supabase) throw new Error("Supabase is not configured. Add your project URL and publishable/anon key to .env.local.");
  return supabase;
}

const readingColumns = "device_id, recorded_at, voltage_v, current_a, power_w, energy_kwh, frequency_hz, power_factor";

export async function fetchLatestReading(deviceId: string) {
  const client = requireClient();
  const { data, error } = await client
    .from("sensor_readings")
    .select(readingColumns)
    .eq("device_id", deviceId)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data || null) as SensorReading | null;
}

export async function fetchFirstReadingSince(deviceId: string, from: string) {
  const client = requireClient();
  const { data, error } = await client
    .from("sensor_readings")
    .select("recorded_at, energy_kwh")
    .eq("device_id", deviceId)
    .gte("recorded_at", from)
    .order("recorded_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data || null) as Pick<SensorReading, "recorded_at" | "energy_kwh"> | null;
}

export async function fetchReadings(deviceId: string, from: string, maxRows = 20000) {
  const client = requireClient();
  const pageSize = 1000;
  const rows: SensorReading[] = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data, error } = await client
      .from("sensor_readings")
      .select(readingColumns)
      .eq("device_id", deviceId)
      .gte("recorded_at", from)
      .order("recorded_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (data || []) as SensorReading[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

export function subscribeToReadings(
  deviceId: string,
  onInsert: (reading: SensorReading) => void,
  onStatus: (status: string) => void,
): { channel: RealtimeChannel; client: NonNullable<typeof supabase> } {
  const client = requireClient();
  const channel = client
    .channel(`live-readings-${deviceId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "sensor_readings", filter: `device_id=eq.${deviceId}` },
      payload => onInsert(payload.new as SensorReading),
    )
    .subscribe(onStatus);
  return { channel, client };
}
