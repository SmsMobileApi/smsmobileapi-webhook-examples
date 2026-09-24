# SMSMobileAPI Webhook V2 examples

Production-oriented examples for receiving signed SMSMobileAPI events from real connected mobile phones.

SMSMobileAPI turns a phone with its SIM and existing number into a programmable communication endpoint. Webhook V2 delivers SMS, call, WhatsApp and e-mail activity to your HTTPS application as structured JSON—without a polling loop.

> **Start here:** create an account, connect a mobile, then configure a destination in the [Webhook V2 dashboard](https://dashboard.smsmobileapi.com/webhook-v2/).

## What is included

- Signature verification using the exact raw request body.
- Timestamp validation to reduce replay risk.
- Constant-time signature comparison.
- Idempotency handling for at-least-once delivery.
- Examples in PHP, Python and Node.js.
- Realistic fixtures for SMS, calls and WhatsApp.
- Guidance for retries, fast acknowledgements and secret rotation.

## Event catalogue

| Channel | Events |
| --- | --- |
| SMS | `sms.api.submitted`, `sms.sent`, `sms.failed`, `sms.received`, `sms.mobile.sent` |
| Calls | `call.missed`, `call.incoming`, `call.outgoing` |
| WhatsApp | `whatsapp.submitted`, `whatsapp.sent`, `whatsapp.failed`, `whatsapp.received`, `whatsapp.voice.transcribed` |
| E-mail | `email.sent`, `email.received` |

## Delivery contract

Every delivery is an HTTPS `POST` with `Content-Type: application/json`.

| Header | Purpose |
| --- | --- |
| `X-SMSMobileAPI-Event` | Event type, for example `sms.received`. |
| `X-SMSMobileAPI-Event-ID` | Stable event UUID. |
| `X-SMSMobileAPI-Delivery` | Delivery identifier for this destination. |
| `X-SMSMobileAPI-Timestamp` | Unix timestamp used to sign the request. |
| `X-SMSMobileAPI-Signature` | `v1=` followed by the HMAC-SHA256 signature. |
| `Idempotency-Key` | Stable event UUID to deduplicate retries. |

The signature is calculated as:

```text
v1=HMAC_SHA256(signing_secret, timestamp + "." + raw_request_body)
```

The JSON envelope is consistent across channels:

```json
{
  "id": "8e9a1207-e3a4-4550-a4af-3dad6cff5108",
  "type": "sms.received",
  "api_version": "2026-09-22",
  "created_at": "2026-09-23T12:00:01Z",
  "occurred_at": "2026-09-23T12:00:00Z",
  "data": {
    "guid": "SMS-GUID-1001",
    "from": "+15551234567",
    "message": "Can you call me back?",
    "received_at": "2026-09-23T12:00:00Z",
    "alias": "Taylor",
    "device_id": "office-phone-1"
  }
}
```

## Run an example locally

Set the signing secret displayed when you create the webhook destination:

```bash
export SMSMOBILEAPI_WEBHOOK_SECRET="replace-with-your-signing-secret"
```

### PHP 8+

```bash
php -S 127.0.0.1:8080 examples/php
```

### Python 3.10+

```bash
python examples/python/server.py
```

### Node.js 18+

```bash
node examples/node/server.mjs
```

For dashboard testing, expose the local port through a trusted HTTPS development tunnel. Never expose a production signing secret in a URL, front-end bundle or repository.

## Correct production flow

1. Accept only HTTPS `POST` requests.
2. Read the raw body before parsing JSON.
3. Reject missing or stale timestamps.
4. Calculate and compare the signature in constant time.
5. Validate the envelope and supported event type.
6. Insert the event `id` into a table with a unique constraint.
7. Return HTTP `2xx` as soon as the event is durably accepted.
8. Perform CRM, AI, notification or business processing asynchronously.

Webhook V2 uses **at-least-once delivery**. Your endpoint must expect a retry and treat the event ID or `Idempotency-Key` as unique.

## Response and retry behavior

- Return `200`, `202` or another `2xx` response after safe acceptance.
- A timeout, network error or non-`2xx` status may be retried.
- Do not perform slow third-party calls before acknowledging the event.
- A destination with sustained failures can be automatically paused to protect the delivery queue.
- Use the dashboard delivery log to inspect attempts, response time and error excerpts.

## Secret rotation

Webhook V2 supports rotation without an immediate interruption. During the transition, your endpoint may receive both `X-SMSMobileAPI-Signature` for the current secret and `X-SMSMobileAPI-Signature-Next` for the next secret.

Deploy support for the new secret before its activation time, then remove the previous secret after the overlap period.

## Repository map

```text
examples/
  node/server.mjs      Dependency-free Node.js receiver
  php/index.php        PHP receiver
  python/server.py     Dependency-free Python receiver
fixtures/events/       Realistic payloads for local tests
SECURITY.md            Security checklist and disclosure guidance
```

## Useful links

- [Webhook V2 overview](https://smsmobileapi.com/webhook/)
- [Webhook V2 dashboard](https://dashboard.smsmobileapi.com/webhook-v2/)
- [API documentation](https://smsmobileapi.com/documentations-api-smsmobileapi/)
- [Create an SMSMobileAPI account](https://smsmobileapi.com/signup/)

## Support and contributions

Questions and improvements are welcome through GitHub Issues. Never include API keys, webhook signing secrets, phone numbers, message bodies or customer data in a public issue.

Released under the MIT License.
