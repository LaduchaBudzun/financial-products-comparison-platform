# UK Financial Products Comparison Platform (Serverless, AWS)

Production-oriented home assignment implementation for comparing UK financial products using live public market data and AI-assisted analysis.

## 1) What This Builds

Serverless application with:

- **AWS Lambda** (single function with route handlers)
- **API Gateway (REST)** with required endpoints
- **DynamoDB cache** (TTL-enabled)
- **CloudWatch logging/metrics**
- **Live public data integrations**:
  - Bank of England Statistical API (rates)
  - ONS API (UK inflation benchmark)
  - Optional exchange-rate enrichment (exchangerate.host + Frankfurter fallback)
- **AI recommendations** via **Google Gemini API** with deterministic fallback
- **Frontend dashboard** (HTML/CSS/JS) with table + chart + comparison form + AI insights

## 2) Architecture

```text
Browser Dashboard (frontend/)
      |
      v
API Gateway (REST)
      |
      v
Lambda (src/app.js)
  |- Handlers (products/compare/recommendations)
  |- Services (market-data/comparison/recommendation)
  |- External adapters
  |    |- Bank of England API
  |    |- ONS API
  |    |- Gemini API
  |    |- Exchange rate APIs (optional enrichment)
  |- Cache adapter
       |- DynamoDB (prod)
       |- In-memory (local fallback)
```

### Design principles used

- **SOLID**: dependencies are injected via container; adapters and services have single responsibility.
- **KISS**: one Lambda, explicit route handling, no unnecessary orchestration.
- **DRY**: shared validation, error, HTTP client, retry, and response modules.

## 3) Core Features vs Assignment

- Data layer:
  - Live fetch + normalization for BoE/ONS
  - Retry with exponential backoff + jitter
  - Timeout protection and error classification
  - Caching with TTL (DynamoDB in AWS, in-memory in local mode)
- AI analysis layer:
  - Gemini prompt with context from normalized live data
  - Deterministic rule-based fallback if AI unavailable
  - Safety language in prompts and output disclaimers
- REST endpoints (required):
  - `GET /products/{category}`
  - `POST /compare`
  - `GET /recommendations?criteria=...`
- Frontend dashboard:
  - Comparison controls and table
  - Trend visualization (`<canvas>`)
  - AI insights panel

## 4) Data Sources

1. **Bank of England Statistical Database** (live)
   - Mortgage benchmarks, base rate series, savings benchmark, credit card benchmark
2. **ONS API** (live)
   - UK CPI annual inflation series for real-return context
3. **Optional enrichment**:
   - exchangerate.host (if enabled via env)
   - Frankfurter/ECB fallback

Reasoning:
- BoE + ONS provide zero-cost, public, UK-relevant fundamentals without paid dependencies.
- Exchange-rate feed is optional enrichment for credit card foreign-spend analysis.

## 5) API Reference

### `GET /products/{category}`

Supported categories:
- `mortgages`
- `savings`
- `credit-cards`

Example:

```bash
curl "$API_BASE/products/mortgages"
```

Response (shape):

```json
{
  "data": {
    "category": "mortgages",
    "asOf": "2026-05-21T12:00:00.000Z",
    "sources": ["Bank of England"],
    "products": [],
    "trends": {},
    "cache": { "hit": false }
  },
  "disclaimers": []
}
```

### `POST /compare`

Example:

```bash
curl -X POST "$API_BASE/compare" \
  -H "Content-Type: application/json" \
  -d '{
    "category":"mortgages",
    "criteria":{
      "riskTolerance":"medium",
      "loanAmount":200000,
      "ltv":75,
      "horizonMonths":36,
      "objective":"Looking to remortgage with predictable payments"
    }
  }'
```

Response includes:
- normalized criteria
- ranking and winner
- AI recommendation (or deterministic fallback)

### `GET /recommendations?criteria=...`

Example:

```bash
curl "$API_BASE/recommendations?category=savings&criteria=How%20do%20savings%20rates%20compare%20to%20inflation%3F"
```

## 6) Environment Variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `CACHE_PROVIDER` | no | `memory` | `dynamodb` in AWS, `memory` for local |
| `CACHE_TABLE_NAME` | no | `financial-products-cache` | DynamoDB table |
| `CACHE_TTL_SECONDS` | no | `3600` | API response cache TTL |
| `BOE_BASE_URL` | no | `https://www.bankofengland.co.uk` | BoE base URL |
| `ONS_BASE_URL` | no | `https://api.ons.gov.uk` | ONS base URL |
| `GEMINI_API_KEY` | **yes for AI mode** | - | Gemini API key |
| `GEMINI_BASE_URL` | no | `https://generativelanguage.googleapis.com` | Gemini API base |
| `GEMINI_MODEL` | no | `gemini-2.0-flash` | model name |
| `REQUEST_TIMEOUT_MS` | no | `5000` | per external request timeout |
| `RETRY_ATTEMPTS` | no | `2` | transient retry count |
| `RETRY_BASE_DELAY_MS` | no | `250` | retry base delay |
| `ALLOWED_ORIGINS` | no | `*` | comma-separated CORS allow list |
| `ENABLE_EXCHANGE_DATA` | no | `false` | optional FX enrichment |
| `EXCHANGE_RATE_API_BASE_URL` | no | `https://api.exchangerate.host` | primary FX |
| `EXCHANGE_RATE_API_KEY` | optional | - | API key for exchangerate.host if needed |
| `EXCHANGE_RATE_FALLBACK_BASE_URL` | no | `https://api.frankfurter.app` | fallback FX source |

## 7) Local Run

### Prerequisites

- AWS SAM CLI
- Docker (for `sam local`)
- Node.js 20+ (for local scripts/tests)

### Steps

1. Install dependencies:

```bash
npm install
```

2. Create local env files from templates and set your Gemini key:

```bash
cp .env.local.example .env.local
cp sam.local.env.example.json sam.local.env.json
```

For Windows PowerShell:

```powershell
Copy-Item .env.local.example .env.local -Force
Copy-Item sam.local.env.example.json sam.local.env.json -Force
```

Set `GEMINI_API_KEY` inside `sam.local.env.json`.

3. Build:

```bash
sam build
```

4. Start API locally:

```bash
sam local start-api --env-vars sam.local.env.json
```

5. Start frontend (in another terminal):

```bash
npm run start:frontend
```

If port `8080` is occupied:

```bash
PORT=8090 npm run start:frontend
```

For Windows PowerShell:

```powershell
$env:PORT=8090
npm run start:frontend
```

6. Open dashboard:

- `http://localhost:8080`

7. In dashboard, set API base URL:

- `http://127.0.0.1:3000`

Notes:
- `sam.local.env.json` is local-only (gitignored) and overrides `CACHE_PROVIDER` to `memory`.
- If you rotate Gemini key, update `sam.local.env.json` (and optionally `.env.local`).

### Invoke sample events

```bash
sam local invoke ApiFunction -e events/get-products-mortgages.json
sam local invoke ApiFunction -e events/post-compare-mortgages.json
sam local invoke ApiFunction -e events/get-recommendations.json
```

## 8) Deployment

```bash
npm install
npm run deploy:prod
```

`deploy:prod` performs:
- SAM template lint validation
- containerized build
- non-interactive deploy with parameter overrides

If you use a named AWS profile:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-prod.ps1 -AwsProfile your-profile
```

After deploy, use CloudFormation output `ApiBaseUrl`.

If you prefer manual deploy:

```bash
sam deploy \
  --stack-name uk-financial-products-comparison-prod \
  --region eu-west-2 \
  --resolve-s3 \
  --capabilities CAPABILITY_IAM \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
    StageName=v1 \
    GeminiApiKey=YOUR_KEY \
    AllowedOrigins=* \
    CorsAllowOrigin=* \
    CacheTtlSeconds=3600 \
    EnableExchangeData=false \
    CacheTableName=uk-financial-products-comparison-prod-cache
```

## 9) Security & Backend Quality Controls

- Strict input validation and typed normalization
- Standardized error classes; sanitized external errors
- No stack traces leaked to API clients
- CORS managed explicitly (support for allowlist)
- Security headers on all responses
- External request timeout + retry strategy
- DynamoDB TTL caching to reduce API pressure and cost
- AI fallback mode to preserve service continuity
- Conservative recommendation language and disclaimers

## 10) Testing

Run unit tests:

```bash
npm test
```

Test scope:
- validation guardrails
- comparison scoring logic
- market data service behavior + cache semantics

End-to-end local smoke (tests + build + start-api + endpoint calls):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-local.ps1
```

## 11) Leadership & Architecture Section

### 11.1 Trade-offs

- Chose **single Lambda** for simplicity and deployment speed; trade-off is tighter coupling of routes compared to per-domain Lambdas.
- Used **deterministic fallback** for recommendations; trade-off is less nuanced output when AI is unavailable, but reliability is higher.
- Avoided frontend frameworks to keep review/deploy friction low; trade-off is less component abstraction versus React/Vue.

### 11.2 Team Planning (3 devs, 2 weeks)

- Dev A (Backend/Platform): Lambda architecture, adapters, caching, IaC, observability.
- Dev B (Data/AI): data normalization quality, AI prompting, evaluation harness, fallback tuning.
- Dev C (Frontend/QA): dashboard UX, API integration, accessibility, e2e smoke tests.
- Shared milestones:
  - Days 1-3: API skeleton + IaC + first live source
  - Days 4-6: second source + compare/recommendation logic
  - Days 7-9: frontend integration + testing
  - Days 10-12: hardening + observability + docs
  - Days 13-14: dress rehearsal + release candidate

### 11.3 Production Readiness Upgrades

- Add Cognito auth + per-user quotas/rate-limits
- Add WAF rules + API Gateway usage plans
- Add contract tests and synthetic canaries
- Add structured tracing (X-Ray + correlation IDs across external calls)
- Add data quality monitors (schema drift, stale source detection)
- Add prompt/version management and AI output evaluation metrics

### 11.4 If More Time

- Personalized product matching engine (eligibility-aware)
- Historical backtesting for recommendation quality
- Explainability panel with confidence and scenario sensitivity
- CI/CD pipeline with automated security scans (SAST, dependency, IaC checks)

## 12) Notes

- This project is an informational comparison tool, not personal regulated advice.
- Always verify rates, eligibility, total fees, and contractual terms with regulated providers before financial decisions.

## 13) Troubleshooting

- If recommendation mode is `rules-fallback`, check:
  - `GEMINI_API_KEY` in `sam.local.env.json`
  - Gemini quota/rate limits (`429 RESOURCE_EXHAUSTED`)
  - outbound network access from local Docker/SAM environment
- If `sam` is not found on Windows after installation, use:
  - `C:\Users\<you>\AppData\Local\Programs\Amazon\AWSSAMCLI\bin\sam.cmd`
- If `npm run deploy:prod` fails due missing AWS credentials:
  - configure AWS credentials/profile first (`aws configure` or SSO profile)
  - or run deploy script with `-AwsProfile your-profile`
