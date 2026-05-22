param(
  [int]$ApiPort = 3000,
  [int]$FrontendPort = 8090,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Resolve-SamPath {
  $cmd = Get-Command sam -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $fallback = "C:\Users\laduc\AppData\Local\Programs\Amazon\AWSSAMCLI\bin\sam.cmd"
  if (Test-Path $fallback) { return $fallback }
  throw "SAM CLI not found. Install SAM CLI first."
}

function Resolve-NodePath {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $fallback = "C:\Users\laduc\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  if (Test-Path $fallback) { return $fallback }
  throw "Node.js not found. Install Node.js first."
}

$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
  $sam = Resolve-SamPath
  $node = Resolve-NodePath

  if (-not $SkipBuild) {
    Write-Host "Building SAM app..."
    & $sam build --use-container
    if ($LASTEXITCODE -ne 0) { throw "sam build failed." }
  }

  $outLog = Join-Path $projectRoot "sam-local.out.log"
  $errLog = Join-Path $projectRoot "sam-local.err.log"
  if (Test-Path $outLog) { Remove-Item $outLog -Force }
  if (Test-Path $errLog) { Remove-Item $errLog -Force }

  Write-Host "Starting local API on port $ApiPort..."
  $api = Start-Process -FilePath $sam -ArgumentList @("local","start-api","--env-vars","sam.local.env.json","--port","$ApiPort") -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru

  $ready = $false
  $timeout = (Get-Date).AddMinutes(2)
  while ((Get-Date) -lt $timeout) {
    if (Test-Path $errLog) {
      $content = Get-Content $errLog -Raw
      if ($content -match "Running on http://127.0.0.1:$ApiPort") {
        $ready = $true
        break
      }
    }
    Start-Sleep -Seconds 2
  }
  if (-not $ready) {
    throw "SAM local API did not start in time. Check $errLog"
  }

  Write-Host "Starting frontend on port $FrontendPort..."
  $env:PORT = "$FrontendPort"
  Write-Host ""
  Write-Host "Frontend URL: http://localhost:$FrontendPort"
  Write-Host "In UI set API base URL: http://127.0.0.1:$ApiPort"
  Write-Host "Press Ctrl+C to stop frontend and API."
  Write-Host ""

  try {
    & $node scripts/serve-frontend.js
  }
  finally {
    if ($api -and -not $api.HasExited) {
      Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue
    }
  }
}
finally {
  Pop-Location
}

