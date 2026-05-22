##############################################################################
#  run-frontend-flow.ps1
#  Starts the local API dev server + frontend in a single terminal.
#  No Docker required -- the Lambda handler runs directly via Node.js.
#
#  Usage:
#    npm run run:flow
#    powershell -ExecutionPolicy Bypass -File .\scripts\run-frontend-flow.ps1
##############################################################################
param(
  [int]$ApiPort      = 3000,
  [int]$FrontendPort = 8080
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot

function Resolve-NodePath {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  throw "Node.js not found. Install Node.js 20+ from https://nodejs.org"
}

$node = Resolve-NodePath

Push-Location $projectRoot
try {
  if (-not (Test-Path "sam.local.env.json")) {
    Write-Warning "sam.local.env.json not found -- copy sam.local.env.example.json and add your GEMINI_API_KEY."
  }

  # Kill any process already listening on the API port
  $existing = netstat -ano | Select-String ":$ApiPort\s.*LISTENING"
  if ($existing) {
    $pid = ($existing -split '\s+')[-1]
    Write-Host "Stopping existing process on port $ApiPort (PID $pid)..." -ForegroundColor Gray
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
  }

  Write-Host "Starting API dev server on port $ApiPort..." -ForegroundColor Cyan

  $apiLog    = Join-Path $env:TEMP "dev-server-run.log"
  $apiErrLog = Join-Path $env:TEMP "dev-server-run-err.log"
  try { if (Test-Path $apiLog)    { Remove-Item $apiLog    -Force } } catch {}
  try { if (Test-Path $apiErrLog) { Remove-Item $apiErrLog -Force } } catch {}

  $env:PORT = "$ApiPort"
  $apiProc = Start-Process -FilePath $node `
    -ArgumentList "scripts/dev-server.mjs" `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $apiLog `
    -RedirectStandardError  $apiErrLog `
    -PassThru

  $ready   = $false
  $timeout = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $timeout) {
    if (Test-Path $apiLog) {
      $content = Get-Content $apiLog -Raw -ErrorAction SilentlyContinue
      if ($content -match "Local Dev Server") { $ready = $true; break }
    }
    Start-Sleep -Milliseconds 500
  }

  if (-not $ready) {
    if (Test-Path $apiErrLog) { Get-Content $apiErrLog | Select-Object -First 20 }
    throw "API server did not start in 20 s. Check $apiErrLog"
  }

  Write-Host "API ready at http://127.0.0.1:$ApiPort" -ForegroundColor Green

  $env:PORT = "$FrontendPort"
  Write-Host ""
  Write-Host "  Dashboard : http://localhost:$FrontendPort" -ForegroundColor Yellow
  Write-Host "  API       : http://127.0.0.1:$ApiPort" -ForegroundColor Yellow
  Write-Host "  API BASE URL is pre-filled in the dashboard." -ForegroundColor Yellow
  Write-Host "  Press Ctrl+C to stop." -ForegroundColor Yellow
  Write-Host ""

  try {
    & $node scripts/serve-frontend.js
  } finally {
    if ($apiProc -and -not $apiProc.HasExited) {
      Stop-Process -Id $apiProc.Id -Force -ErrorAction SilentlyContinue
      Write-Host "API server stopped." -ForegroundColor Gray
    }
  }
} finally {
  $env:PORT = ""
  Pop-Location
}
