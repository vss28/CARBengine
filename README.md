# ⚡ CARBengine — Campus Carbon & Energy Monitoring Dashboard

> Real-time electricity monitoring, carbon emission tracking, and bill forecasting for campus infrastructure — powered by ESP32 sensors and Supabase.

![CARBengine Dashboard](docs/screenshots/overview/main-dashboard.png)

---

## ✨ Features

- **Live Monitoring** — Real-time voltage, current, power, energy, frequency and power factor from PZEM-004T sensors via ESP32.
- **Carbon Tracking** — Instantaneous emission rates, cumulative footprint and hourly breakdowns using configurable grid factors.
- **5-min Power Forecast** — Online ML model (River) that learns continuously from incoming sensor data.
- **Bill History & Forecast** — SARIMAX-based monthly consumption and cost forecasts per meter.
- **Campus Anomaly Monitor** — Interactive SVG floor plan with live sensor heatmaps and classroom markers.
- **Know Your Carbon (Travel)** — Student commute carbon calculator with 8 transport modes and map visualization.
- **Carbon Goals & Conservation** — Campus-wide reduction levers with projected savings.
- **Campus Audit Records** — Electricity, water, waste and recycling audit trail.
- **Cost & Green Tax** — Period-based electricity cost estimates with illustrative green-tax allocation.
- **Role-Based Access** — Supabase Auth with admin/student/faculty/technician roles and per-tab permissions.

---

## 🏗️ Architecture

```text
PZEM-004T  →  ESP32  →  Supabase PostgreSQL
                             ↓
             ┌───────────────┼───────────────┐
             ↓               ↓               ↓
       Realtime Sub    5s Poll Fallback   River API
             ↓               ↓               ↓
             └───────→ React Dashboard ←─────┘
                             ↑
             FastAPI (River + SARIMAX + Admin)
```

---

## 🛠️ Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, TypeScript, Vite 7, Recharts, Leaflet, Lucide Icons |
| **Backend** | FastAPI, River (online ML), statsmodels (SARIMAX), Uvicorn |
| **Database** | Supabase (PostgreSQL + Realtime + Auth + RLS) |
| **Hardware** | ESP32 + PZEM-004T energy meter |
| **Deployment** | Vercel (frontend), any Python host (backend) |

---

## 📁 Project Structure

```text
CARBengine/
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── app.css
│   ├── anomaly.css
│   ├── components/
│   │   ├── AuthProvider.tsx
│   │   ├── AdminAccessPanels.tsx
│   │   └── BillForecastPanel.tsx
│   └── lib/
│       ├── supabase.ts
│       ├── readings.ts
│       ├── forecast.ts
│       └── billForecast.ts
├── backend/
│   ├── app.py
│   ├── bill_forecast.py
│   ├── model_store.py
│   └── requirements.txt
├── supabase/
│   ├── role_access_setup.sql
│   └── enable_self_signup.sql
├── data/
│   └── bills/
├── public/
│   └── maps/
├── docs/
│   └── screenshots/
│       ├── overview/
│       │   └── main-dashboard.png
│       ├── monitoring/
│       │   ├── live-monitoring.png
│       │   └── anomaly-monitor.png
│       ├── analytics/
│       │   ├── energy-carbon-analytics.png
│       │   ├── electricity-forecast.png
│       │   └── bill-forecast.png
│       ├── sustainability/
│       │   ├── travel-calculator.png
│       │   └── cost-green-tax.png
│       └── implementation/
│           ├── hardware-setup.png
│           ├── mobile-app.png
│           └── admin-panel.png
├── scripts/
│   └── start-local.ps1
├── .env.example
├── backend/.env.example
├── vercel.json
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** (v18+) with npm
- **Python** 3.11+
- A **Supabase** project with `sensor_readings` table and Realtime enabled

### 1. Clone & install

```bash
git clone https://github.com/vss28/CARBengine.git
cd CARBengine
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your Supabase URL and publishable key.

### 3. Set up Python backend

```bash
cd backend
python -m venv .venv

# Windows
.\.venv\Scripts\Activate.ps1

# macOS/Linux
# source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
```

Edit `.env` with your Supabase credentials.

```bash
cd ..
```

### 4. Run everything

```bash
npm run dev:all
```

This starts the FastAPI backend (port 8000) and Vite dev server (port 5173) together.

| Command | Description |
|---|---|
| `npm run dev` | Frontend only |
| `npm run dev:all` | Frontend + backend together |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |

---

## 🔑 Environment Variables

<details>
<summary><b>Frontend</b> (.env.local)</summary>

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase publishable/anon key |
| `VITE_SUPABASE_DEVICE_ID` | No | Device ID filter (default: `ELEC-01`) |
| `VITE_CARBON_EMISSION_FACTOR_KG_PER_KWH` | No | Grid emission factor (default: `0.82`) |
| `VITE_RIVER_API_URL` | No | Backend API URL (default: `http://localhost:8000`) |

</details>

<details>
<summary><b>Backend</b> (backend/.env)</summary>

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase publishable key |
| `SUPABASE_SECRET_KEY` | Admin operations | Server-only secret (account deletion) |
| `SUPABASE_DEVICE_ID` | No | Device ID (default: `ELEC-01`) |
| `FORECAST_TIMEZONE` | No | Timezone (default: `Asia/Kolkata`) |
| `CORS_ALLOWED_ORIGINS` | No | Allowed CORS origins |

</details>

---

## 📸 Screenshots

### 1. Main Dashboard

Overview of the CARBengine platform and its campus sustainability monitoring interface.

![Main Dashboard](docs/screenshots/overview/main-dashboard.png)

### 2. Live Monitoring & Campus Anomaly Detection

| Live Electricity Monitoring | Campus Anomaly Monitor |
|:---:|:---:|
| ![Live Monitoring](docs/screenshots/monitoring/live-monitoring.png) | ![Campus Anomaly Monitor](docs/screenshots/monitoring/anomaly-monitor.png) |

### 3. Energy Analytics & Forecasting

| Energy & Carbon Analytics | Electricity Forecast |
|:---:|:---:|
| ![Energy and Carbon Analytics](docs/screenshots/analytics/energy-carbon-analytics.png) | ![Electricity Forecast](docs/screenshots/analytics/electricity-forecast.png) |

**Bill History & Forecast**

![Bill Forecast](docs/screenshots/analytics/bill-forecast.png)

### 4. Sustainability & Carbon Analysis

| Know Your Carbon — Travel | Cost & Green Tax |
|:---:|:---:|
| ![Travel Carbon Calculator](docs/screenshots/sustainability/travel-calculator.png) | ![Cost and Green Tax](docs/screenshots/sustainability/cost-green-tax.png) |

### 5. Hardware, Mobile Application & Administration

| Hardware Implementation | Mobile Application | Admin Panel |
|:---:|:---:|:---:|
| ![Hardware Setup](docs/screenshots/implementation/hardware-setup.png) | ![Mobile Application](docs/screenshots/implementation/mobile-app.png) | ![Admin Panel](docs/screenshots/implementation/admin-panel.png) |

---

## 📊 Supabase Schema

The dashboard expects a `public.sensor_readings` table:

| Column | Type | Description |
|---|---|---|
| `device_id` | text | Device identifier |
| `recorded_at` | timestamp | Reading timestamp |
| `voltage_v` | numeric | Voltage (V) |
| `current_a` | numeric | Current (A) |
| `power_w` | numeric | Active power (W) |
| `energy_kwh` | numeric | Cumulative energy (kWh) |
| `frequency_hz` | numeric | Frequency (Hz) |
| `power_factor` | numeric | Power factor |

Run `supabase/role_access_setup.sql` in the SQL Editor to set up RLS and role permissions.

---

## 🔮 Future Scope

- Transportation, waste and food emission analysis expansion.
- Public campus-wide carbon footprint LED display.
- Advanced sustainability analytics and forecasting.
- Expanded campus resource monitoring and optimization.

---

## 📄 License

This project is part of an academic/research initiative. See repository for details.

---

<p align="center">
  Built with ⚡ by <b>Vedant Shelke</b>
</p>

<p align="center">
  <b>CARBengine — Monitor. Predict. Reduce.</b>
</p>
