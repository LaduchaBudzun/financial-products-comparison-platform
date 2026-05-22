param(
  [string]$SamPath = "C:\Users\laduc\AppData\Local\Programs\Amazon\AWSSAMCLI\bin\sam.cmd",
  [string]$ProjectRoot = "C:\Main\code\Apps\financial-products-comparison-platform",
  [int]$ApiPort = 3000
)

$ErrorActionPreference = "Stop"
$scriptStart = Get-Date

if (-not (Test-Path $SamPath)) {
  throw "SAM CLI path not found: $SamPath"
}

$envFile = Join-Path $ProjectRoot "sam.local.env.json"
if (-not (Test-Path $envFile)) {
  throw "Missing env file: $envFile"
}

Push-Location $ProjectRoot
try {
  $existingPythonIds = @((Get-Process -Name python -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id))
  Write-Host "Running unit tests..."
  $nodePath = (Get-Command node -ErrorAction Stop).Source
  & $nodePath --test tests/unit/comparisonService.test.js tests/unit/marketDataService.test.js tests/unit/validator.test.js

  Write-Host "Building SAM app..."
  & $SamPath build --use-container

  $outLog = Join-Path $ProjectRoot "sam-local.out.log"
  $errLog = Join-Path $ProjectRoot "sam-local.err.log"
  if (Test-Path $outLog) { Remove-Item $outLog -Force }
  if (Test-Path $errLog) { Remove-Item $errLog -Force }

  Write-Host "Starting local API..."
  $api = Start-Process -FilePath $SamPath -ArgumentList @("local", "start-api", "--env-vars", "sam.local.env.json", "--port", "$ApiPort") -WorkingDirectory $ProjectRoot -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru

  try {
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
      throw "SAM local API did not start within timeout."
    }

    Write-Host "Calling endpoints..."
    $products = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/products/mortgages" -Method Get -TimeoutSec 180

    $comparePayload = @{
      category = "mortgages"
      criteria = @{
        riskTolerance = "medium"
        loanAmount = 200000
        ltv = 75
        horizonMonths = 36
        objective = "Looking to remortgage with stable payments"
      }
    } | ConvertTo-Json -Depth 8

    $compare = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/compare" -Method Post -ContentType "application/json" -Body $comparePayload -TimeoutSec 180

    $recs = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/recommendations?category=credit-cards&criteria=Need%20low%20overall%20cost" -Method Get -TimeoutSec 180

    [ordered]@{
      productsCount = $products.data.products.Count
      firstMortgageRate = $products.data.products[0].ratePercent
      compareWinner = $compare.comparison.winner.product.label
      compareRecommendationMode = $compare.recommendation.mode
      recommendationsMode = $recs.recommendation.mode
      recommendationsWinner = $recs.comparisonPreview.product.label
    } | ConvertTo-Json -Depth 8
  }
  finally {
    if ($api -and -not $api.HasExited) {
      Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue
    }
    Get-Process -Name python -ErrorAction SilentlyContinue |
      Where-Object { $_.StartTime -ge $scriptStart -and ($existingPythonIds -notcontains $_.Id) } |
      ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
  }
}
finally {
  Pop-Location
}
