# Production Deployment Checklist

## 1) Security

- Rotate `GEMINI_API_KEY` before go-live and store securely.
- Configure `ALLOWED_ORIGINS` and `CorsAllowOrigin` to real frontend domains (avoid `*` in prod).
- Enable AWS account-level CloudTrail and security alerts.
- Verify no secrets are committed (`rg -n "AIza|GEMINI_API_KEY"`).

## 2) Reliability

- Confirm `sam validate --lint` passes.
- Run `npm test` and `npm run smoke:local`.
- Verify Lambda timeout/memory settings under expected payload size.
- Confirm fallback behavior when external APIs fail (BoE/ONS/Gemini).

## 3) AWS Infrastructure

- Deploy with `npm run deploy:prod`.
- Confirm stack status in CloudFormation is `CREATE_COMPLETE` or `UPDATE_COMPLETE`.
- Verify DynamoDB TTL is enabled (`expiresAt`).
- Check API Gateway stage and invoke URL output.

## 4) Observability

- Check CloudWatch logs for first live invocations.
- Add alarms for Lambda `Errors`, `Throttles`, and high `Duration`.
- Add alarm for API Gateway `5XXError`.

## 5) Post-Deploy Functional Checks

- `GET /products/mortgages` returns products and trend data.
- `POST /compare` returns ranking and recommendation payload.
- `GET /recommendations` returns recommendation payload.
- Frontend loads, reads API URL, renders table + chart + insights.

## 6) Fintech Readiness Notes

- Keep recommendation language informational (non-advisory).
- Keep assumptions transparent (proxy rates, benchmark logic).
- Validate data freshness and source availability windows.
- Add stronger audit trail and auth (Cognito) before production-scale use.

