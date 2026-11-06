$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $projectRoot "backend"
$pythonPath = Join-Path $backendPath ".venv\Scripts\python.exe"
$stdoutLog = Join-Path $backendPath "uvicorn.local.out.log"
$stderrLog = Join-Path $backendPath "uvicorn.local.err.log"

if (-not (Test-Path -LiteralPath $pythonPath)) {
  throw "Backend Python environment not found at $pythonPath. Set up backend/.venv first."
}

$apiProcess = $null
try {
  $apiProcess = Start-Process `
    -FilePath $pythonPath `
    -ArgumentList @("-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000") `
    -WorkingDirectory $backendPath `
    -PassThru `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog

  $deadline = (Get-Date).AddSeconds(20)
  $apiReady = $false
  while ((Get-Date) -lt $deadline) {
    if ($apiProcess.HasExited) {
      throw "FastAPI stopped during startup. Check backend/uvicorn.local.err.log."
    }
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/health" -TimeoutSec 2
      if ($health.status -eq "ok") {
        $apiReady = $true
        break
      }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }

  if (-not $apiReady) {
    throw "FastAPI did not become ready within 20 seconds. Check backend/uvicorn.local.err.log."
  }

  Write-Host "FastAPI is running at http://localhost:8000"
  Write-Host "Starting the React dashboard. Press Ctrl+C to stop both services."
  Push-Location $projectRoot
  try {
    & npm run dev
  } finally {
    Pop-Location
  }
} finally {
  if ($apiProcess -and -not $apiProcess.HasExited) {
    Stop-Process -Id $apiProcess.Id -Force
  }
}
