param(
  [string]$StackName = "uk-financial-products-comparison-prod",
  [string]$Region = "eu-west-2",
  [string]$AwsProfile = "",
  [string]$StageName = "v1",
  [string]$AllowedOrigins = "*",
  [string]$CorsAllowOrigin = "*",
  [string]$GeminiApiKey = $env:GEMINI_API_KEY,
  [string]$ExchangeRateApiKey = "",
  [int]$CacheTtlSeconds = 3600,
  [string]$EnableExchangeData = "false"
)

$ErrorActionPreference = "Stop"

function Resolve-SamPath {
  $cmd = Get-Command sam -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  $fallback = "C:\Users\laduc\AppData\Local\Programs\Amazon\AWSSAMCLI\bin\sam.cmd"
  if (Test-Path $fallback) {
    return $fallback
  }

  throw "SAM CLI was not found. Install SAM CLI or add it to PATH."
}

function Try-LoadGeminiKeyFromLocalEnvFile {
  param([string]$ProjectRoot)

  $envFile = Join-Path $ProjectRoot ".env.local"
  if (-not (Test-Path $envFile)) {
    return $null
  }

  $line = Get-Content $envFile | Where-Object { $_ -match "^GEMINI_API_KEY=" } | Select-Object -First 1
  if (-not $line) {
    return $null
  }

  $value = ($line -replace "^GEMINI_API_KEY=", "").Trim()
  if (-not $value -or $value -eq "REPLACE_WITH_REAL_GEMINI_API_KEY") {
    return $null
  }

  return $value
}

function Invoke-Checked {
  param(
    [string]$CommandPath,
    [string[]]$Arguments
  )

  & $CommandPath @Arguments
  if ($LASTEXITCODE -ne 0) {
    $rendered = $Arguments -join " "
    $rendered = $rendered -replace "GeminiApiKey=\S+", "GeminiApiKey=***"
    $rendered = $rendered -replace "ExchangeRateApiKey=\S+", "ExchangeRateApiKey=***"
    throw "Command failed ($LASTEXITCODE): $CommandPath $rendered"
  }
}

$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
  $samPath = Resolve-SamPath
  if (-not $GeminiApiKey) {
    $GeminiApiKey = Try-LoadGeminiKeyFromLocalEnvFile -ProjectRoot $projectRoot
  }

  if (-not $GeminiApiKey) {
    throw "Gemini API key is required. Set GEMINI_API_KEY env var or update .env.local."
  }

  if ($EnableExchangeData -notin @("true", "false")) {
    throw "EnableExchangeData must be 'true' or 'false'."
  }

  $cacheTableName = "$StackName-cache"
  $overrides = @(
    "StageName=$StageName",
    "GeminiApiKey=$GeminiApiKey",
    "AllowedOrigins=$AllowedOrigins",
    "CorsAllowOrigin=$CorsAllowOrigin",
    "CacheTtlSeconds=$CacheTtlSeconds",
    "EnableExchangeData=$EnableExchangeData",
    "CacheTableName=$cacheTableName"
  )
  if ($ExchangeRateApiKey) {
    $overrides += "ExchangeRateApiKey=$ExchangeRateApiKey"
  }

  Write-Host "Validating SAM template..."
  Invoke-Checked -CommandPath $samPath -Arguments @("validate", "--region", $Region, "--lint")

  Write-Host "Building application..."
  Invoke-Checked -CommandPath $samPath -Arguments @("build", "--use-container")

  Write-Host "Deploying stack $StackName to $Region..."
  $deployArgs = @(
    "deploy",
    "--stack-name", $StackName,
    "--region", $Region,
    "--resolve-s3",
    "--capabilities", "CAPABILITY_IAM",
    "--no-confirm-changeset",
    "--no-fail-on-empty-changeset",
    "--parameter-overrides"
  ) + $overrides
  if ($AwsProfile) {
    $deployArgs = @("deploy", "--stack-name", $StackName, "--region", $Region, "--profile", $AwsProfile, "--resolve-s3", "--capabilities", "CAPABILITY_IAM", "--no-confirm-changeset", "--no-fail-on-empty-changeset", "--parameter-overrides") + $overrides
  }
  Invoke-Checked -CommandPath $samPath -Arguments $deployArgs

  Write-Host "Deployment completed."
}
finally {
  Pop-Location
}
