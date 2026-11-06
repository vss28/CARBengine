# Chapter 5: Results and Discussion

## 5.1 Implemented Features and System Status

CARBengine is a browser-based energy-monitoring prototype built with React and TypeScript. Supabase provides authentication, access-controlled database reads, and real-time notifications. A Python FastAPI service provides the River sensor-forecast endpoint and monthly SARIMAX bill forecasts. The application reads sensor records from an existing Supabase table; the ESP32 firmware, sensor-upload endpoint, and database provisioning are maintained outside this repository.

The current sidebar shows nine Monitoring tabs in this order: Know Your Carbon, Live Monitoring, Energy & Carbon Analytics, Cost & Green Tax, Bill History & Forecast, Anomaly Monitor, Carbon Goals, Campus Audit, and Device. The Administration section contains User Management and Tab Permissions. Access permissions can hide tabs for some roles. The table below uses the labels shown in the sidebar; where the page heading differs, that heading is included in parentheses.

| Sidebar tab (page heading, if different) | Implemented function | Current evidence boundary |
|---|---|---|
| Know Your Carbon | Calculates estimated student commute emissions from an origin, destination, route distance, selected travel mode, and configured factor. | The screenshot values are route and factor estimates, not measurements of actual student travel. |
| Live Monitoring | Displays voltage, current, active power, cumulative energy, frequency, and power factor. Uses Supabase Realtime with a five-second latest-reading query as a fallback. | Depends on a correctly configured sensor table and incoming readings. Up to and including 15 seconds is fresh, over 15 and up to 60 seconds is delayed, and over 60 seconds is offline. |
| Energy & Carbon Analytics | Provides time-filtered sensor history, energy summaries, carbon estimates, and the five-minute River forecast. | Carbon is calculated from readings and a configured factor; it is not directly measured. |
| Cost & Green Tax | Estimates period electricity cost and an illustrative green-tax allocation. | Uses fixed example rates, not a tariff or tax assessment from an actual utility bill. |
| Bill History & Forecast | Shows monthly source data and SARIMAX forecasts for consumption, maximum demand, and bill amount. The API returns forecasts for up to 12 months with nominal 95% model intervals. | The current local model input is a source-unverified series containing adjusted and synthetic values. The dashboard does not currently visualize the interval bounds. |
| Anomaly Monitor (Campus Anomaly Monitor) | Shows one configured sensor on a campus plan with power display bands and connectivity status. | No statistical anomaly-detection model or expected-use baseline is implemented. |
| Carbon Goals (Carbon Reduction Goals) | Lets users explore energy-reduction scenarios using selectable conservation actions. | Projected savings are scenario estimates, not measured reductions. |
| Campus Audit (Campus Sustainability Audit) | Records user-entered electricity, water, waste, and recycling entries and calculates indicative emissions. | Entries are stored in the current browser's local storage. Supporting files are not uploaded, and the displayed status is not independent verification. |
| Device | Displays the configured device identity, reading details, and connectivity state. | Reports the latest data available through the configured Supabase connection. |
| User Management | Provides administrator tools for account search, role and department updates, and protected account deletion. | Requires the external Supabase project and its role setup to be configured correctly. |
| Tab Permissions | Provides an administrator interface for role-based dashboard access. | Effective enforcement depends on the corresponding Supabase policies and API checks. |

Together, these modules demonstrate an integrated interface for sensor data, monthly bill forecasts, carbon and cost estimates, planning scenarios, and administration. Their presence in the application demonstrates implementation, but does not by itself establish measurement accuracy, operational reliability, or real-world environmental savings.

## 5.2 Dashboard Screenshots and Functional Observations

The dashboard provides a shared interface for sensor readings, historical analytics, bill forecasts, and administrative functions. The observations below describe the implemented behavior. Numeric values in screenshots should be identified by their source and period; a screenshot of the interface alone is not evidence of field validation.

### 5.2.1 Know Your Carbon

The supplied screenshot shows the Know Your Carbon tab, confirming that it is present in the current dashboard. The displayed route runs from Kothrud, Pune, to Vidyalankar Institute of Technology in Wadala East, Mumbai, with an OSRM route distance of 8.5 km. The Bike option is selected and displays 0.510 kg CO₂e per trip, compared with 1.445 kg CO₂e for the solo-car reference, or approximately 65% lower. These are estimates based on the selected route and configured travel factors; they are not measured student journeys.

The same screenshot reports that the monitored device is offline and that its last reading was 288 hours ago. Therefore, it demonstrates the travel-estimation interface but does not show a current live sensor reading.

**Figure 5.1: Know Your Carbon tab with the selected commute route and travel-mode estimates.**

### 5.2.2 Live Monitoring Dashboard

The Live Monitoring page displays voltage, current, active power, cumulative energy, frequency, and power factor for the configured device. New database inserts can update the page through Supabase Realtime, while a five-second query checks for the latest reading as a fallback. The freshness indicator uses the latest reading's timestamp to distinguish fresh, delayed, and offline states. When a reading is stale, the live metric cards do not present it as a current measurement.

**Insert Figure 5.2: Live Energy Monitoring Dashboard.**

### 5.2.3 Energy & Carbon Analytics

The analytics page provides date and time filters, sensor-history charts, energy summaries, carbon estimates, and a searchable reading table. Where valid cumulative meter values are available, period energy is derived from the difference between the first and last readings. The application can also estimate energy by integrating adjacent power readings, excluding gaps longer than five minutes. Emissions are calculated from the resulting energy estimate and the configured grid factor.

**Insert Figure 5.3: Energy & Carbon Analytics Dashboard.**

### 5.2.4 Cost & Green Tax

This tab estimates period electricity cost and a green-tax allocation using configured per-kWh rates. These outputs are illustrative calculations and are not extracted from a verified utility tariff or tax assessment.

**Insert Figure 5.4: Cost & Green Tax Dashboard.**

### 5.2.5 Bill History & Forecast

The Bill History & Forecast page separates monthly records by meter and source classification. For the current local data, it displays the processed monthly series and the SARIMAX forecast. The series identifies untouched, adjusted, and synthetic rows so users can distinguish source records from estimates.

**Insert Figure 5.5: Bill History & Forecast Dashboard.**

### 5.2.6 Other Dashboard Tabs

Supporting screenshots may show Anomaly Monitor, Carbon Goals, Campus Audit, Device, User Management, and Tab Permissions. Use the visible sidebar labels in figure captions. The Anomaly Monitor's power bands are display thresholds, not validated anomaly detections; Carbon Goals shows possible savings, not measured savings. Label calculated and scenario outputs as estimates.

**Insert Figure 5.6: Supporting dashboard tabs (composite screenshot).**

## 5.3 Monthly Billing Dataset Analysis

The project contains a raw bill CSV and a processed working copy used by the local forecasting API. The raw file spans January 2019 to December 2025 and contains 95 rows across three source labels. The processed file contains 84 consecutive monthly rows for one source series and is preferred by the API when available.

| Dataset characteristic | Current value |
|---|---:|
| Raw bill records | 95 |
| Raw rows labeled `SECONDARY_SOURCE_UNVERIFIED` | 48 |
| Raw rows labeled `ACTUAL_FROM_USER_PDF` | 11 |
| Raw rows labeled `SYNTHETIC_DEMO_ONLY` | 36 |
| Processed monthly rows used by the current model | 84 |
| Untouched source rows in the processed series (`historical`) | 25 |
| Adjusted estimates in the processed series | 23 |
| Synthetic extension rows in the processed series | 36 |
| Independently verified rows in the current model input | 0 |

The 11 PDF-labeled rows are pending verification in the forecasting code: a PDF label alone is not treated as a verified source. They are not part of the current 84-row processed model input. The 84-row series instead contains 25 unchanged rows from an unverified secondary source, 23 adjusted estimates, and 36 synthetic rows. “Untouched” means that a row was not changed by the processing script; it does not mean that its source was independently verified.

The processing script preserves the raw CSV and writes adjustments to a separate processed file. It replaces the sustained low-consumption segment from April 2020 through February 2022 with seasonal estimates and extends the series from January 2023 through December 2025 with synthetic values. Therefore, 59 of the 84 model-input rows are adjusted or generated estimates. The continuous series supports exploration of the forecasting workflow, but it cannot be treated as 84 independent campus-bill observations.

**Insert Figure 5.7: Billing dataset composition and row provenance.**  
**Insert Figure 5.8: Monthly electricity-consumption series.**  
**Insert Figure 5.9: Monthly bill-amount series.**

Plots should distinguish untouched, adjusted, and synthetic rows. They should not imply that the adjusted or synthetic values were independently measured.

## 5.4 SARIMAX Forecasting Results

The Python forecasting service fits separate monthly SARIMAX models for each meter and source series. The current processed series contains 84 monthly values, so the forward forecast uses annual seasonality and provides up to 12 future monthly values for consumption, maximum demand, and bill amount. The model also returns nominal 95% interval bounds. These are model-based intervals; no interval-coverage result is available.

The saved chronological backtest evaluates the five untouched source months from August through December 2022. It uses the 20 earlier untouched observations for training. Because the backtest training subset contains fewer than 24 observations, this evaluation fit is nonseasonal. The backtest scores consumption and bill amount; it does not report a separate accuracy metric for maximum-demand forecasts.

| Forecast target | Holdout months | MAE | RMSE | MAPE |
|---|---:|---:|---:|---:|
| Electricity consumption | 5 | 719,783.4 kWh | 823,867.0 kWh | 19.48% |
| Bill amount | 5 | ₹3,025,396.4 | ₹4,565,618.5 | 12.77% |

On this holdout, the bill-amount forecast had a lower MAPE than the consumption forecast. These results describe one short evaluation window from a source-unverified series; they should not be interpreted as a guarantee of future forecasting performance.

**Insert Figure 5.10: Actual versus SARIMAX-predicted monthly electricity consumption.**  
**Insert Figure 5.11: Actual versus SARIMAX-predicted monthly bill amount.**  
**Insert Figure 5.12: Twelve-month SARIMAX forecast with nominal 95% interval bounds.**

Backtest plots should distinguish training observations, the five holdout actuals, holdout predictions, and future forecasts. Future estimates must not be presented as observed data.

## 5.5 Comparison with the Persistence Baseline

The technical-paper evaluation compares SARIMAX with a persistence baseline that repeats the last untouched observation before the holdout period (July 2022) for each of the five holdout months. Both methods are scored against the same actual values. The baseline results were calculated for the paper from the saved holdout data; they are not currently exposed as dashboard metrics.

| Target | Metric | SARIMAX | Persistence baseline |
|---|---|---:|---:|
| Consumption | MAE | 719,783.4 kWh | 647,760.0 kWh |
| Consumption | RMSE | 823,867.0 kWh | 720,617.5 kWh |
| Consumption | MAPE | 19.48% | 17.78% |
| Bill amount | MAE | ₹3,025,396.4 | ₹3,637,136.6 |
| Bill amount | RMSE | ₹4,565,618.5 | ₹5,196,109.5 |
| Bill amount | MAPE | 12.77% | 15.07% |

The persistence baseline performed better for consumption on all three reported error metrics. SARIMAX performed better for bill amount on all three metrics. This comparison shows that the more complex model did not outperform the simple baseline for every target. The five-month holdout and uncertain source provenance limit the strength of the conclusion.

**Insert Figure 5.13: SARIMAX and persistence-baseline MAPE comparison.** Lower MAPE indicates lower percentage error.

## 5.6 Energy Consumption and Carbon Estimation

CARBengine estimates electricity-related emissions by multiplying energy use by a configurable emissions factor. The default documented in the project is 0.82 kg CO₂e/kWh.

\[
C = E \times F
\]

where \(C\) is estimated emissions in kg CO₂e, \(E\) is electricity use in kWh, and \(F\) is the emissions factor in kg CO₂e/kWh. For example, 100 kWh gives an estimated 82 kg CO₂e at the default factor.

The cost page uses an illustrative electricity rate of ₹11.80/kWh and an illustrative green-tax allocation of ₹12.85/kWh. For 100 kWh, these values produce an estimated cost of ₹1,180 and a green-tax allocation of ₹1,285. The allocation is an interface assumption, not a legally assessed tax or a verified utility-bill charge.

These results depend on the accuracy of the meter values, the selected period, and the suitability of the configured emissions factor. The factor is not a live regional grid-intensity feed, so the calculation is an operational estimate rather than an independently verified Scope 2 inventory. Water, waste, recycling, and travel calculations also use configured assumptions and should be reported as indicative estimates.

**Insert Figure 5.14: Energy use and estimated carbon emissions for a stated period.**  
**Insert Figure 5.15: Estimated electricity cost and green-tax allocation.**

## 5.7 Limitations of the Evaluation

1. **Billing-data provenance:** The current 84-row model input has no independently verified rows. It contains 25 untouched but unverified records, 23 adjusted estimates, and 36 synthetic rows. The 11 PDF-labeled rows in the raw file remain pending verification.
2. **Short forecasting evaluation:** SARIMAX and persistence are compared over only five holdout months from one source series. The result does not establish performance across years, meters, or campuses.
3. **Different training and evaluation data:** The forward seasonal model is fitted on the full mixed-origin 84-month series, while the reported backtest uses only 20 earlier untouched rows and a nonseasonal fit. The backtest therefore does not directly validate the forward seasonal model trained on the extended series.
4. **No maximum-demand accuracy score:** The service can generate maximum-demand forecasts, but the saved evaluation reports metrics only for consumption and bill amount.
5. **Sensor forecast and measurement validation:** River provides a five-minute online power forecast and can report an online MAE as matching sensor outcomes arrive. No local sensor time series or fixed River evaluation snapshot is available for a reproducible numerical accuracy claim. No reference-meter calibration results are included.
6. **Hardware and ingestion scope:** The repository does not include the ESP32 firmware or upload endpoint, and it does not document a physical bench test. End-to-end device behavior cannot be verified from the dashboard source alone.
7. **Anomaly and planning features:** The anomaly page uses display bands and connectivity thresholds rather than a validated statistical detector. Carbon-reduction outputs are scenarios and do not establish achieved savings.
8. **Audit and sustainability assumptions:** Audit entries are stored in browser local storage; selected supporting documents are not uploaded, and the interface's status is not independent review. Emissions, travel, cost, and green-tax calculations rely on configured assumptions.
9. **Deployment constraints:** The local bill forecast reads a local CSV. A hosted service cannot use that local file unless the data is migrated or otherwise made available to the deployed backend. Authentication and role enforcement also depend on correct Supabase configuration.

These limitations define the evidence available from the current project. They do not negate the prototype's value as an integrated monitoring and forecasting demonstration, but they restrict claims about campus-scale accuracy and readiness.

## 5.8 Proposed Field and Model Validation

Further work should establish measurement, data, and model performance under documented operating conditions:

- **Meter validation:** Compare PZEM-004T readings with a suitable reference instrument across known loads. Record voltage, current, power, energy, instrument details, and calibration dates.
- **Device communication:** Document and test the ESP32 firmware, authenticated upload path, timestamp handling, and delivery of readings to Supabase.
- **Verified billing history:** Collect original bills and meter records, reconcile meter identifiers and billing periods, and preserve source documents. Keep every correction or estimate labeled separately.
- **Bill-forecast evaluation:** Use verified historical values and several chronological rolling holdouts. Compare SARIMAX with persistence on the same months and report MAE, RMSE, MAPE, and interval coverage. Evaluate maximum-demand predictions separately.
- **River evaluation:** Collect a timestamped sensor series, evaluate five-minute predictions on later observed readings, compare with a persistence baseline, and report the number of matched outcomes and errors in watts.
- **Anomaly detection:** Build and validate an expected-use baseline that accounts for time, occupancy, and building function before describing deviations as statistical anomalies.
- **Factor verification:** Document the source, region, units, and validity period for emissions and travel factors, as well as the actual tariff rules used for any financial reporting.
- **Audit workflow:** Store records and supporting documents in an authorized shared service and require review evidence before labeling entries as verified.
- **Campus field trial:** Deploy to multiple locations and record availability, data gaps, device reliability, forecast performance, update latency, and usability over a defined period.

These activities would allow future results to distinguish measured observations from estimates, model predictions, and planning scenarios, and would provide stronger evidence of the system's practical performance.
