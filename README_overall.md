# CARBengine Live Monitoring

CARBengine is a browser-based electricity monitoring dashboard for an ESP32/PZEM sensor pipeline. It reads timestamped measurements from an existing Supabase PostgreSQL table, presents current and historical values, estimates energy-related carbon emissions and costs, and listens for newly inserted readings.

This repository contains the dashboard and a Python forecast API. It does **not** provision the Supabase project, create its sensor database schema, or receive ESP32 uploads. College bill CSVs are private local inputs and are not committed.

## Contents

- [What the app does](#what-the-app-does)
- [Architecture and data flow](#architecture-and-data-flow)
- [Technology](#technology)
- [Project files](#project-files)
- [Requirements and setup](#requirements-and-setup)
- [Environment variables](#environment-variables)
- [Supabase table contract](#supabase-table-contract)
- [Supabase Auth and roles](#supabase-auth-and-roles)
- [Realtime and data freshness](#realtime-and-data-freshness)
- [Pages and navigation](#pages-and-navigation)
- [Calculations and assumptions](#calculations-and-assumptions)
- [Build and deployment](#build-and-deployment)
- [Security](#security)
- [Current scope and limitations](#current-scope-and-limitations)
- [Troubleshooting](#troubleshooting)

## What the app does

- Shows the latest voltage, current, active power, cumulative meter energy, frequency, and power factor for one configured device.
- Updates on Supabase Realtime `INSERT` events and periodically fetches the latest row as a fallback.
- Shows power and estimated carbon-emission history over selectable time ranges.
- Provides historical sensor readings with search and a bounded, internally scrollable table.
- Estimates energy-related electricity cost and an illustrative green-tax allocation.
- Provides a five-minute PZEM power forecast from an online River regression model that learns as new readings arrive.
- Includes a **Bill History & Forecast** area with monthly SARIMAX forecasts, trained separately for each meter and `data_type` source series.
- Displays the user interface in a responsive layout with timestamps formatted for India Standard Time (Asia/Kolkata).

The frontend does not generate sample readings. If Supabase has no matching rows or the latest row is stale, the live metric values are zeroed instead of presenting old values as live.

## Architecture and data flow

```text
PZEM-004T → ESP32 firmware → existing upload service → Supabase PostgreSQL
                                                    ↘ Supabase Realtime → CARBengine React dashboard
                                                     → River Forecast API → CARBengine React dashboard

College bill CSV → local staging folder → verification and per-meter SARIMAX → Bill History & Forecast page
```

The dashboard uses Supabase Auth with a persistent browser session and the publishable/legacy anon key. It reads rows for the configured device from `public.sensor_readings` under the signed-in user's RLS permissions. Realtime `INSERT` events notify the open dashboard; a five-second latest-row poll also runs as a fallback. The River and bill forecast endpoints require a signed-in session and the corresponding module permission. The River service forwards the user's token to Supabase so sensor reads follow the same RLS policies. The admin account-deletion endpoint independently verifies the signed-in user's active admin profile before it uses the server-only Supabase secret. The monthly bill service separately reads `data/bills/raw/` during local development and fits each meter/source series separately.

The ESP32 upload path is not implemented in this repository. Use the upload mechanism already configured for your device. The frontend and River forecasting flow do not need the ESP32 device token or a Supabase secret key. The FastAPI service uses an optional server-only Supabase secret only for the administrator account-deletion endpoint.

## Technology

- **React 19** and **TypeScript** for the UI and application logic.
- **Vite 7** for local development and production bundling.
- **Supabase JavaScript client** (`@supabase/supabase-js`) for Postgres reads and Realtime subscriptions.
- **FastAPI** and **River** for the Python online-learning forecast service. The model is River's scaled online linear regression.
- **Recharts** for time-series charts.
- **Lucide React** for interface icons.
- **Inter** and **DM Sans** web fonts loaded by `index.html`.
- **Vercel** configuration for static hosting and single-page-app route fallback.

Exact dependency versions and scripts are defined in `package.json` and locked in `package-lock.json`.

## Project files

### Application source

| File | Purpose |
| --- | --- |
| `src/main.tsx` | Browser entry point. Mounts the React app in Strict Mode and imports the global and app-specific stylesheets. |
| `src/App.tsx` | Main single-page application: hash-based page selection, sidebar navigation, Supabase state and subscriptions, live device status, metric cards, charts, filters, history, and cost/carbon summaries. |
| `src/app.css` | Component and page styling, responsive layout, transitions, chart/table presentation, and page-specific visual treatments. |
| `src/anomaly.css` | Dedicated Campus Anomaly Monitor layout, responsive styling, cropped architectural-plan presentation, sensor marker, and one-device status cards. |
| `src/lib/supabase.ts` | Creates the browser Supabase client from Vite environment variables. Supports the publishable key variable and legacy anon-key fallback. |
| `src/components/AuthProvider.tsx` | Persists the Supabase session, loads the user's active role and module permissions, and shows the sign-in screen. |
| `src/components/AdminAccessPanels.tsx` | Admin screens for searching/filtering accounts, assigning roles/departments, deleting accounts, and dashboard-tab permissions. |
| `supabase/role_access_setup.sql` | Adds role-table RLS policies, seeds suggested role permissions, and protects sensor reads. |
| `src/lib/readings.ts` | Sensor-reading types and Supabase data access: latest row, first row since a date, paginated history, and filtered Realtime subscription. |
| `src/lib/forecast.ts` | Calls the River API, reports service/model status, and derives five-minute energy and carbon estimates from the predicted power. |
| `src/lib/billForecast.ts` | Reads monthly bill-model outputs from the Python API. |
| `src/components/BillForecastPanel.tsx` | Bill-source readiness, meter selection, and consumption/bill forecast chart. |
| `backend/app.py` | FastAPI service for River's live PZEM forecast, monthly bill forecasts, and secure admin account deletion. |
| `backend/bill_forecast.py` | Validates local bill CSVs, keeps meter/source series separate, and reuses saved seasonal or limited-history SARIMAX models. |
| `backend/model_store.py` | Persists local SARIMAX artifacts and cached chronological holdout metrics. |
| `backend/requirements.txt` | Python dependencies for the River and SARIMAX forecasting services. |
| `backend/.env.example` | Server-side Supabase, device, timezone, CORS, and optional bill-file configuration template. |
| `data/bills/README.md` | Bill-data header, verification, SARIMAX, and Supabase guidance. |
| `data/bills/raw/` | Local-only folder for the original CSV/Excel bill dataset; contents are ignored by Git. |
| `public/maps/campus-floor-plan.jpg` | User-provided Floor 1 architectural plan shown in the Anomaly Monitor. The UI crops the drawing through an SVG viewport without altering the source file; `ELEC-01` is marked in the identified classroom at an approximate location. |
| `public/maps/campus-internal-elevations.jpg` | Stored user-provided supporting architectural reference; not currently presented as a selectable view in the Anomaly Monitor. |
| `public/maps/campus-concrete-warp-detail.jpg` | Stored user-provided concrete warp plan/elevation/section reference; not currently presented as a selectable view in the Anomaly Monitor. |
| `public/maps/campus-front-elevation.jpg` | Stored user-provided external front-elevation reference; not currently presented as a selectable view in the Anomaly Monitor. |

### Root, configuration, and deployment files

| File | Purpose |
| --- | --- |
| `index.html` | HTML shell, page metadata, font loading, and React mount element. |
| `styles.css` | Global/base styles shared across the application. |
| `vite-env.d.ts` | Vite client type declarations used by TypeScript. |
| `vite.config.ts` | Vite configuration and React plugin registration. |
| `tsconfig.json` | TypeScript project references for the app and tooling configurations. |
| `tsconfig.app.json` | TypeScript settings for browser application source. |
| `tsconfig.node.json` | TypeScript settings for Node-based Vite configuration. |
| `package.json` | Project metadata, dependencies, and npm scripts. |
| `package-lock.json` | Reproducible npm dependency lockfile. |
| `scripts/start-local.ps1` | Starts FastAPI in the background, waits for its health check, then runs the React development server in the same terminal. |
| `.env.example` | Safe template showing the environment variable names the app expects. Copy it to `.env.local` and fill in local values. |
| `.gitignore` | Excludes dependencies, build output, local environment files/logs, and Vercel working files from Git. |
| `vercel.json` | Vercel build/output settings and rewrite of app routes to `index.html` for client-side navigation. |
| `README.md` | Project overview, setup, data contract, calculations, deployment, and limitations. |

### Generated or local-only items

- `node_modules/` contains locally installed packages; create it with `npm install` and do not commit it.
- `dist/` is generated by the production build; deploy this output through Vercel or another static host.
- `.env.local` contains machine-specific configuration and is ignored by Git. Never copy its values into source control, screenshots, issue reports, or this README.
- There are currently no tracked Supabase migrations, Edge Functions, or schema files in this repository. The database is managed in the existing Supabase project.

## Requirements and setup

Install Node.js with npm and Python 3.11 or newer. In the repository directory:

```powershell
npm install
```

If `.env.local` does not exist, create it from `.env.example`; preserve any existing local Supabase values and add `VITE_RIVER_API_URL=http://localhost:8000`. The frontend and Python forecast service use the same Supabase project and device ID. Set up the API environment:

```powershell
Set-Location backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
if (!(Test-Path .env)) { Copy-Item .env.example .env }
Set-Location ..
```

Edit `backend/.env` with the Supabase project URL and publishable key. To enable account deletion in User Management, also add the server-only `SUPABASE_SECRET_KEY` from the Supabase project's API Keys settings. Keep it in `backend/.env`; never put it in `.env.local`, a `VITE_*` variable, or frontend code.

Start both the Python API and React dashboard from one PowerShell terminal at the repository root:

```powershell
npm run dev:all
```

The launcher starts FastAPI on port `8000` in the background and Vite on port `5173` in the terminal. They remain separate services; `Ctrl+C` stops both. Python API output is written to `backend/uvicorn.local.out.log` and `backend/uvicorn.local.err.log`. The React dashboard contains the model forecast and performance views used by the app; there is no separate Streamlit dashboard.

Available scripts:

| Command | Description |
| --- | --- |
| `npm run dev` | Start Vite's local development server. |
| `npm run dev:all` | Start the FastAPI service and Vite dashboard from one PowerShell terminal. |
| `npm run build` | Type-check the app and create a production build in `dist/`. |
| `npm run preview` | Serve the already-built `dist/` output locally for a production-style preview. Run `npm run build` first. |

There is no test or lint script configured in `package.json` at present.

## Environment variables

Set these in `.env.local` for development and in the hosting provider's environment settings for deployment. Vite exposes variables prefixed with `VITE_` to browser code, so values here must be safe for public clients.

| Variable | Required | Default / fallback | Description |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | Yes | None | Supabase project URL, for example `https://<project-ref>.supabase.co`. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes, unless anon fallback is set | Falls back to `VITE_SUPABASE_ANON_KEY` | Supabase publishable key used by the browser client. |
| `VITE_SUPABASE_ANON_KEY` | Alternative | None | Legacy anon key fallback for projects that still use it. Prefer the publishable key when available. |
| `VITE_SUPABASE_DEVICE_ID` | No | `ELEC-01` | `device_id` value used to filter sensor readings and Realtime events. |
| `VITE_CARBON_EMISSION_FACTOR_KG_PER_KWH` | No | `0.82` | Grid emissions factor, in kg CO₂e per kWh. This is a configurable estimate, not a live regional grid-intensity feed. |
| `VITE_RIVER_API_URL` | Needed for forecasts and account deletion | None | Base URL for the deployed Python API, for example `http://localhost:8000`. |

Set these variables in `backend/.env` for local use or in the Python hosting provider's environment settings:

| Variable | Required | Default / fallback | Description |
| --- | --- | --- | --- |
| `SUPABASE_URL` | Yes | None | Supabase project URL. |
| `SUPABASE_PUBLISHABLE_KEY` | Yes | None | Publishable/anon key used by the service to read rows under Supabase RLS. Do not use a service-role key. |
| `SUPABASE_SECRET_KEY` | Only for account deletion | None | Server-only Supabase secret key used by the admin account-deletion endpoint. Keep it in `backend/.env` or the API host's secret settings; never put it in frontend variables. `SUPABASE_SERVICE_ROLE_KEY` is accepted as a legacy fallback. |
| `SUPABASE_DEVICE_ID` | No | `ELEC-01` | Only device the service will forecast. Keep it aligned with `VITE_SUPABASE_DEVICE_ID`. |
| `FORECAST_TIMEZONE` | No | `Asia/Kolkata` | Timezone used for hour and weekday model features. |
| `CORS_ALLOWED_ORIGINS` | No | `http://localhost:5173` | Comma-separated browser origins permitted to call the API. Add the deployed Vercel origin when hosting the dashboard. |
| `BILLS_DATASET_PATH` | No | `data/bills/raw/CARBengine_dataset_2019_2025.csv` | Optional project-relative or absolute path for the local bill CSV. The service also auto-selects a single CSV in `data/bills/raw/`. |

After changing Vite environment variables, restart the development server or trigger a fresh production build. Do not add real credentials to `.env.example` or commit `.env.local`.

## Supabase table contract

The frontend expects a table named `public.sensor_readings` with at least these columns:

| Column | Expected type / meaning |
| --- | --- |
| `device_id` | Text identifier. Rows are filtered to `VITE_SUPABASE_DEVICE_ID`. |
| `recorded_at` | Timestamp for the reading; sortable and parseable as a date/time. |
| `voltage_v` | Voltage in volts. |
| `current_a` | Current in amperes. |
| `power_w` | Active power in watts. |
| `energy_kwh` | Cumulative meter energy in kWh. |
| `frequency_hz` | Mains frequency in hertz. |
| `power_factor` | Meter power factor. |

The dashboard selects the newest row by `recorded_at`, queries historical rows in ascending time order, and listens for `INSERT` events filtered by `device_id`. Supabase Realtime must be enabled for the table/publication. The frontend does not create the sensor table; the included SQL setup applies the role and read policies described below.

The browser code assumes the field names above. If the database schema differs, update the select/mapping logic in `src/lib/readings.ts` to match it.

## Supabase Auth and roles

Run `supabase/role_access_setup.sql` in **Supabase Dashboard → SQL Editor** after `user_profiles`, `dashboard_modules`, `role_module_permissions`, `sensor_readings`, and `sensor_devices` exist. It enables RLS, adds role policies, adds an email column to `user_profiles`, seeds suggested student/faculty/technician tab permissions without overwriting existing choices, and restricts sensor reads to signed-in roles with an enabled sensor-related tab.

Create the first account in **Authentication → Users → Add user** and confirm its email. Copy the user's UID, then run this in SQL Editor with the real UID and email:

```sql
insert into public.user_profiles (user_id, email, role, active)
values ('AUTH-USER-UUID'::uuid, 'admin@college.edu', 'admin', true)
on conflict (user_id) do update
set email = excluded.email, role = 'admin', active = true;
```

To let people create their own accounts, enable **Allow new users to sign up** under **Authentication → Sign In / Providers → User Signups**. Keep the Email provider and email confirmation enabled. In **Authentication → URL Configuration**, add the local dashboard origin (for example, `http://localhost:5173`) to the redirect URLs. Then run `supabase/enable_self_signup.sql` in **SQL Editor** (run it again if signup was configured earlier so the updated department field is stored). The trigger creates an active `student` profile for each new Auth account; the signup form does not allow users to choose their own role. Users select EXCS, INFT, EXTC, CMPN, or Other and enter a custom department name for Other. New users confirm their email, then sign in. Admins can later change roles and departments in **User Management** and tab access in **Tab Permissions**.

The setup script keeps anonymous `INSERT` access for the existing ESP32 upload flow while removing anonymous sensor reads. That preserves simple PZEM uploads but a public key cannot prove that a reading came from your ESP32. For stronger upload integrity, move device writes to an authenticated Edge Function or backend endpoint with a private device token.

## Realtime and data freshness

- A Realtime subscription listens for new `INSERT` rows for the configured device.
- A five-second polling loop also refreshes the latest reading and acts as a fallback if an event is missed.
- Live values are considered stale after 15 seconds and the device is considered offline after 60 seconds without a recent reading. These thresholds are currently constants in `src/App.tsx`.
- When the most recent reading is stale, live metric cards show zero rather than presenting old measurements as current. Historical views continue to show stored readings.
- Realtime requires an active browser connection, Supabase Realtime configured for `sensor_readings`, and appropriate database read permissions. ESP32 uploads can continue while the dashboard is closed, but the dashboard only renders updates while it is open.
- The app loads historical records in pages of 1,000 and caps its in-memory history at 20,000 rows. Very large date ranges can therefore be incomplete beyond the cap.

## Pages and navigation

Navigation is implemented as a single-page application with hash routes. The default route is `#live-monitoring`.

| Page | Route | Main contents |
| --- | --- | --- |
| **Live Monitoring** | `#live-monitoring` | Latest electrical measurements, sensor connectivity, power and carbon time series, recent readings, and controls for viewing the metric carousel/time ranges. |
| **Energy & Carbon Analytics** | `#energy-insights` (also supports `#range-summary`) | Date/time filters, sensor-history summaries and charts, carbon estimates, River online sensor forecast, and searchable/scrollable sensor data history. |
| **Bill History & Forecast** | `#bill-history` (also supports legacy hashes `#energy-planning` and `#campus-forecast`) | Source-quality counts, separate meter/source series, and up to 12 months of SARIMAX consumption and bill-amount forecasts. It does not use PZEM sensor readings as college bills. |
| **Cost & Green Tax** | `#cost-savings` (also supports legacy hash `#cost-emissions`) | Selected-period electricity-cost estimate and illustrative green-tax allocation with date filtering and a time-series view. |
| **Device** | `#device` | Configured device identity, connectivity/last-reading status, and available device-reading details. |
| **User Management** | `#user-management` | Admin-only account search by email or ID, department filtering, role and department assignment, and protected account deletion. |
| **Tab Permissions** | `#tab-permissions` | Admin-only module enable/disable and role access matrix. |

Changing a page navigates to the relevant hash route and resets the page view to the top. Navigation transitions and responsive styles are implemented in CSS and the app component.

## Calculations and assumptions

All carbon values are estimates derived from meter energy or measured power. The configured factor defaults to `0.82 kg CO₂e/kWh` and can be changed with `VITE_CARBON_EMISSION_FACTOR_KG_PER_KWH`.

### Carbon estimates

- **Instantaneous carbon rate**: `power_w / 1000 × grid factor`, in kg CO₂e per hour.
- **Carbon over a time interval**: average the two adjacent power readings, convert watts to kW, multiply by elapsed hours and by the grid factor. Intervals longer than five minutes are excluded to avoid treating large data gaps as continuous usage.
- **Cumulative carbon estimate**: latest cumulative `energy_kwh × grid factor`.
- **Meter energy for a selected period**: last cumulative meter value minus the first value in the period, when both readings are available and the meter has not reset. A reset makes the delta unavailable rather than negative.
- **Today's energy/carbon**: derived from the cumulative meter's first reading today to its latest reading, then multiplied by the grid factor. Results depend on having a reading from the relevant period and on the meter's cumulative value being valid.

These calculations are grid-factor estimates. They do not measure emissions directly and should not be treated as audited carbon accounting.

### Cost and green tax

- Electricity cost estimate uses a fixed illustrative rate of **₹11.80/kWh**.
- Green tax estimate uses **₹12.85/kWh** applied to the estimated period energy. This is an illustrative allocation configured in the UI, not a legally assessed tax or an actual utility bill charge.
- The energy basis uses the meter delta when it is available; where not available, the page can derive energy from measured power over valid intervals.
- The app does not currently implement tiered tariffs, time-of-use pricing, taxes/fees from an actual bill, or institution-specific billing rules.

### Sensor forecast

The five-minute sensor forecast uses River's online `StandardScaler` + `LinearRegression` pipeline. It builds one training example per minute from the current voltage, current, power, frequency, power factor, recent changes, and time-of-week features. When the corresponding reading arrives around five minutes later, the service learns from that outcome and updates its online MAE using the earlier prediction. A provisional estimate is displayed after six completed examples; the model is marked active after 12. Stale data and missed target windows are excluded. The service saves its model state under `backend/models/river/` after new readings are processed. On restart it restores that state and fetches only newer Supabase rows; if no compatible state exists, it bootstraps from recent history. Run one API worker per device configuration.

### College bill forecast

College bill history and its forecast are distinct from sensor analytics. The local bill CSV is validated and trained as separate meter/source series using monthly SARIMAX. Fitted models and chronological holdout scores are saved under `backend/models/bills/` and reused while the CSV and model settings stay unchanged. Changing the CSV or model version triggers a new fit. The page shows source labels, actual values, forecasts, and forecast intervals. Forecasts from unverified or synthetic sources are exploratory; they are not mixed into a verified series.

## Build and deployment

For a production build and local preview:

```powershell
npm run build
npm run preview
```

The Vite build is written to `dist/`. The included `vercel.json` configures Vercel to build the Vite app, publish the output, and route client-side paths back to `index.html`. Configure the frontend variables from [Environment variables](#environment-variables) in the Vercel project before deploying. Deploy the Python `backend/` service separately, configure its server-side environment variables, and set `VITE_RIVER_API_URL` to its URL. The dashboard and River service use the signed-in user's session when reading live sensor data.

For a different static host, publish `dist/` and configure an equivalent single-page-app fallback to `index.html`. Add the Supabase environment values at build time.

## Security

- Only a Supabase publishable key (or legacy anon key) belongs in frontend configuration. These keys are public by design and must be constrained by database grants and RLS policies.
- Never put a Supabase service-role/secret key, ESP32 `DEVICE_TOKEN`, or other privileged credential in `VITE_*` variables, frontend source, or a deployed bundle.
- Browser reads are governed by Supabase table grants and RLS. The SQL setup also checks role permissions in the Python forecast API; hiding a tab alone is not treated as data security.
- The setup intentionally leaves public-key sensor inserts available for the existing uploader. A public key cannot prove that a reading came from your ESP32; use a private device-authenticated upload endpoint for stronger integrity.
- Role-based authentication and module permissions are implemented, subject to running the Supabase SQL setup and creating the first admin profile. The app does not currently keep an audit log of role changes.
- `.env.local` is ignored by Git. If a privileged key was ever exposed in a browser bundle or repository, rotate it in Supabase.

## Current scope and limitations

- ESP32 firmware and its ingestion endpoint are maintained separately. Apply the included Supabase SQL before relying on role-based data security.
- The app expects one configured device ID at a time.
- The table reader and UI are tailored to the stated `sensor_readings` column names.
- The River service stores its online state locally and synchronizes newer rows after restart; configure one API worker for each service instance.
- Local bill CSVs are supported for development. The copied file currently has 11 PDF rows, 48 unverified online rows, and 36 synthetic rows. Each source is trained separately; online and synthetic series receive seasonal forecasts, while the PDF series receives a limited-history, nonseasonal forecast. Unverified and synthetic outputs are exploratory.
- Model files and cached bill-model metrics are local-only and ignored by Git. Back up `backend/models/` if those trained artifacts need to be kept when moving or reinstalling the project.
- The bill forecast API reads local files in development. A hosted backend cannot see this ignored local folder; migrate cleaned, verified rows into a protected Supabase bill table before using bill forecasts in a deployed dashboard.
- Carbon and money values are estimates based on configured factors/rates and sensor data, not official statements.
- No automated test, lint, or formatting scripts are currently configured.

## Troubleshooting

### Dashboard says configuration is missing

Check that `.env.local` exists, that `VITE_SUPABASE_URL` and either `VITE_SUPABASE_PUBLISHABLE_KEY` or `VITE_SUPABASE_ANON_KEY` are set, and restart `npm run dev` after editing the file.

### No readings appear

Confirm that the table is `public.sensor_readings`, the selected device ID matches the `device_id` values in the table, and the expected columns exist. Check that the browser key can read rows under the table's grants and RLS policy. The dashboard does not insert readings.

### Values do not update automatically

Confirm that Supabase Realtime is enabled for `sensor_readings`, the table is in the Realtime publication, and the browser subscription can read the matching rows. Check the browser console for Supabase errors. The five-second poll should still refresh the latest value when the browser can query the table.

### Device appears offline

The UI marks readings stale after 15 seconds and offline after 60 seconds. Confirm the ESP32 is powered and connected, uploads are succeeding, and `recorded_at` is current. Historical rows can still be displayed while the latest live state is offline.

### Carbon or cost numbers seem unexpected

Verify the meter's cumulative `energy_kwh` behavior (including resets), the date range, the emission factor, and the illustrative rates in the calculations section. Carbon estimates depend on data coverage and assumptions; gaps over five minutes are not integrated as continuous power usage.
