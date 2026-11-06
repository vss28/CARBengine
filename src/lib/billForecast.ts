import { getCurrentAccessToken } from "./supabase";

export type BillForecastStatus =
  | "ready"
  | "limited_history"
  | "insufficient_history"
  | "dataset_missing"
  | "invalid_dataset"
  | "model_error";

export type BillForecastPoint = {
  billingMonth: string;
  rowOrigin?: "historical" | "adjusted" | "synthetic";
  consumptionKwh?: number;
  consumptionKwhLower?: number;
  consumptionKwhUpper?: number;
  billAmountInr?: number;
  billAmountInrLower?: number;
  billAmountInrUpper?: number;
  maxDemandKva?: number | null;
};

export type BillSeries = {
  seriesId: string;
  meterId: string;
  dataType: string;
  sourceQuality: "verified" | "unverified" | "synthetic";
  rows: number;
  start: string | null;
  end: string | null;
  calendarMonths: number;
  missingMonths: string[];
  forecastReady: boolean;
};

export type BillForecastPerformanceMetric = {
  samples: number;
  mae: number | null;
  rmse: number | null;
  mapePercent: number | null;
};

export type BillForecastPerformance = {
  status: string;
  evaluation?: string;
  trainingRows?: number;
  holdoutMonths?: number;
  seasonalFit?: boolean;
  months?: string[];
  metrics?: Partial<Record<"consumptionKwh" | "billAmountInr", BillForecastPerformanceMetric>>;
  actuals?: Partial<Record<"consumptionKwh" | "billAmountInr", number[]>>;
  predictions?: Partial<Record<"consumptionKwh" | "billAmountInr", number[]>>;
};

export type BillForecast = {
  status: BillForecastStatus;
  model: string;
  minimumMonths: number;
  minimumLimitedMonths: number;
  horizonMonths: number;
  datasetFile: string | null;
  sourceCounts: Record<string, number>;
  availableSeries: BillSeries[];
  selectedSeriesId: string | null;
  meterId: string | null;
  dataType: string | null;
  sourceQuality: "verified" | "unverified" | "synthetic" | null;
  productionReady: boolean;
  validatedRows: number;
  rejectedRows: number;
  verifiedRows: number;
  pdfRowsPendingVerification: number;
  unverifiedRowsTrainedSeparately: number;
  syntheticRowsTrainedSeparately: number;
  trainingRows: number;
  actuals: Array<BillForecastPoint & { meterId: string; dataType: string }>;
  forecasts: BillForecastPoint[];
  coverage: {
    start: string | null;
    end: string | null;
    months: number;
    missingMonths: string[];
  };
  usesMaxDemandPredictor?: boolean;
  seasonalModel?: boolean;
  performance?: BillForecastPerformance | null;
  message: string;
};

const API_URL = import.meta.env.VITE_RIVER_API_URL?.trim().replace(/\/+$/, "") ?? "";

export async function fetchBillForecast(seriesId?: string | null): Promise<BillForecast> {
  if (!API_URL) throw new Error("Set VITE_RIVER_API_URL and run the Python backend to load bill forecasts.");
  const accessToken = await getCurrentAccessToken();
  if (!accessToken) throw new Error("Sign in to load bill forecasts.");
  const query = seriesId ? `?series_id=${encodeURIComponent(seriesId)}` : "";
  const response = await fetch(`${API_URL}/api/bills/forecast${query}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { detail?: unknown } | null;
    throw new Error(typeof problem?.detail === "string" ? problem.detail : `Bill forecast service returned HTTP ${response.status}.`);
  }
  const payload = await response.json() as BillForecast;
  if (!payload || typeof payload.status !== "string" || !Array.isArray(payload.forecasts) || !Array.isArray(payload.actuals)) {
    throw new Error("Bill forecast service returned an invalid response.");
  }
  return payload;
}
