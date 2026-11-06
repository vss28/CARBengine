from __future__ import annotations

import asyncio
import hashlib
import math
import os
import pickle
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from river import compose, linear_model, metrics, optim, preprocessing
from bill_forecast import forecast_bill_dataset
from model_store import MODEL_DIR

load_dotenv()

HORIZON = timedelta(minutes=5)
SAMPLE_EVERY = timedelta(minutes=1)
MAX_TARGET_DELAY = timedelta(minutes=2)
MAX_READING_AGE = timedelta(seconds=60)
MAX_SAMPLE_GAP = timedelta(minutes=2)
MIN_TRAINED_SAMPLES = 12
MIN_PREVIEW_SAMPLES = 6
PAGE_SIZE = 1_000
MAX_BOOTSTRAP_ROWS = 20_000
BOOTSTRAP_DAYS = 14
RIVER_STATE_VERSION = 1
READING_COLUMNS = "device_id,recorded_at,voltage_v,current_a,power_w,energy_kwh,frequency_hz,power_factor"
logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_time(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)


def _number(value: Any, fallback: float | None = None) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    return number if math.isfinite(number) else fallback


def _supabase_settings() -> tuple[str, str, str]:
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    key = os.getenv("SUPABASE_PUBLISHABLE_KEY", "").strip()
    device_id = os.getenv("SUPABASE_DEVICE_ID", "ELEC-01").strip()
    if not url or not key:
        raise HTTPException(
            status_code=503,
            detail="Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY for the River service.",
        )
    return url, key, device_id


@dataclass
class PendingForecast:
    target_time: datetime
    features: dict[str, float]
    prediction_w: float | None


class OnlinePowerForecaster:
    """One-device, prequential River model for five-minute PZEM power."""

    def __init__(self) -> None:
        self.model = compose.Pipeline(
            preprocessing.StandardScaler(),
            linear_model.LinearRegression(
                optimizer=optim.SGD(lr=0.01),
                l2=0.0001,
            ),
        )
        self.mae = metrics.MAE()
        self.pending: list[PendingForecast] = []
        self.trained_samples = 0
        self.validated_samples = 0
        self.cursor_time: datetime | None = None
        self.cursor_fingerprints: set[tuple[Any, ...]] = set()
        self.last_valid_time: datetime | None = None
        self.last_valid_features: dict[str, float] | None = None
        self.last_origin_time: datetime | None = None
        self.last_power_w: float | None = None
        self.rows_seen = 0
        self.timezone = ZoneInfo(os.getenv("FORECAST_TIMEZONE", "Asia/Kolkata"))

    def _fingerprint(self, row: dict[str, Any]) -> tuple[Any, ...]:
        return tuple(row.get(column) for column in READING_COLUMNS.split(","))

    def _features(self, row: dict[str, Any], timestamp: datetime, power_w: float) -> dict[str, float]:
        voltage = _number(row.get("voltage_v"), 0.0) or 0.0
        current = _number(row.get("current_a"), 0.0) or 0.0
        frequency = _number(row.get("frequency_hz"), 0.0) or 0.0
        power_factor = _number(row.get("power_factor"), 0.0) or 0.0
        previous_power = power_w
        previous_voltage = voltage
        if self.last_valid_time and self.last_valid_features:
            gap = timestamp - self.last_valid_time
            if timedelta(0) <= gap <= MAX_SAMPLE_GAP:
                previous_power = self.last_valid_features["power_w"]
                previous_voltage = self.last_valid_features["voltage_v"]

        local_time = timestamp.astimezone(self.timezone)
        seconds = local_time.hour * 3_600 + local_time.minute * 60 + local_time.second
        day_fraction = seconds / 86_400 * math.tau
        week_fraction = (local_time.weekday() + seconds / 86_400) / 7 * math.tau
        return {
            "power_w": power_w,
            "current_a": current,
            "voltage_v": voltage,
            "frequency_hz": frequency,
            "power_factor": power_factor,
            "power_delta_w": power_w - previous_power,
            "voltage_delta_v": voltage - previous_voltage,
            "day_sin": math.sin(day_fraction),
            "day_cos": math.cos(day_fraction),
            "week_sin": math.sin(week_fraction),
            "week_cos": math.cos(week_fraction),
        }

    def _learn_due(self, timestamp: datetime, target_w: float) -> None:
        waiting: list[PendingForecast] = []
        for example in self.pending:
            if timestamp < example.target_time:
                waiting.append(example)
            elif timestamp <= example.target_time + MAX_TARGET_DELAY:
                if example.prediction_w is not None:
                    self.mae.update(target_w, example.prediction_w)
                    self.validated_samples += 1
                self.model.learn_one(example.features, target_w)
                self.trained_samples += 1
            # Forecasts without a target reading within the two-minute grace period expire.
        self.pending = waiting

    def process(self, row: dict[str, Any]) -> None:
        timestamp = _parse_time(row.get("recorded_at"))
        if timestamp is None:
            return

        fingerprint = self._fingerprint(row)
        if self.cursor_time and timestamp < self.cursor_time:
            return
        if self.cursor_time and timestamp == self.cursor_time and fingerprint in self.cursor_fingerprints:
            return
        if self.cursor_time is None or timestamp > self.cursor_time:
            self.cursor_time = timestamp
            self.cursor_fingerprints = {fingerprint}
        else:
            self.cursor_fingerprints.add(fingerprint)

        self.rows_seen += 1
        power_w = _number(row.get("power_w"))
        voltage_v = _number(row.get("voltage_v"))
        if power_w is None or power_w < 0 or voltage_v is None or not 80 <= voltage_v <= 300:
            return

        self._learn_due(timestamp, power_w)
        features = self._features(row, timestamp, power_w)
        self.last_valid_time = timestamp
        self.last_valid_features = features
        self.last_power_w = power_w

        if self.last_origin_time is None or timestamp - self.last_origin_time >= SAMPLE_EVERY:
            prediction = None
            if self.trained_samples >= MIN_TRAINED_SAMPLES:
                candidate = _number(self.model.predict_one(features))
                prediction = max(0.0, candidate) if candidate is not None else None
            self.pending.append(PendingForecast(timestamp + HORIZON, features, prediction))
            self.last_origin_time = timestamp

    def response(self, device_id: str) -> dict[str, Any]:
        last_time = self.last_valid_time
        stale = last_time is None or _utc_now() - last_time > MAX_READING_AGE
        status = "stale" if stale else "warming"
        power_w = None
        if not stale and self.trained_samples >= MIN_PREVIEW_SAMPLES and self.last_valid_features:
            candidate = _number(self.model.predict_one(self.last_valid_features))
            if candidate is not None:
                power_w = max(0.0, candidate)
                if self.trained_samples >= MIN_TRAINED_SAMPLES:
                    status = "ready"

        mae_w = _number(self.mae.get()) if self.validated_samples else None
        return {
            "status": status,
            "deviceId": device_id,
            "model": "River online linear regression",
            "horizonMinutes": 5,
            "samples": self.trained_samples,
            "minimumReadySamples": MIN_TRAINED_SAMPLES,
            "pendingSamples": len(self.pending),
            "validatedSamples": self.validated_samples,
            "lastRecordedAt": last_time.isoformat().replace("+00:00", "Z") if last_time else None,
            "powerW": power_w,
            "maeW": mae_w,
        }


engine = OnlinePowerForecaster()
engine_lock = asyncio.Lock()
history_loaded = False
active_device_id: str | None = None


def _river_state_path(device_id: str) -> Path:
    digest = hashlib.sha256(device_id.encode("utf-8")).hexdigest()
    return MODEL_DIR / "river" / f"{digest}.pkl"


def _load_river_state(device_id: str) -> OnlinePowerForecaster | None:
    path = _river_state_path(device_id)
    try:
        with path.open("rb") as handle:
            state = pickle.load(handle)
        saved_engine = state.get("engine")
        timezone_key = ZoneInfo(os.getenv("FORECAST_TIMEZONE", "Asia/Kolkata")).key
        if (
            state.get("version") == RIVER_STATE_VERSION
            and state.get("deviceId") == device_id
            and isinstance(saved_engine, OnlinePowerForecaster)
            and saved_engine.timezone.key == timezone_key
            and saved_engine.cursor_time is not None
        ):
            return saved_engine
    except (OSError, EOFError, pickle.UnpicklingError, AttributeError, ImportError, TypeError, ValueError):
        pass
    return None


def _save_river_state(device_id: str, model: OnlinePowerForecaster) -> bool:
    path = _river_state_path(device_id)
    temporary = path.with_suffix(".tmp")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with temporary.open("wb") as handle:
            pickle.dump(
                {"version": RIVER_STATE_VERSION, "deviceId": device_id, "engine": model},
                handle,
                protocol=pickle.HIGHEST_PROTOCOL,
            )
        os.replace(temporary, path)
        return True
    except (OSError, pickle.PickleError, TypeError, AttributeError):
        logger.exception("Could not persist River model state for device %s", device_id)
        return False
    finally:
        temporary.unlink(missing_ok=True)

app = FastAPI(title="CARBengine River Forecast", version="1.0.0")
allowed_origins = [
    item.strip()
    for item in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if item.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "DELETE"],
    allow_headers=["Accept", "Authorization"],
)


async def _require_module_access(authorization: str | None, module_key: str) -> tuple[str, str]:
    """Validate a Supabase session and require an active profile with module access."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Sign in to access this forecast.")
    url, key, _ = _supabase_settings()
    headers = {"apikey": key, "Authorization": authorization, "Accept": "application/json"}
    async with httpx.AsyncClient() as client:
        auth_response = await client.get(f"{url}/auth/v1/user", headers=headers, timeout=10.0)
        if auth_response.status_code in (401, 403):
            raise HTTPException(status_code=401, detail="Your sign-in session has expired. Sign in again.")
        if auth_response.is_error:
            raise HTTPException(status_code=502, detail="Could not validate your Supabase session.")
        auth_user = auth_response.json()
        user_id = auth_user.get("id") if isinstance(auth_user, dict) else None
        if not isinstance(user_id, str):
            raise HTTPException(status_code=401, detail="Your sign-in session is invalid.")

        profile_response = await client.get(
            f"{url}/rest/v1/user_profiles",
            params={"select": "role,active", "user_id": f"eq.{user_id}"},
            headers=headers,
            timeout=10.0,
        )
        if profile_response.is_error:
            raise HTTPException(status_code=403, detail="Your CARBengine profile is not available.")
        profiles = profile_response.json()
        profile = profiles[0] if isinstance(profiles, list) and profiles else None
        if not isinstance(profile, dict) or not profile.get("active"):
            raise HTTPException(status_code=403, detail="Your CARBengine account is inactive or has no assigned role.")

        module_response = await client.get(
            f"{url}/rest/v1/dashboard_modules",
            params={"select": "enabled", "module_key": f"eq.{module_key}"},
            headers=headers,
            timeout=10.0,
        )
        if module_response.is_error:
            raise HTTPException(status_code=403, detail="Dashboard module permissions could not be loaded.")
        module_rows = module_response.json()
        if not isinstance(module_rows, list) or not module_rows or not module_rows[0].get("enabled"):
            raise HTTPException(status_code=403, detail="This dashboard module is disabled.")

        role = profile.get("role")
        if role == "admin":
            return authorization, role
        permission_response = await client.get(
            f"{url}/rest/v1/role_module_permissions",
            params={"select": "access_level", "role": f"eq.{role}", "module_key": f"eq.{module_key}"},
            headers=headers,
            timeout=10.0,
        )
        if permission_response.is_error:
            raise HTTPException(status_code=403, detail="Role permissions could not be loaded.")
        permission_rows = permission_response.json()
        if not isinstance(permission_rows, list) or not permission_rows or permission_rows[0].get("access_level") == "none":
            raise HTTPException(status_code=403, detail="Your role does not have access to this dashboard module.")
        return authorization, role


async def _require_admin_for_account_deletion(authorization: str | None) -> tuple[str, str, str]:
    """Validate the signed-in admin before using the server-only Supabase secret."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Sign in as an administrator to delete accounts.")
    url, publishable_key, _ = _supabase_settings()
    user_headers = {"apikey": publishable_key, "Authorization": authorization, "Accept": "application/json"}
    async with httpx.AsyncClient() as client:
        auth_response = await client.get(f"{url}/auth/v1/user", headers=user_headers, timeout=10.0)
        if auth_response.status_code in (401, 403):
            raise HTTPException(status_code=401, detail="Your sign-in session has expired. Sign in again.")
        if auth_response.is_error:
            raise HTTPException(status_code=502, detail="Could not validate your Supabase session.")
        auth_user = auth_response.json()
        user_id = auth_user.get("id") if isinstance(auth_user, dict) else None
        if not isinstance(user_id, str):
            raise HTTPException(status_code=401, detail="Your sign-in session is invalid.")

        profile_response = await client.get(
            f"{url}/rest/v1/user_profiles",
            params={"select": "role,active", "user_id": f"eq.{user_id}"},
            headers=user_headers,
            timeout=10.0,
        )
        if profile_response.is_error:
            raise HTTPException(status_code=403, detail="Your CARBengine profile is not available.")
        profiles = profile_response.json()
        profile = profiles[0] if isinstance(profiles, list) and profiles else None
        if not isinstance(profile, dict) or profile.get("role") != "admin" or not profile.get("active"):
            raise HTTPException(status_code=403, detail="Only an active administrator can delete accounts.")

    secret_key = os.getenv("SUPABASE_SECRET_KEY", "").strip() or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not secret_key:
        raise HTTPException(
            status_code=503,
            detail="Account deletion is not configured. Add SUPABASE_SECRET_KEY to the backend environment and restart the API.",
        )
    return url, user_id, secret_key


@app.delete("/api/admin/users/{target_user_id}")
async def delete_admin_user(
    target_user_id: UUID,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    url, caller_id, secret_key = await _require_admin_for_account_deletion(authorization)
    if str(target_user_id) == caller_id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account from User Management.")

    service_headers = {"apikey": secret_key, "Accept": "application/json"}
    # New sb_secret_ keys are API keys, not JWTs; Supabase requires them on apikey only.
    # Keep Bearer auth for projects still using the legacy service_role JWT.
    if not secret_key.startswith("sb_secret_"):
        service_headers["Authorization"] = f"Bearer {secret_key}"
    async with httpx.AsyncClient() as client:
        try:
            target_response = await client.get(
                f"{url}/rest/v1/user_profiles",
                params={"select": "user_id,role,active", "user_id": f"eq.{target_user_id}"},
                headers=service_headers,
                timeout=10.0,
            )
            if target_response.is_error:
                raise HTTPException(status_code=502, detail="Could not load the target account profile.")
            targets = target_response.json()
            if not isinstance(targets, list) or not targets:
                raise HTTPException(status_code=404, detail="That account profile was not found.")
            target = targets[0]

            if target.get("role") == "admin" and target.get("active"):
                admins_response = await client.get(
                    f"{url}/rest/v1/user_profiles",
                    params={"select": "user_id", "role": "eq.admin", "active": "eq.true"},
                    headers=service_headers,
                    timeout=10.0,
                )
                if admins_response.is_error:
                    raise HTTPException(status_code=502, detail="Could not verify the remaining administrator accounts.")
                admins = admins_response.json()
                if isinstance(admins, list) and len(admins) <= 1:
                    raise HTTPException(status_code=409, detail="The last active administrator account cannot be deleted.")

            auth_delete = await client.delete(
                f"{url}/auth/v1/admin/users/{target_user_id}",
                headers=service_headers,
                timeout=15.0,
            )
            if auth_delete.status_code == 404:
                raise HTTPException(status_code=404, detail="The Supabase Auth account was not found.")
            if auth_delete.is_error:
                logger.error("Supabase Auth rejected account deletion for user %s with HTTP %s", target_user_id, auth_delete.status_code)
                raise HTTPException(status_code=502, detail="Supabase could not delete this account. Check the backend secret key and profile foreign-key settings.")

            profile_delete = await client.delete(
                f"{url}/rest/v1/user_profiles",
                params={"user_id": f"eq.{target_user_id}"},
                headers=service_headers,
                timeout=10.0,
            )
            if profile_delete.is_error:
                logger.error("Auth account %s was deleted, but its user_profiles row could not be cleaned up (HTTP %s)", target_user_id, profile_delete.status_code)
                raise HTTPException(status_code=502, detail="The Auth account was deleted, but its CARBengine profile could not be cleaned up.")
        except httpx.HTTPError as error:
            logger.warning("Supabase account deletion request failed for user %s: %s", target_user_id, error)
            raise HTTPException(status_code=502, detail="Could not reach Supabase to delete this account.") from error

    return {"deleted": True, "userId": str(target_user_id)}


async def _request_rows(
    client: httpx.AsyncClient,
    url: str,
    key: str,
    authorization: str,
    device_id: str,
    start: int,
    stop: int,
    recorded_filter: str,
    order: str,
) -> list[dict[str, Any]]:
    response = await client.get(
        f"{url}/rest/v1/sensor_readings",
        params={
            "select": READING_COLUMNS,
            "device_id": f"eq.{device_id}",
            "recorded_at": recorded_filter,
            "order": order,
        },
        headers={
            "apikey": key,
            "Authorization": authorization,
            "Range-Unit": "items",
            "Range": f"{start}-{stop}",
        },
        timeout=15.0,
    )
    if response.is_error:
        raise HTTPException(
            status_code=502,
            detail="The River service could not read the configured device from Supabase. Check its key, table access, and RLS policy.",
        )
    payload = response.json()
    if not isinstance(payload, list):
        raise HTTPException(status_code=502, detail="Supabase returned an invalid sensor_readings response.")
    return payload


async def _load_history(client: httpx.AsyncClient, url: str, key: str, authorization: str, device_id: str) -> list[dict[str, Any]]:
    since = (_utc_now() - timedelta(days=BOOTSTRAP_DAYS)).isoformat(timespec="seconds").replace("+00:00", "Z")
    rows: list[dict[str, Any]] = []
    for start in range(0, MAX_BOOTSTRAP_ROWS, PAGE_SIZE):
        page = await _request_rows(
            client, url, key, authorization, device_id, start, start + PAGE_SIZE - 1, f"gte.{since}", "recorded_at.desc",
        )
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            break
    return sorted(rows, key=lambda row: _parse_time(row.get("recorded_at")) or datetime.min.replace(tzinfo=timezone.utc))


async def _load_new_rows(
    client: httpx.AsyncClient,
    url: str,
    key: str,
    authorization: str,
    device_id: str,
    after: datetime,
) -> list[dict[str, Any]]:
    after_text = after.isoformat(timespec="microseconds").replace("+00:00", "Z")
    rows: list[dict[str, Any]] = []
    for start in range(0, MAX_BOOTSTRAP_ROWS, PAGE_SIZE):
        page = await _request_rows(
            client, url, key, authorization, device_id, start, start + PAGE_SIZE - 1, f"gte.{after_text}", "recorded_at.asc",
        )
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            break
    return sorted(rows, key=lambda row: _parse_time(row.get("recorded_at")) or datetime.min.replace(tzinfo=timezone.utc))


async def _refresh_model(authorization: str) -> tuple[str, dict[str, Any]]:
    global history_loaded, engine, active_device_id
    url, key, device_id = _supabase_settings()
    if active_device_id != device_id:
        engine = _load_river_state(device_id) or OnlinePowerForecaster()
        history_loaded = engine.cursor_time is not None
        active_device_id = device_id
    async with httpx.AsyncClient() as client:
        if not history_loaded:
            rows = await _load_history(client, url, key, authorization, device_id)
            for row in rows:
                engine.process(row)
            history_loaded = True
        elif engine.cursor_time:
            rows = await _load_new_rows(client, url, key, authorization, device_id, engine.cursor_time)
            for row in rows:
                engine.process(row)
        else:
            rows = await _load_history(client, url, key, authorization, device_id)
            for row in rows:
                engine.process(row)
    if rows:
        _save_river_state(device_id, engine)
    return device_id, engine.response(device_id)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "river-forecast"}


@app.get("/api/forecast")
async def forecast(
    device_id: str = Query(min_length=1, max_length=80),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user_authorization, _ = await _require_module_access(authorization, "live")
    _, _, configured_device = _supabase_settings()
    if device_id != configured_device:
        raise HTTPException(status_code=404, detail="No River model is configured for this device.")
    async with engine_lock:
        return (await _refresh_model(user_authorization))[1]


@app.get("/api/bills/forecast")
async def bill_forecast(
    series_id: str | None = Query(default=None, min_length=1, max_length=300),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    await _require_module_access(authorization, "planning")
    return forecast_bill_dataset(series_id)
