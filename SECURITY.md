# Security policy

## Before deploying

- Terminate TLS with a valid public certificate.
- Keep the webhook signing secret in a secret manager or protected environment variable.
- Verify the signature against the exact raw body before JSON parsing.
- Reject stale timestamps; the examples use a five-minute tolerance.
- Deduplicate the stable event ID with a database unique constraint.
- Apply request-size, rate and execution-time limits.
- Avoid logging message bodies, phone numbers or signatures unless strictly required and protected.
- Acknowledge quickly and process business logic asynchronously.

## Reporting a vulnerability

Do not open a public issue containing exploit details, credentials or customer data. Contact the SMSMobileAPI team through the support channel at [smsmobileapi.com](https://smsmobileapi.com/).
