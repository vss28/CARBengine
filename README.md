# ⚡ CARBengine — AI-Powered Campus Carbon Footprint Monitoring and Forecasting

> An integrated IoT and AI-powered platform for campus electricity monitoring, carbon emission estimation, energy analytics, forecasting, and sustainability management.

![CARBengine Dashboard](docs/screenshots/main-dashboard.png)

<p align="center">
  <b>Monitor · Predict · Analyse · Sustain</b>
</p>

---

## 🌱 About CARBengine

**CARBengine** is an AI-powered campus energy monitoring and carbon footprint analysis platform developed to help engineering colleges understand their electricity consumption, estimate associated carbon emissions, and explore opportunities for sustainable resource management.

The system integrates IoT-based electrical monitoring hardware, a web-based dashboard, a centralized database, and machine learning forecasting services.

Using an ESP32 controller and PZEM-004T energy meter, CARBengine collects electrical parameters and makes the available readings accessible through an interactive dashboard. It combines real-time monitoring with historical analytics, electricity cost estimation, carbon calculations, and forecasting.

The platform also provides additional sustainability and administrative modules, including travel emission estimation, carbon reduction planning, campus sustainability audits, device management, and role-based access control.

### Project Highlights

- IoT-based electricity monitoring using ESP32 and PZEM-004T.
- Real-time sensor data updates using Supabase Realtime.
- Five-minute-ahead power prediction using online machine learning.
- Monthly electricity consumption and bill forecasting using SARIMAX.
- Campus energy and carbon analytics.
- Interactive campus anomaly monitoring.
- Carbon reduction and sustainability planning.
- Travel-related carbon emission estimation.
- Role-based dashboard access and administration.
- Custom PCB design using EasyEDA.

---

## ✨ Features & Dashboard Modules

CARBengine currently contains **11 functional dashboard modules**, organized into Monitoring and Administration sections.

### A. Monitoring Modules

#### 1. Know Your Carbon — Travel Emissions

- Estimate travel-related carbon emissions using origin and destination.
- Route-distance calculation using OSRM.
- Interactive map visualization using Leaflet and OpenStreetMap.
- Supports eight configured transportation modes.
- Compare estimated emissions between different transport modes.
- Calculate indicative emissions per trip and according to travel frequency.

![Know Your Carbon](docs/screenshots/know-your-carbon.png)

#### 2. Live Monitoring

- Real-time voltage monitoring (V).
- Current measurement (A).
- Active power monitoring (W).
- Cumulative energy consumption (kWh).
- Supply frequency (Hz).
- Power factor monitoring.
- Supabase Realtime subscriptions.
- Five-second polling fallback.
- Reading freshness and connectivity indicators.

![Live Monitoring](docs/screenshots/live-monitoring.png)

#### 3. Energy & Carbon Analytics

- Historical electricity consumption analysis.
- Time-based sensor data filtering.
- Energy consumption summaries.
- Carbon emission estimation using configurable grid emission factors.
- Hourly and period-based energy analysis.
- Five-minute-ahead power prediction using the River online learning model.
- Historical readings and analytical visualizations.

![Energy and Carbon Analytics](docs/screenshots/energy-carbon-analytics.png)

#### 4. Bill History & Forecast

- Historical monthly electricity bill records.
- Meter-wise billing data analysis.
- Monthly electricity consumption forecasting.
- Maximum demand forecasting.
- Electricity bill amount forecasting.
- SARIMAX time-series forecasting.
- Forecast horizon of up to 12 months.
- Nominal 95% model-based prediction intervals.
- Comparison of historical records and forecasted values.

![Bill History and Forecast](docs/screenshots/bill-forecast.png)

#### 5. Cost & Green Tax

- Period-based electricity cost estimation.
- Configurable per-unit electricity rate.
- Illustrative green-tax allocation.
- Energy expenditure analysis.
- Estimated cost calculations for selected periods.

![Cost and Green Tax](docs/screenshots/cost-green-tax.png)

#### 6. Campus Anomaly Monitor

- Interactive SVG-based campus floor plan.
- Configured sensor location visualization.
- Power usage indicators.
- Connectivity and reading freshness information.
- Visual power display thresholds.
- Campus monitoring interface.

![Campus Anomaly Monitor](docs/screenshots/anomaly-monitor.png)

*Note: The current implementation uses connectivity and display thresholds. It is not a trained statistical anomaly-detection model.*

#### 7. Carbon Reduction Goals

- Campus energy-reduction planning.
- Configurable reduction percentages.
- Conservation action selection.
- Projected energy savings.
- Estimated carbon reduction scenarios.
- Indicative cost-saving calculations.

![Carbon Reduction Goals](docs/screenshots/carbon-goals.png)

*Note: Projected reductions are planning scenarios, not independently measured energy or emission savings.*

#### 8. Campus Sustainability Audit

- Electricity audit records.
- Water consumption records.
- Waste management records.
- Recycling records.
- Category-specific emission calculations.
- Search and filtering.
- CSV export functionality.

![Campus Sustainability Audit](docs/screenshots/campus-audit.png)

*Note: The current prototype stores audit records in browser localStorage. These are user-entered records and are not independently verified.*

#### 9. Device Management

- Configured monitoring device information.
- Device identification.
- Latest available sensor readings.
- Reading timestamps.
- Connectivity status.
- Data freshness monitoring.

![Device Management](docs/screenshots/device-management.png)

### B. Administration Modules

#### 10. User Management

- User account administration.
- User search and filtering.
- Department-based filtering.
- Role assignment and updates.
- Department information management.
- Protected account deletion.
- Supabase authentication integration.

![User Management](docs/screenshots/user-management.png)

#### 11. Tab Permissions

- Role-based dashboard access.
- Student permissions.
- Faculty permissions.
- Technician permissions.
- Administrator permissions.
- Individual tab access configuration.
- Centralized permission management.

Administrators can manage which dashboard modules are accessible to different user roles.

![Tab Permissions](docs/screenshots/tab-permissions.png)

---

## 🏗️ System Architecture

CARBengine follows a multi-layered architecture connecting hardware monitoring, database services, forecasting APIs, and the web application.

```text
                 HARDWARE LAYER

          PZEM-004T Energy Meter
                    |
                    v
               ESP32 Controller
                    |
                    v
             Data Upload Process
                    |
                    v
          SUPABASE POSTGRESQL
             sensor_readings
                    |
          +---------+----------+
          |                    |
          v                    v
    Supabase Realtime    Periodic Polling
          |                    |
          +---------+----------+
                    |
                    v
             REACT DASHBOARD
                    |
          +---------+----------+
          |                    |
          v                    v
    Energy Analytics     Carbon Analytics
          |                    |
          +---------+----------+
                    |
                    v
             FASTAPI BACKEND
                    |
          +---------+----------+
          |                    |
          v                    v
     RIVER MODEL           SARIMAX MODEL
    5-Min Power          Monthly Bill &
     Prediction          Energy Forecast
```

### System Components

| Layer | Responsibility |
|---|---|
| Hardware | Electrical measurement using PZEM-004T and ESP32 |
| Database | Sensor data storage using Supabase PostgreSQL |
| Real-time communication | Supabase Realtime and periodic polling |
| Frontend | Interactive dashboard using React and TypeScript |
| Backend | Forecasting services and protected administrative APIs |
| Machine Learning | River online learning and SARIMAX forecasting |
| Hardware design | Custom PCB layout using EasyEDA |

*The ESP32 firmware and data-uploading process are maintained separately from the available web application repository.*

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React 19, TypeScript, Vite 7 |
| UI and Visualization | Recharts, Lucide React |
| Maps | Leaflet, OpenStreetMap |
| Route Calculation | OSRM |
| Backend | Python, FastAPI, Uvicorn |
| Online Machine Learning | River 0.26.1 |
| Statistical Forecasting | statsmodels 0.15.0, SARIMAX |
| Data Preprocessing | StandardScaler |
| Database | Supabase PostgreSQL |
| Authentication | Supabase Auth |
| Database Security | PostgreSQL Row-Level Security (RLS) |
| Real-time Updates | Supabase Realtime |
| Hardware | ESP32, PZEM-004T |
| PCB Design | EasyEDA |
| Deployment | Vercel (frontend), Python hosting (backend) |

---

## 🤖 Machine Learning & Forecasting

CARBengine incorporates two independent forecasting approaches because sensor power readings and monthly billing records have different data sources, units, and prediction intervals.

### 1. Five-Minute Power Forecasting — River

The River online machine learning library is used for short-term electrical power prediction.

**Model components:**

- River 0.26.1.
- StandardScaler.
- Online linear regression.
- Incremental model updates.
- Approximately five-minute prediction horizon.

The model processes incoming sensor observations and updates its learning when the corresponding future target becomes available.

The predicted output represents estimated future active power in watts.

*Evaluation limitation: An independently evaluated local sensor time series was not available for the reported project evaluation. Numerical prediction accuracy has therefore not been established.*

### 2. Monthly Electricity Forecasting — SARIMAX

The SARIMAX model, implemented using statsmodels, is used for longer-term electricity billing analysis.

**Forecasting targets:**

- Monthly electricity consumption (kWh).
- Monthly maximum demand (kVA).
- Monthly electricity bill amount (₹).

**Model configuration:**

| Parameter | Configuration |
|---|---|
| Model | SARIMAX |
| Core order | (1, 1, 1) |
| Seasonal order | (0, 1, 0, 12), when at least 24 observations are available |
| Alternative seasonal order | (0, 0, 0, 0) |
| Forecast horizon | Up to 12 months |
| Prediction intervals | Nominal 95% |

**Reported evaluation results:**

| Forecast target | SARIMAX MAPE | Persistence MAPE |
|---|---:|---:|
| Electricity consumption | 19.48% | 17.78% |
| Bill amount | 12.77% | 15.07% |

SARIMAX performed better for bill amount, while the persistence baseline performed better for electricity consumption in the reported five-month holdout evaluation.

The billing dataset contains original, estimated or modified, and synthetic records. Therefore, these results are exploratory and should not be treated as proof of reliable future forecasting performance.

---

## 📊 Energy & Carbon Calculations

### Energy Consumption

Energy consumption is calculated by comparing valid cumulative meter readings.

\[
\Delta E = E_{\text{end}}-E_{\text{start}}
\]

Where:

- \(E_{\text{end}}\): Final cumulative energy reading.
- \(E_{\text{start}}\): Initial cumulative energy reading.
- \(\Delta E\): Energy consumed in kWh.

### Carbon Emission Estimation

\[
C=E\times F
\]

Where:

- \(C\): Estimated carbon emissions (kg CO₂e).
- \(E\): Electricity consumed (kWh).
- \(F\): Configured emission factor (kg CO₂e/kWh).

**Documented default emission factor: 0.82 kg CO₂e/kWh.**

For example, 100 kWh of electricity consumption produces an estimated 82 kg CO₂e using this factor.

### Electricity Cost Estimation

\[
\text{Estimated Cost}=E\times T
\]

Where:

- \(E\): Electricity consumed (kWh).
- \(T\): Configured electricity rate (₹/kWh).

**Documented illustrative electricity rate: ₹11.80/kWh.**

The green-tax module also uses an illustrative allocation value of ₹12.85/kWh. This is not a verified utility tax or official electricity charge.

All carbon and cost outputs are estimates and depend on the quality of the underlying data and configured assumptions.

---

## 🔐 Authentication & Role-Based Access Control

CARBengine uses Supabase Auth for user authentication and a role-based permission system for controlling dashboard access.

### Supported Roles

| Role | Access |
|---|---|
| Admin | All monitoring and administrative modules |
| Student | Modules assigned through permissions |
| Faculty | Modules assigned through permissions |
| Technician | Modules assigned through permissions |

### Security Features

- Supabase authentication.
- User and department management.
- Role-based dashboard visibility.
- Individual tab permission configuration.
- PostgreSQL Row-Level Security.
- Protected administrative backend endpoints.

Effective access restrictions depend on the correct configuration and testing of database policies and backend authorization.

---

## 🔌 Hardware Implementation

The hardware monitoring setup is based on the ESP32 controller and PZEM-004T energy meter.

### Electrical Parameters

| Parameter | Unit |
|---|---|
| Voltage | V |
| Current | A |
| Active Power | W |
| Accumulated Energy | kWh |
| Frequency | Hz |
| Power Factor | Unitless |

### Circuit Diagram

The circuit diagram illustrates the electrical connections between the ESP32 controller, PZEM-004T energy meter, current transformer (CT), and the monitored electrical load.

![CARBengine Circuit Diagram](docs/screenshots/circuit-diagram.png)

### PCB Design

A custom PCB layout was prepared using EasyEDA as part of the hardware design.

The hardware implementation is intended to connect electrical measurement components with the networked monitoring system.

![Hardware Implementation](docs/screenshots/hardware-setup.png)

---

## 📱 Mobile Application

CARBengine also includes a mobile application as a companion interface to the project.

![CARBengine Mobile Application](docs/screenshots/mobile-app.png)

---

## 📁 Project Structure

```text
CARBengine/
│
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── app.css
│   ├── anomaly.css
│   │
│   ├── components/
│   │   ├── AuthProvider.tsx
│   │   ├── AdminAccessPanels.tsx
│   │   └── BillForecastPanel.tsx
│   │
│   └── lib/
│       ├── supabase.ts
│       ├── readings.ts
│       ├── forecast.ts
│       └── billForecast.ts
│
├── backend/
│   ├── app.py
│   ├── bill_forecast.py
│   ├── model_store.py
│   ├── requirements.txt
│   └── .env.example
│
├── supabase/
│   ├── role_access_setup.sql
│   └── enable_self_signup.sql
│
├── data/
│   └── bills/
│
├── public/
│   └── maps/
│
├── docs/
│   └── screenshots/
│       ├── main-dashboard.png
│       ├── know-your-carbon.png
│       ├── live-monitoring.png
│       ├── energy-carbon-analytics.png
│       ├── bill-forecast.png
│       ├── cost-green-tax.png
│       ├── anomaly-monitor.png
│       ├── carbon-goals.png
│       ├── campus-audit.png
│       ├── device-management.png
│       ├── user-management.png
│       ├── tab-permissions.png
│       ├── hardware-setup.png
│       ├── circuit-diagram.png
│       └── mobile-app.png
│
├── scripts/
│   └── start-local.ps1
│
├── .env.example
├── .gitignore
├── vercel.json
├── vite.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

## 🚀 Installation & Setup

### Prerequisites

- Node.js v18 or later.
- npm.
- Python 3.11 or later.
- A configured Supabase project.
- A configured `public.sensor_readings` table with Realtime enabled.

### 1. Clone the Repository

```bash
git clone https://github.com/vss28/CARBengine.git
cd CARBengine
```

### 2. Install Frontend Dependencies

```bash
npm install
```

### 3. Configure Frontend Environment

```bash
cp .env.example .env.local
```

Configure the required Supabase credentials in `.env.local`.

### 4. Set Up Python Backend

```bash
cd backend

python -m venv .venv
```

**Windows:**

```powershell
.\.venv\Scripts\Activate.ps1
```

**macOS/Linux:**

```bash
source .venv/bin/activate
```

Install the dependencies:

```bash
pip install -r requirements.txt
```

Configure backend environment variables using the provided `.env.example`.

### 5. Start the Application

Return to the root directory:

```bash
cd ..
```

Run the frontend and backend:

```bash
npm run dev:all
```

The application uses:

| Service | Default Port |
|---|---|
| React + Vite Frontend | 5173 |
| FastAPI Backend | 8000 |

### Available Commands

| Command | Description |
|---|---|
| `npm run dev` | Start frontend only |
| `npm run dev:all` | Start frontend and backend |
| `npm run build` | Create production build |
| `npm run preview` | Preview production build |

---

## 🔑 Environment Variables

### Frontend — `.env.local`

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase publishable/anon key |
| `VITE_SUPABASE_DEVICE_ID` | No | Monitoring device ID; default `ELEC-01` |
| `VITE_CARBON_EMISSION_FACTOR_KG_PER_KWH` | No | Grid emission factor; default `0.82` |
| `VITE_RIVER_API_URL` | No | Backend API URL; default `http://localhost:8000` |

### Backend — `backend/.env`

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase publishable key |
| `SUPABASE_SECRET_KEY` | For protected admin operations | Server-only secret |
| `SUPABASE_DEVICE_ID` | No | Monitoring device ID |
| `FORECAST_TIMEZONE` | No | Default `Asia/Kolkata` |
| `CORS_ALLOWED_ORIGINS` | No | Permitted frontend origins |

Never commit actual secret keys, passwords, or private credentials to GitHub.

---

## 📊 Database Design

The primary sensor database table is:

`public.sensor_readings`

| Field | Type | Description |
|---|---|---|
| `device_id` | Text | Monitoring device identifier |
| `recorded_at` | Timestamp | Measurement timestamp |
| `voltage_v` | Numeric | Voltage in volts |
| `current_a` | Numeric | Current in amperes |
| `power_w` | Numeric | Active power in watts |
| `energy_kwh` | Numeric | Cumulative energy |
| `frequency_hz` | Numeric | Supply frequency |
| `power_factor` | Numeric | Power factor |

The billing forecasting service uses a separate monthly dataset containing:

- `timestamp`
- `billing_month`
- `meter_id`
- `consumption_kwh`
- `max_demand_kva`
- `bill_amount_inr`
- `data_type`
- `row_origin`

The billing records are maintained separately from the live sensor readings because they represent different measurement periods and data sources.

---

## ⚠️ Current Limitations & Evaluation Boundaries

CARBengine is currently a prototype. Its implemented modules demonstrate the intended software workflow, but their presence does not establish complete field validation.

Important limitations include:

1. **Billing dataset:** The processed dataset contains untouched, estimated or modified, and synthetic records. Its complete source has not been independently verified.
2. **River model:** Five-minute power prediction is implemented, but independently evaluated accuracy metrics are not available.
3. **Hardware validation:** Further meter calibration, firmware documentation, ingestion testing and physical bench validation are required.
4. **Anomaly monitoring:** Current power bands and connectivity indicators are not a trained statistical anomaly-detection system.
5. **Carbon calculations:** Emission factors are configurable estimates and do not represent a verified institutional carbon inventory.
6. **Cost calculations:** Configured electricity and green-tax values are illustrative rather than verified utility charges.
7. **Campus audit:** Records are currently maintained in browser localStorage and are not a centrally verified institutional dataset.
8. **Carbon goals:** Projected reductions are planning scenarios, not measured reductions.
9. **Travel emissions:** Calculations depend on route distances, selected travel modes and configured emission factors.

These limitations define the current evidence boundaries of the prototype and identify areas for further validation.

---

## 🔮 Future Scope

CARBengine can be extended through the following developments:

- **Multi-location Energy Monitoring:** Expand sensor installations across multiple campus buildings and electrical distribution points.
- **Improved Forecasting:** Train and evaluate forecasting models using verified electricity bills and actual sensor time series.
- **Advanced Anomaly Detection:** Introduce statistical or machine learning-based anomaly detection using historical consumption patterns.
- **Transportation Emissions:** Expand campus-wide commute emission analysis.
- **Waste Emissions:** Develop more comprehensive waste collection and disposal emission tracking.
- **Food Emissions:** Introduce food-related carbon footprint estimation.
- **Centralized Sustainability Database:** Move audit records from browser storage to a centrally managed database.
- **Verified Carbon Accounting:** Integrate documented emission factors with appropriate sources and validity periods.
- **Public Campus Carbon Footprint LED Display:** Develop a large LED display at a prominent campus location showing estimated overall carbon emissions, category-wise contributions, and sustainability progress.
- **Campus-wide Deployment:** Extend the platform to multiple buildings and evaluate its performance under actual operating conditions.

---

## 👥 Project Team

**Department of Electronics & Computer Science**

**Vidyalankar Institute of Technology**

| Team Member | Roll Number |
|---|---|
| Vedant Sanjay Shelke | 23108A0081 |
| Atharva Shripad Joshi | 24108A2010 |
| Prem Dipak Thoke | 24108A2015 |
| Nikhil Nitin Patil | 24108A2019 |

**Project Guide:** Dr. Uma Jaishankar

**University:** University of Mumbai

**Academic Year:** 2026–2027

---

## 📄 License

This project is developed as part of an academic major project at Vidyalankar Institute of Technology.

Usage and redistribution are subject to the licensing terms selected by the project team and institution.

---

<p align="center">
  <b>Built with ⚡ by Team CARBengine</b>
</p>

<p align="center">
  Monitor · Predict · Analyse · Sustain
</p>
