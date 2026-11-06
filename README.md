# ⚡ CARBengine — Campus Carbon & Energy Monitoring Dashboard

> Real-time electricity monitoring, carbon emission tracking, and bill forecasting for campus infrastructure — powered by ESP32 sensors and Supabase.

<!-- Add your screenshots here — see "Screenshots" section below -->
<!-- ![Dashboard Preview](docs/screenshots/live-monitoring.png) -->

---

## ✨ Features

- **Live Monitoring** — Real-time voltage, current, power, energy, frequency & power factor from PZEM-004T sensors via ESP32
- **Carbon Tracking** — Instantaneous emission rates, cumulative footprint, and hourly breakdowns using configurable grid factors
- **5-min Power Forecast** — Online ML model (River) that learns continuously from incoming sensor data
- **Bill History & Forecast** — SARIMAX-based monthly consumption and cost forecasts per meter
- **Campus Anomaly Monitor** — Interactive SVG floor plan with live sensor heatmaps and classroom markers
- **Know Your Carbon (Travel)** — Student commute carbon calculator with 8 transport modes and map visualization
- **Carbon Goals & Conservation** — Campus-wide reduction levers with projected savings
- **Campus Audit Records** — Electricity, water, waste, and recycling audit trail
- **Cost & Green Tax** — Period-based electricity cost estimates with illustrative green-tax allocation
- **Role-Based Access** — Supabase Auth with admin/student/faculty/technician roles and per-tab permissions

---

## 🏗️ Architecture

```
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
|-------|-------------|
| **Frontend** | React 19, TypeScript, Vite 7, Recharts, Leaflet, Lucide Icons |
| **Backend** | FastAPI, River (online ML), statsmodels (SARIMAX), Uvicorn |
| **Database** | Supabase (PostgreSQL + Realtime + Auth + RLS) |
| **Hardware** | ESP32 + PZEM-004T energy meter |
| **Deployment** | Vercel (frontend), any Python host (backend) |

---

## 📁 Project Structure

```
CARBengine/
├── src/
│   ├── App.tsx                    # Main SPA — all pages & dashboard logic
│   ├── main.tsx                   # Entry point
│   ├── app.css                    # Core styles & responsive layout
│   ├── anomaly.css                # Anomaly monitor & floor plan styles
│   ├── components/
│   │   ├── AuthProvider.tsx       # Auth session & role/permission management
│   │   ├── AdminAccessPanels.tsx  # User management & tab permissions (admin)
│   │   └── BillForecastPanel.tsx  # Bill history & SARIMAX forecast UI
│   └── lib/
│       ├── supabase.ts            # Supabase client initialization
│       ├── readings.ts            # Sensor data access & Realtime subscriptions
│       ├── forecast.ts            # River forecast API client
│       └── billForecast.ts        # Bill forecast API client
├── backend/
│   ├── app.py                     # FastAPI — River forecast, bill forecast, admin APIs
│   ├── bill_forecast.py           # SARIMAX model training & prediction
│   ├── model_store.py             # Model persistence & caching
│   └── requirements.txt           # Python dependencies
├── supabase/
│   ├── role_access_setup.sql      # RLS policies & role permissions
│   └── enable_self_signup.sql     # Self-signup trigger & department selection
├── data/bills/                    # Bill CSV data (raw ignored, processed tracked)
├── public/maps/                   # Campus floor plans & architectural references
├── scripts/start-local.ps1       # One-command local dev launcher
├── .env.example                   # Frontend env template
├── backend/.env.example           # Backend env template
├── vercel.json                    # Vercel deployment config
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
git clone https://github.com/YOUR_USERNAME/CARBengine.git
cd CARBengine
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
# Edit .env.local with your Supabase URL and publishable key
```

### 3. Set up Python backend

```bash
cd backend
python -m venv .venv
# Windows:
.\.venv\Scripts\Activate.ps1
# macOS/Linux:
# source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your Supabase credentials
cd ..
```

### 4. Run everything

```bash
npm run dev:all
```

This starts the FastAPI backend (port 8000) and Vite dev server (port 5173) together.

| Command | Description |
|---------|-------------|
| `npm run dev` | Frontend only |
| `npm run dev:all` | Frontend + backend together |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |

---

## 🔑 Environment Variables

<details>
<summary><b>Frontend</b> (.env.local)</summary>

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | ✅ | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ | Supabase publishable/anon key |
| `VITE_SUPABASE_DEVICE_ID` | — | Device ID filter (default: `ELEC-01`) |
| `VITE_CARBON_EMISSION_FACTOR_KG_PER_KWH` | — | Grid emission factor (default: `0.82`) |
| `VITE_RIVER_API_URL` | — | Backend API URL (default: `http://localhost:8000`) |

</details>

<details>
<summary><b>Backend</b> (backend/.env)</summary>

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | ✅ | Supabase publishable key |
| `SUPABASE_SECRET_KEY` | For admin ops | Server-only secret (account deletion) |
| `SUPABASE_DEVICE_ID` | — | Device ID (default: `ELEC-01`) |
| `FORECAST_TIMEZONE` | — | Timezone (default: `Asia/Kolkata`) |
| `CORS_ALLOWED_ORIGINS` | — | Allowed CORS origins |

</details>

---

## 📸 Screenshots

> **Add your screenshots to `docs/screenshots/` and update the paths below.**

<!-- 
To add screenshots:
1. Create a folder: docs/screenshots/
2. Place your .png/.jpg files there
3. Reference them like this:

| Live Monitoring | Energy & Carbon Analytics |
|:---:|:---:|
| ![Live](docs/screenshots/live-monitoring.png) | ![Analytics](docs/screenshots/energy-analytics.png) |

| Bill Forecast | Anomaly Monitor |
|:---:|:---:|
| ![Bills](docs/screenshots/bill-forecast.png) | ![Anomaly](docs/screenshots/anomaly-monitor.png) |

| Travel Calculator | Cost & Green Tax |
|:---:|:---:|
| ![Travel](docs/screenshots/travel-calculator.png) | ![Cost](docs/screenshots/cost-green-tax.png) |
-->

---

## 📊 Supabase Schema

The dashboard expects a `public.sensor_readings` table:

| Column | Type | Description |
|--------|------|-------------|
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

## 📄 License

This project is part of an academic/research initiative. See repository for details.

---

<p align="center">
  Built with ⚡ by Vedant Shelke
</p>
