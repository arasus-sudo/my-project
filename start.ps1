<#
    Starts the Innoira Agentic Suite locally.

    Three processes: MongoDB (Windows service), the FastAPI backend, and the
    React frontend. Each of the two servers opens in its own window so you can
    read its logs and Ctrl+C it independently.

    Usage:
        .\start.ps1              # start everything
        .\start.ps1 -Backend     # backend only
        .\start.ps1 -Frontend    # frontend only
        .\start.ps1 -Status      # just report what's running
#>
param(
    [switch]$Backend,
    [switch]$Frontend,
    [switch]$Status
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

# Port 8000 is permanently blocked on this machine at the OS level (WinError
# 10013 on bind — it survives reboots), so the backend lives on 8001.
# frontend\.env points REACT_APP_BACKEND_URL at 8001 to match; keep them in sync.
$BackendPort  = 8001
$FrontendPort = 3000

function Test-PortInUse($Port) {
    $null -ne (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
}

function Write-Step($Text)  { Write-Host "  $Text" -ForegroundColor Cyan }
function Write-Ok($Text)    { Write-Host "  OK    $Text" -ForegroundColor Green }
function Write-Warn2($Text) { Write-Host "  WARN  $Text" -ForegroundColor Yellow }
function Write-Err2($Text)  { Write-Host "  FAIL  $Text" -ForegroundColor Red }

Write-Host ""
Write-Host "Innoira Agentic Suite" -ForegroundColor White
Write-Host "---------------------"

# --- Preflight -------------------------------------------------------------
$Venv = Join-Path $Root "backend\venv\Scripts\python.exe"
if (-not (Test-Path $Venv)) {
    Write-Err2 "No backend venv at backend\venv. Create it with:"
    Write-Host "        cd $Root\backend; python -m venv venv; .\venv\Scripts\pip install -r requirements.txt"
    exit 1
}
if (-not (Test-Path (Join-Path $Root "frontend\node_modules"))) {
    Write-Warn2 "frontend\node_modules is missing. Run 'npm install' in frontend\ first."
}
if (-not (Test-Path (Join-Path $Root "backend\.env"))) {
    Write-Warn2 "backend\.env not found — the app will start but integrations will be unconfigured."
}

# --- MongoDB ---------------------------------------------------------------
$mongo = Get-Service -Name MongoDB -ErrorAction SilentlyContinue
if (-not $mongo) {
    Write-Warn2 "No 'MongoDB' Windows service found. If you run Mongo another way (Docker, mongod), start it yourself."
} elseif ($mongo.Status -ne "Running") {
    Write-Step "Starting MongoDB..."
    try {
        Start-Service MongoDB -ErrorAction Stop
        Write-Ok "MongoDB started"
    } catch {
        Write-Err2 "Could not start MongoDB (this usually needs an Administrator prompt)."
        Write-Host "        Run PowerShell as Administrator, then: Start-Service MongoDB"
        exit 1
    }
} else {
    Write-Ok "MongoDB running"
}

# --- Status only -----------------------------------------------------------
if ($Status) {
    if (Test-PortInUse $BackendPort)  { Write-Ok  "Backend  listening on $BackendPort" }
    else                              { Write-Warn2 "Backend  not running" }
    if (Test-PortInUse $FrontendPort) { Write-Ok  "Frontend listening on $FrontendPort" }
    else                              { Write-Warn2 "Frontend not running" }
    Write-Host ""
    exit 0
}

# If neither switch is passed, start both.
$startBackend  = $Backend -or (-not $Backend -and -not $Frontend)
$startFrontend = $Frontend -or (-not $Backend -and -not $Frontend)

# --- Backend ---------------------------------------------------------------
if ($startBackend) {
    if (Test-PortInUse $BackendPort) {
        Write-Ok "Backend already running on $BackendPort — leaving it alone"
    } else {
        Write-Step "Starting backend on $BackendPort..."
        Start-Process powershell -ArgumentList @(
            "-NoExit", "-Command",
            "cd '$Root\backend'; .\venv\Scripts\python.exe -m uvicorn server:app --reload --port $BackendPort"
        ) -WorkingDirectory "$Root\backend"

        $ready = $false
        foreach ($i in 1..30) {
            Start-Sleep -Milliseconds 700
            if (Test-PortInUse $BackendPort) { $ready = $true; break }
        }
        if ($ready) { Write-Ok "Backend up on http://localhost:$BackendPort" }
        else { Write-Err2 "Backend did not come up — check the window it opened for the traceback." }
    }
}

# --- Frontend --------------------------------------------------------------
if ($startFrontend) {
    if (Test-PortInUse $FrontendPort) {
        Write-Ok "Frontend already running on $FrontendPort — leaving it alone"
    } else {
        Write-Step "Starting frontend on $FrontendPort (first compile takes ~30s)..."
        Start-Process powershell -ArgumentList @(
            "-NoExit", "-Command", "cd '$Root\frontend'; npm start"
        ) -WorkingDirectory "$Root\frontend"

        $ready = $false
        foreach ($i in 1..60) {
            Start-Sleep -Milliseconds 1000
            if (Test-PortInUse $FrontendPort) { $ready = $true; break }
        }
        if ($ready) { Write-Ok "Frontend up on http://localhost:$FrontendPort" }
        else { Write-Warn2 "Frontend still compiling — check the window it opened." }
    }
}

Write-Host ""
Write-Host "  App:      http://localhost:$FrontendPort" -ForegroundColor White
Write-Host "  API docs: http://localhost:$BackendPort/docs" -ForegroundColor White
Write-Host ""
Write-Host "  Each server runs in its own window. Ctrl+C there to stop it." -ForegroundColor DarkGray
Write-Host ""
