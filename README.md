# UK Financial Products Comparison Platform

> Serverless AWS application that pulls **live public market data**, enriches it with **Gemini AI analysis**, and presents actionable insights for UK consumers comparing mortgages, savings accounts, and credit cards.

---

## Architecture

```
Browser Dashboard  (frontend/ — HTML + CSS + Chart.js, no build step)
        │
        ▼
API Gateway (REST)
  ├─ GET  /products/{category}
  ├─ POST /compare
  └─ GET  /recommendations
        │
        ▼
Lambda  src/app.js  (Node.js 24.x · single function · 512 MB · 15s timeout)
  │
  ├──► Bank of England Statistical API   (mortgage / savings / base-rate CSV series)
  ├──► ONS website generator CSV         (CPI inflation — api.ons.gov.uk retired Nov 2024)
  ├──► Frankfurter / ECB                 (GBP exchange rates — free, no key needed)
  ├──► Google Gemini API                 (AI recommendations · key sent via header, not URL)
  └──► DynamoDB (prod) / in-memory (local)  (TTL cache · SSE encrypted · PITR enabled)
```

### Design principles

| Principle | How applied |
|-----------|-------------|
| **SOLID** | Each external API has its own adapter class; services depend on injected interfaces; `container.js` wires everything via dependency injection |
| **KISS** | One Lambda with explicit route dispatch — no service mesh, no unnecessary orchestration layers |
| **DRY** | Shared `retry`, `csvUtils`, `dateUtils`, `mathUtils`, `http`, `errors`, `validation` modules used across all handlers |
| **Security-first** | API key in header not URL; body size limit 50 KB; prompt sanitisation; HTML escaping in UI; no stack traces exposed to clients |

---

## Data Sources

| Source | Auth | Data used | Status |
|--------|------|-----------|--------|
| **Bank of England** Statistical Database | None | `IUMBV34` 2yr fixed, `IUMBV37` 3yr fixed, `IUMBV42` 5yr fixed, `IUMABEDR` Bank Rate, `IUMZID2` 2yr ISA, `IUMCCTL` CC APR | ✅ Live verified |
| **ONS** CPI via `ons.gov.uk/generator` | None | `D7G7` CPI annual rate — note: `api.ons.gov.uk` was **decommissioned 25 Nov 2024** | ✅ Live verified |
| **Frankfurter / ECB** | None | `GBP → USD, EUR` for credit card FX cost modelling (`ENABLE_EXCHANGE_DATA=true`) | ✅ Live verified |
| **Google Gemini** `gemini-2.0-flash` | API key | AI-powered product recommendations; deterministic fallback on quota/failure | ✅ Key verified |

---

## API Reference

All responses include `X-Request-ID`, security headers (`X-Content-Type-Options`, `X-Frame-Options`, `CSP`, `Cache-Control: no-store`), and CORS headers.

### `GET /products/{category}`

`category` ∈ `mortgages` | `savings` | `credit-cards`

```bash
curl "$API_BASE/products/mortgages"
curl "$API_BASE/products/savings"
curl "$API_BASE/products/credit-cards"
```

Response shape:

```json
{
  "data": {
    "category": "mortgages",
    "asOf": "2026-05-22T10:00:00.000Z",
    "sources": ["Bank of England"],
    "products": [
      {
        "id": "mortgage_fixed_2y_75_ltv",
        "label": "2-year fixed mortgage (75% LTV)",
        "type": "fixed",
        "termMonths": 24,
        "ratePercent": 5.14
      },
      {
        "id": "mortgage_tracker_proxy",
        "label": "Tracker mortgage proxy (Bank Rate + 1.15%)",
        "type": "variable",
        "termMonths": null,
        "ratePercent": 4.90,
        "assumptions": ["Proxy benchmark for comparison only"]
      }
    ],
    "trends": {
      "fixed2y": [{ "date": "2024-01-31", "value": 5.45 }, "…"],
      "bankRate": ["…"]
    },
    "cache": { "hit": false }
  },
  "disclaimers": ["Informational tool only, not regulated financial advice."]
}
```

### `POST /compare`

```bash
curl -X POST "$API_BASE/compare" \
  -H "Content-Type: application/json" \
  -d '{
    "category": "mortgages",
    "criteria": {
      "riskTolerance": "medium",
      "loanAmount": 200000,
      "ltv": 75,
      "horizonMonths": 36,
      "objective": "Looking to remortgage with predictable payments"
    }
  }'
```

Response includes `comparison.winner`, `comparison.ranking[]`, and `recommendation` (AI text or deterministic fallback with structured recommendations).

**Credit card example:**

```bash
curl -X POST "$API_BASE/compare" \
  -H "Content-Type: application/json" \
  -d '{
    "category": "credit-cards",
    "criteria": {
      "monthlySpend": 1500,
      "foreignSpendPercent": 30,
      "riskTolerance": "medium"
    }
  }'
```

### `GET /recommendations`

```bash
# Free-text criteria
curl "$API_BASE/recommendations?category=savings&criteria=How%20do%20savings%20rates%20compare%20to%20inflation%3F"

# JSON criteria
curl "$API_BASE/recommendations?category=mortgages&criteria=%7B%22riskTolerance%22%3A%22low%22%2C%22horizonMonths%22%3A24%7D"

# Disable AI (rules-only mode)
curl "$API_BASE/recommendations?category=savings&includeAi=false"
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | **Yes (AI mode)** | — | Free key at https://aistudio.google.com |
| `CACHE_PROVIDER` | No | `memory` | `dynamodb` in AWS, `memory` locally |
| `CACHE_TABLE_NAME` | No | `financial-products-cache` | DynamoDB table name |
| `CACHE_TTL_SECONDS` | No | `3600` | Cache TTL seconds (60–86400) |
| `ALLOWED_ORIGINS` | No | `*` | Comma-separated CORS origins |
| `ENABLE_EXCHANGE_DATA` | No | `false` | Enable GBP FX enrichment for credit cards |
| `EXCHANGE_RATE_API_KEY` | No | — | Optional key for exchangerate.host |
| `BOE_BASE_URL` | No | `https://www.bankofengland.co.uk` | BoE base URL |
| `ONS_BASE_URL` | No | `https://www.ons.gov.uk` | ONS base — **not** the retired `api.ons.gov.uk` |
| `GEMINI_BASE_URL` | No | `https://generativelanguage.googleapis.com` | Gemini API base |
| `GEMINI_MODEL` | No | `gemini-2.0-flash` | Gemini model name |
| `REQUEST_TIMEOUT_MS` | No | `5000` | Per-request timeout ms |
| `RETRY_ATTEMPTS` | No | `2` | Transient retry count |
| `RETRY_BASE_DELAY_MS` | No | `250` | Retry base delay (exponential backoff + jitter) |
| `LOG_LEVEL` | No | `info` | `debug` / `info` / `warn` / `error` |

---

## Local Development

### Prerequisites

- **Node.js 20+** (Lambda runtime is Node.js 24.x in AWS)
- **Gemini API key** — free at https://aistudio.google.com (no credit card required)
- **AWS SAM CLI + Docker** — only needed for `sam local` or `sam build`; the Docker-free path below works without either

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env templates
cp .env.local.example .env.local                   # Linux / macOS
cp sam.local.env.example.json sam.local.env.json

# Windows PowerShell:
Copy-Item .env.local.example .env.local
Copy-Item sam.local.env.example.json sam.local.env.json

# 3. Add your Gemini key to sam.local.env.json:
#    "GEMINI_API_KEY": "YOUR_KEY_HERE"
```

### Running locally — Docker-free (recommended for first run)

No Docker or SAM CLI required. The Lambda handler is imported directly by a thin Node HTTP wrapper.

```bash
# One command: starts API on :3000 and dashboard on :8090
npm run run:flow
```

Open **http://localhost:8090** — the API BASE URL field is pre-filled to `http://127.0.0.1:3000`.

Or start the two servers in separate terminals:

```bash
# Terminal 1 — API (Lambda handler, no Docker)
npm run start:api        # http://127.0.0.1:3000

# Terminal 2 — Dashboard
npm run start:frontend   # http://localhost:8080
```

### Running locally — with Docker + SAM CLI

```bash
sam build --use-container
sam local start-api --env-vars sam.local.env.json   # API on :3000
npm run start:frontend                              # Dashboard on :8080
```

### Other useful commands

```bash
# Run all 7 unit test suites (no network, no Docker required)
npm test

# Verify all live external APIs respond correctly (requires internet)
node scripts/smoke-live-apis.mjs

# Invoke Lambda events directly (requires Docker + sam build first)
sam local invoke ApiFunction -e events/get-products-mortgages.json
sam local invoke ApiFunction -e events/post-compare-mortgages.json
sam local invoke ApiFunction -e events/get-recommendations.json
```

---

## Deployment to AWS

```bash
# Uses deploy-prod.ps1 — validates template, builds, deploys
npm run deploy:prod

# With a named AWS profile:
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-prod.ps1 -AwsProfile your-profile
```

**Manual deploy:**

```bash
sam build --use-container

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
    AllowedOrigins="*" \
    CorsAllowOrigin="*" \
    CacheTtlSeconds=3600 \
    EnableExchangeData=false \
    CacheTableName=uk-financial-products-comparison-prod-cache
```

After deploy, copy the `ApiBaseUrl` from CloudFormation outputs and paste it into the dashboard.

**Frontend hosting** — upload the `frontend/` directory to an S3 bucket with static website hosting or serve via CloudFront.

---

## Testing

```bash
npm test
```

| Suite | Coverage |
|-------|----------|
| `boeClient` | CSV parsing, "31 Jan 2025" date format, missing values (`.`), empty CSV, empty series codes |
| `onsClient` | ONS generator CSV, monthly/annual/quarterly rows, metadata skipping, empty input |
| `comparisonService` | Mortgage risk scoring, savings real-return weighting, credit card total-cost model |
| `marketDataService` | Full data pipeline with mocks, cache hit/miss semantics, real-return calculation, FX snapshot |
| `httpSecurity` | CORS origin allowlist, security headers, error sanitisation, body size limit, XSS-safe responses |
| `retry` | Exponential backoff, max-attempts enforcement, `shouldRetry` predicate |
| `validator` | Input validation, category guard, criteria normalisation, JSON/text criteria parsing |

---

## Security Controls

| Control | Implementation |
|---------|----------------|
| **API key not in URL** | Gemini key sent via `x-goog-api-key` header — never appears in CloudWatch access logs |
| **No stack traces to clients** | `errorResponse()` sanitises all non-`ValidationError` messages to generic strings |
| **Body size limit** | `parseJsonBody` rejects payloads > 50 KB before JSON.parse |
| **Prompt injection mitigation** | User free-text stripped of control characters, capped at 300 chars, injected after system instructions |
| **XSS prevention** | All API data passed through `escHtml()` before any DOM insertion |
| **CORS allowlist** | Non-allowlisted origins receive `Access-Control-Allow-Origin: null` |
| **Security headers** | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `CSP: default-src 'none'`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer` |
| **DynamoDB encryption** | `SSEEnabled: true` in CloudFormation |
| **DynamoDB PITR** | `PointInTimeRecoveryEnabled: true` |
| **IAM least-privilege** | `DynamoDBCrudPolicy` scoped to the single cache table |
| **Reserved concurrency** | Lambda capped at 10 concurrent executions to prevent runaway costs |
| **AI fallback** | Gemini failure → deterministic rule-based recommendation (no silent null response) |

---

## Leadership & Architecture

### 1. Trade-offs

**Single Lambda vs per-route Lambdas** — one Lambda with explicit route dispatch keeps cold-start variance uniform, shares a warm DynamoDB connection pool, and produces one deployment artefact. The trade-off is that a CPU-heavy route could theoretically delay others under high concurrency, mitigated by the reserved concurrency cap and 15-second timeout.

**In-memory cache locally / DynamoDB in AWS** — the `cacheFactory` pattern lets the same code run locally without Docker-DynamoDB while using encrypted, TTL-managed DynamoDB in production. Local cache does not survive cold starts, which is acceptable in dev but irrelevant in production where Lambda instances are long-lived.

**ONS website generator instead of the retired API** — `api.ons.gov.uk` was decommissioned on 25 November 2024. The `ons.gov.uk/generator?format=csv` endpoint serves the same underlying dataset. Trade-off: the CSV format is less structured (mixed metadata + data rows) and requires more defensive parsing, but it is the only zero-auth public inflation source.

**Gemini key in header, not query param** — prevents the key appearing in CloudWatch access logs, load-balancer logs, and browser network tab. Zero performance trade-off. Google's Gemini API fully supports the `x-goog-api-key` header.

**Plain JS frontend with Chart.js CDN** — no build pipeline means the dashboard deploys as static files to any CDN with no CI step. Trade-off: no component reactivity; state is managed imperatively. Acceptable for a comparison tool with a small, well-defined interaction surface.

**Frankfurter as FX source** — free, no registration, ECB-backed data, and serves as the fallback when exchangerate.host is unavailable. Trade-off: rates are end-of-day ECB reference rates, not real-time mid-market.

### 2. Team Planning — 3 developers, 2 weeks

```
Days 1–3   Dev A │ IaC (SAM template, DynamoDB, IAM), Lambda skeleton, CI pipeline skeleton
           Dev B │ BoE + ONS adapters, CSV/date normalisation, unit tests (boeClient, onsClient)
           Dev C │ API contract + Postman collection, frontend scaffold, tab navigation

Days 4–7   Dev A │ Caching layer (DynamoDB + in-memory factory), retry/timeout strategy, CloudWatch alarms
           Dev B │ Gemini integration, prompt engineering, deterministic fallback, AI output tests
           Dev C │ Products table, Chart.js trend visualisation, compare/recommend flow

Days 8–11  Dev A │ Prod deploy + WAF rule + usage plan + synthetic canary
           Dev B │ AI evaluation harness, prompt hardening, data-freshness monitor
           Dev C │ Accessibility pass (ARIA), responsive layout, cross-browser QA

Days 12–14 All   │ Dress rehearsal (deploy from clean clone), README, demo recording, interview prep
```

Shared: daily 15-min standup, mandatory PR review (1 approver), feature flags for anything touching the Gemini prompt.

### 3. Production Readiness — What to add before go-live

- **Auth** — AWS Cognito user pool + JWT authorizer on API Gateway; per-user rate limits via usage plans
- **WAF** — AWS WAF rate-based rule + OWASP managed rule group on the API Gateway stage
- **Secrets management** — move Gemini key from Lambda env var to AWS Secrets Manager; fetch at cold start with caching
- **Observability** — X-Ray tracing with correlation IDs propagated to all downstream calls; CloudWatch Logs Insights dashboards for error rates and latency percentiles
- **Alerting** — CloudWatch alarms on Lambda error rate > 1%, P99 duration > 10 s, DynamoDB throttle count > 0
- **Contract tests** — Pact consumer-driven contract tests against BoE/ONS to detect upstream API schema drift before it causes silent data quality issues
- **Synthetic canary** — CloudWatch Synthetics canary running every 5 min against `/products/mortgages` in production
- **CI/CD** — GitHub Actions: lint → unit test → SAM build → integration test in staging → prod deploy on merge to `main`
- **Data freshness monitor** — scheduled Lambda that alerts if the latest BoE series date is > 45 days old
- **DPIA** — document that user-entered free text passes through Gemini; no PII is persisted, but this must be in the privacy notice

### 4. What I would build next

- **Personalised eligibility filtering** — integrate FCA Register API to surface only FCA-authorised products matching a user-supplied credit profile
- **Historical backtesting** — "If you had fixed 2 years ago vs stayed variable, what would you have paid?" — turns raw trend data into a concrete decision-support narrative
- **Rate alert subscriptions** — SQS + Lambda + SES: user sets a threshold, receives email when the BoE rate crosses it
- **Prompt versioning and evaluation** — store prompt versions in DynamoDB; A/B test Gemini outputs against human-rated ground truth to measure recommendation quality over time
- **Multi-region active-active** — DynamoDB global tables + Route 53 latency routing for UK/EU availability SLA

---

## Troubleshooting

| Symptom | Cause & Fix |
|---------|-------------|
| `recommendation.mode = "rules-fallback"` | Gemini API unavailable or quota exhausted. Check `GEMINI_API_KEY` in `sam.local.env.json`; check quota at https://aistudio.google.com |
| `sam` command not found on Windows | Use full path: `C:\Users\<you>\AppData\Local\Programs\Amazon\AWSSAMCLI\bin\sam.cmd` |
| ONS data missing / empty | `ONS_BASE_URL` must be `https://www.ons.gov.uk` — the old `https://api.ons.gov.uk` was decommissioned Nov 2024 |
| Credit card APR always `null` | Series code must be `IUMCCTL` — `HSDG` is not a valid BoE series and returns HTML |
| Lambda timeout in local mode | Increase `REQUEST_TIMEOUT_MS` in `sam.local.env.json`, or run `sam local start-api --warm-containers EAGER` |
| AWS deploy fails — credentials error | Run `aws configure` or export `AWS_PROFILE` before deploying |
| `NODE_TLS_REJECT_UNAUTHORIZED` warning in smoke script | Expected in some corporate/proxy environments; does not affect the Lambda or production deployment |

---

*This is an informational comparison tool. It does not constitute regulated financial advice under the Financial Services and Markets Act 2000 (FSMA). Always verify rates, eligibility, total costs, and terms directly with FCA-authorised providers before making any financial decision.*
