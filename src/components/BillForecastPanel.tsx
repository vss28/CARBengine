import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, RefreshCw, Wallet, Zap } from "lucide-react";
import {
  CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { fetchBillForecast, type BillForecast, type BillForecastPoint } from "../lib/billForecast";
import "./billForecast.css";
import "./billForecastOverrides.css";

type Metric = "consumptionKwh" | "billAmountInr";

function metricValue(point: BillForecastPoint | undefined, metric: Metric): number | null {
  const value = point?.[metric];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function rupees(value: number): string {
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value)}`;
}

export default function BillForecastPanel() {
  const [data, setData] = useState<BillForecast | null>(null);
  const [metric, setMetric] = useState<Metric>("consumptionKwh");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await fetchBillForecast();
      setData(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load the bill forecasting service.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!data?.actuals.length) return;
    setDateFrom(data.actuals[0].billingMonth);
    setDateTo(data.actuals[data.actuals.length - 1].billingMonth);
  }, [data]);

  const points = useMemo(() => {
    if (!data) return [];
    const historyByMonth = new Map(data.actuals.map(point => [point.billingMonth, point]));
    const forecastByMonth = new Map(data.forecasts.map(point => [point.billingMonth, point]));
    const months = [...new Set([...historyByMonth.keys(), ...forecastByMonth.keys()])].sort();
    return months.map(billingMonth => {
      const historical = historyByMonth.get(billingMonth);
      const forecast = forecastByMonth.get(billingMonth);
      return {
        billingMonth,
        historical: metricValue(historical, metric),
        forecast: metricValue(forecast, metric),
      };
    });
  }, [data, metric]);

  const datasetRows = useMemo(() => (data?.actuals ?? []).filter(row =>
    (!dateFrom || row.billingMonth >= dateFrom) && (!dateTo || row.billingMonth <= dateTo),
  ), [data, dateFrom, dateTo]);

  const lastForecast = data?.forecasts[data.forecasts.length - 1];
  const nextForecast = data?.forecasts[0];
  const latestValueRow = data?.actuals[data.actuals.length - 1];
  const formatValue = metric === "consumptionKwh" ? compactNumber : rupees;
  const metricLabel = metric === "consumptionKwh" ? "kWh" : "INR";
  const latestValue = metricValue(lastForecast, metric);
  const latestDatasetValue = metricValue(latestValueRow, metric);
  const nextForecastValue = metricValue(nextForecast, metric);
  const forecastStart = data?.forecasts[0]?.billingMonth;
  const forecastEnd = lastForecast?.billingMonth;
  const datasetStart = data?.actuals[0]?.billingMonth ?? "";
  const datasetEnd = data?.actuals[data.actuals.length - 1]?.billingMonth ?? "";
  const performance = data?.performance;
  const holdoutMonths = performance?.months ?? [];
  const holdoutRange = holdoutMonths.length
    ? `${holdoutMonths[0]} – ${holdoutMonths[holdoutMonths.length - 1]}`
    : "—";
  const backtestRows = useMemo(() => {
    if (performance?.status !== "ready") return [];
    const targets = [
      { key: "consumptionKwh", label: "Consumption" },
      { key: "billAmountInr", label: "Bill amount" },
    ] as const;
    return holdoutMonths.flatMap((month, index) => targets.flatMap(target => {
      const actual = performance.actuals?.[target.key]?.[index];
      const predicted = performance.predictions?.[target.key]?.[index];
      if (typeof actual !== "number" || typeof predicted !== "number") return [];
      return [{
        month,
        label: target.label,
        target: target.key,
        actual,
        predicted,
        errorPercent: actual === 0 ? null : Math.abs(predicted - actual) / Math.abs(actual) * 100,
      }];
    }));
  }, [performance, holdoutMonths]);

  function performanceValue(value: number | null | undefined, target: Metric) {
    if (typeof value !== "number" || !Number.isFinite(value)) return "—";
    return target === "consumptionKwh" ? `${compactNumber(value)} kWh` : rupees(value);
  }

  return <section className="planning-only planning-content bill-forecast-content">
    <article className="card bill-forecast-card">
      <div className="card-heading">
        <div>
          <div className="heading-label"><span className="section-icon"><Activity /></span><h2>Monthly bill forecast</h2></div>
          <p>Monthly SARIMAX forecast · up to 12-month horizon</p>
        </div>
        <div className="bill-forecast-actions">
          <button className="icon-button" type="button" onClick={() => void load()} title="Refresh bill data" aria-label="Refresh bill data" disabled={loading}><RefreshCw /></button>
        </div>
      </div>

      {error && <div className="bill-forecast-alert"><AlertTriangle /><span>{error}</span></div>}

      <div className="bill-forecast-controls">
        <div className="bill-metric-toggle" role="group" aria-label="Forecast metric">
          <button type="button" className={metric === "consumptionKwh" ? "selected" : ""} onClick={() => setMetric("consumptionKwh")}><Zap />Consumption</button>
          <button type="button" className={metric === "billAmountInr" ? "selected" : ""} onClick={() => setMetric("billAmountInr")}><Wallet />Bill amount</button>
        </div>
      </div>

      <div className="bill-summary-stats">
        <article><span>{metric === "consumptionKwh" ? <Zap /> : <Wallet />}Latest dataset value</span><b>{latestDatasetValue === null ? "—" : formatValue(latestDatasetValue)}</b><small>{latestValueRow?.billingMonth ?? "No bill data yet"}</small></article>
        <article><span><Activity />Next month estimate</span><b>{nextForecastValue === null ? "—" : formatValue(nextForecastValue)}</b><small>{nextForecast?.billingMonth ?? "Available when forecast is ready"} · {metricLabel}</small></article>
        <article><span><Activity />Forecast window</span><b>{data?.forecasts.length ? `${data.forecasts.length} months` : "—"}</b><small>{forecastStart && forecastEnd ? `${forecastStart} – ${forecastEnd}` : "No forecast available yet"}</small></article>
      </div>

      <div className="bill-forecast-chart-heading">
        <div><b>{metric === "consumptionKwh" ? "Monthly consumption" : "Monthly bill amount"}</b><small>{data?.coverage.start && data.coverage.end ? `${data.coverage.start} – ${data.coverage.end} · ${data.coverage.months} calendar months` : "Selected source history will appear here"}</small></div>
        {latestValue !== null && <span>Latest forecast <b>{formatValue(latestValue)}</b></span>}
      </div>

      <div className="bill-forecast-chart">
        {points.length > 0 ? <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 10, right: 12, left: 6, bottom: 4 }}>
            <CartesianGrid stroke="#edf1ee" vertical={false} />
            <XAxis dataKey="billingMonth" tick={{ fill: "#87938b", fontSize: 9 }} minTickGap={28} axisLine={{ stroke: "#e8eeea" }} tickLine={false} />
            <YAxis tickFormatter={value => formatValue(Number(value))} tick={{ fill: "#87938b", fontSize: 9 }} axisLine={false} tickLine={false} width={64} />
            <Legend />
            <Tooltip formatter={(value, name) => [value == null ? "—" : `${formatValue(Number(value))} ${metricLabel}`, name === "Historical values" ? "Historical values" : "SARIMAX forecast"]} labelFormatter={label => `Billing month: ${label}`} />
            <ReferenceLine x={data?.coverage.end ?? undefined} stroke="#aebbb2" strokeDasharray="3 4" />
            <Line type="monotone" dataKey="historical" name="Historical values" stroke="#26895d" strokeWidth={2.4} dot={{ r: 3, fill: "#fff", strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="forecast" name="SARIMAX forecast" stroke="#d89c29" strokeWidth={2.4} strokeDasharray="6 4" dot={{ r: 2.5, fill: "#d89c29" }} connectNulls={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer> : <div className="bill-chart-empty"><span><Activity /></span><b>{loading ? "Loading bill history…" : "Monthly history will appear here"}</b><small>{error ? "Check the forecast service connection." : data ? "No monthly records are available in the dataset." : "The forecast service will load the local bill dataset."}</small></div>}
      </div>

      <section className="bill-dataset-section" aria-labelledby="bill-dataset-title">
        <div className="bill-dataset-heading">
          <div><h3 id="bill-dataset-title">Dataset preview</h3><p>{datasetRows.length} of {data?.actuals.length ?? 0} monthly rows · {datasetStart || "—"} to {datasetEnd || "—"}</p></div>
          <div className="bill-dataset-filters">
            <label>From<input type="month" min={datasetStart || undefined} max={datasetEnd || undefined} value={dateFrom} onChange={event => setDateFrom(event.target.value)} /></label>
            <label>To<input type="month" min={datasetStart || undefined} max={datasetEnd || undefined} value={dateTo} onChange={event => setDateTo(event.target.value)} /></label>
          </div>
        </div>
        <p className="bill-dataset-hint">The dataset includes estimated values for some months; the original source file is retained unchanged.</p>
        <div className="bill-dataset-table-wrap">
          <table className="bill-dataset-table">
            <thead><tr><th>Billing month</th><th>Record</th><th>Consumption (kWh)</th><th>Max demand (kVA)</th><th>Bill amount (₹)</th></tr></thead>
            <tbody>
              {datasetRows.map(row => <tr key={`${row.billingMonth}-${row.rowOrigin ?? "historical"}`}>
                <td>{row.billingMonth}</td>
                <td><span className={`bill-row-origin ${row.rowOrigin === "historical" ? "history" : row.rowOrigin === "adjusted" ? "adjusted" : "estimated"}`}>{row.rowOrigin === "adjusted" ? "Adjusted estimate" : row.rowOrigin === "synthetic" ? "Historical estimate" : "Historical"}</span></td>
                <td>{typeof row.consumptionKwh === "number" ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(row.consumptionKwh) : "—"}</td>
                <td>{typeof row.maxDemandKva === "number" ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(row.maxDemandKva) : "—"}</td>
                <td>{typeof row.billAmountInr === "number" ? rupees(row.billAmountInr) : "—"}</td>
              </tr>)}
              {!datasetRows.length && <tr><td colSpan={5} className="bill-dataset-empty">No rows match this date range.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bill-model-performance" aria-labelledby="bill-model-performance-title">
        <div className="bill-model-performance-heading">
          <div><h3 id="bill-model-performance-title">Model performance</h3><p>SARIMAX · {data?.trainingRows ?? 0} monthly values · {data?.horizonMonths ?? 12}-month forecast</p></div>
          <span className="bill-model-performance-tag">{performance?.status === "ready" ? "Evaluated" : "Awaiting evaluation"}</span>
        </div>
        {performance?.status === "ready" ? <>
          <p className="bill-model-performance-summary">Historical backtest · {performance.trainingRows ?? 0} training months · {performance.holdoutMonths ?? holdoutMonths.length} test months ({holdoutRange})</p>

          <div className="bill-performance-accuracy-grid">
            {([
              ["Consumption", "consumptionKwh"],
              ["Bill amount", "billAmountInr"],
            ] as const).map(([label, target]) => {
              const mape = performance.metrics?.[target]?.mapePercent;
              return <article className="bill-performance-accuracy-card" key={target}>
                <span>{label} accuracy estimate <small>(100% − MAPE)</small></span>
                <b>{typeof mape === "number" ? `${(100 - mape).toFixed(1)}%` : "—"}</b>
                <small>Based on {performance.metrics?.[target]?.samples ?? 0} historical test months</small>
              </article>;
            })}
          </div>

          <div className="bill-model-details" aria-label="Model details">
            <div><span>Forecast model</span><b>SARIMAX (1,1,1)</b></div>
            <div><span>Seasonality</span><b>{data?.seasonalModel ? "Annual · 12 months" : "Nonseasonal"}</b></div>
            <div><span>Demand predictor</span><b>{data?.usesMaxDemandPredictor ? "Max demand · kVA" : "Not used"}</b></div>
            <div><span>Forecast horizon</span><b>{data?.horizonMonths ?? 12} months</b></div>
          </div>

          <div className="bill-performance-table-wrap">
            <table className="bill-performance-table">
              <thead><tr><th>Forecast target</th><th>Accuracy estimate</th><th>MAPE <span>(lower is better)</span></th><th>MAE</th><th>RMSE</th></tr></thead>
              <tbody>
                {([
                  ["Consumption", "consumptionKwh"],
                  ["Bill amount", "billAmountInr"],
                ] as const).map(([label, target]) => {
                  const scores = performance.metrics?.[target];
                  return <tr key={target}>
                    <th scope="row">{label}</th>
                    <td>{typeof scores?.mapePercent === "number" ? `${(100 - scores.mapePercent).toFixed(1)}%` : "—"}</td>
                    <td>{typeof scores?.mapePercent === "number" ? `${scores.mapePercent.toFixed(1)}%` : "—"}</td>
                    <td>{performanceValue(scores?.mae, target)}</td>
                    <td>{performanceValue(scores?.rmse, target)}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>

          {backtestRows.length > 0 && <>
            <h4 className="bill-backtest-title">Actual vs model backtest</h4>
            <div className="bill-performance-table-wrap">
              <table className="bill-performance-table bill-backtest-table">
                <thead><tr><th>Month</th><th>Target</th><th>Actual</th><th>Backtest forecast</th><th>Absolute error</th></tr></thead>
                <tbody>{backtestRows.map((row, index) => <tr key={`${row.month}-${row.target}-${index}`}>
                  <td>{row.month}</td>
                  <th scope="row">{row.label}</th>
                  <td>{performanceValue(row.actual, row.target)}</td>
                  <td>{performanceValue(row.predicted, row.target)}</td>
                  <td>{row.errorPercent === null ? "—" : `${row.errorPercent.toFixed(1)}%`}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </>}
          <p className="bill-model-performance-note">Accuracy estimate is calculated as 100% minus MAPE; it is a backtest score, not a guarantee of future results. MAPE, MAE and RMSE measure forecast error. Scores use untouched source months only; adjusted and estimated rows are excluded.</p>
        </> : <p className="bill-model-performance-summary">Performance scores will appear when the backend completes a holdout evaluation.</p>}
      </section>
    </article>
  </section>;
}
