from __future__ import annotations

import hashlib
import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from statsmodels.tsa.statespace.sarimax import SARIMAXResultsWrapper

BACKEND_DIR = Path(__file__).resolve().parent
MODEL_DIR = Path(os.getenv("CARB_MODEL_DIR", str(BACKEND_DIR / "models"))).resolve()
BILL_MODEL_VERSION = "sarimax-v1"
PERFORMANCE_EVALUATION_VERSION = "calendar-gap-aware-v2"
_store_lock = threading.RLock()


def _key_hash(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def load_or_fit_sarimax(
    *,
    cache_key: str,
    fingerprint: str,
    fit: Callable[[], Any],
    details: dict[str, Any],
) -> tuple[Any, dict[str, Any], bool]:
    """Load a matching local SARIMAX artifact or fit and persist a new one."""
    from statsmodels import __version__ as statsmodels_version

    artifact_dir = MODEL_DIR / "bills"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    stem = _key_hash(cache_key)
    model_path = artifact_dir / f"{stem}.pkl"
    manifest_path = artifact_dir / f"{stem}.json"

    with _store_lock:
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            if (
                manifest.get("fingerprint") == fingerprint
                and manifest.get("modelVersion") == BILL_MODEL_VERSION
                and manifest.get("statsmodelsVersion") == statsmodels_version
                and model_path.is_file()
            ):
                fitted = SARIMAXResultsWrapper.load(str(model_path))
                return fitted, manifest, True
        except Exception:
            pass

        fitted = fit()
        temporary_model = model_path.with_suffix(".tmp")
        temporary_manifest = manifest_path.with_suffix(".tmp")
        try:
            fitted.save(str(temporary_model))
            os.replace(temporary_model, model_path)
            manifest = {
                "fingerprint": fingerprint,
                "modelVersion": BILL_MODEL_VERSION,
                "statsmodelsVersion": statsmodels_version,
                "trainedAt": datetime.now(timezone.utc).isoformat(),
                "artifact": Path(os.path.relpath(model_path, BACKEND_DIR)).as_posix(),
                "aic": _finite_or_none(getattr(fitted, "aic", None)),
                "bic": _finite_or_none(getattr(fitted, "bic", None)),
                **details,
            }
            temporary_manifest.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
            os.replace(temporary_manifest, manifest_path)
        finally:
            temporary_model.unlink(missing_ok=True)
            temporary_manifest.unlink(missing_ok=True)
        return fitted, manifest, False


def read_series_performance(series_key: str, fingerprint: str) -> dict[str, Any] | None:
    path = MODEL_DIR / "bills" / f"{_key_hash('performance:' + series_key)}.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return None
    if (
        data.get("fingerprint") != fingerprint
        or data.get("evaluationVersion") != PERFORMANCE_EVALUATION_VERSION
    ):
        return None
    return data.get("performance")


def write_series_performance(series_key: str, fingerprint: str, performance: dict[str, Any]) -> None:
    directory = MODEL_DIR / "bills"
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{_key_hash('performance:' + series_key)}.json"
    temporary = path.with_suffix(".tmp")
    payload = {
        "fingerprint": fingerprint,
        "evaluationVersion": PERFORMANCE_EVALUATION_VERSION,
        "evaluatedAt": datetime.now(timezone.utc).isoformat(),
        "performance": performance,
    }
    with _store_lock:
        try:
            temporary.write_text(json.dumps(payload, indent=2), encoding="utf-8")
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)


def _finite_or_none(value: Any) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if result == result and abs(result) != float("inf") else None
