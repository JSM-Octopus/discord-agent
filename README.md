# octopus-notifier

## Sandbox (local run)

Deployment injects env via docker-compose (jsm-infra); plain `npm start`
does NOT load `.env`. For local runs use:

```bash
npm run sandbox                  # rabbit canister from .env (test canister)
npm run sandbox -- <canister-id> # any canister (e.g. production)
```

The sandbox entry loads `.env` before the app starts. Recommended local
`.env` extras: `PIGEON_CONSOLE_ONLY=true` (no real emails/phone calls;
makes all PIGEON_* credentials unnecessary) and NO `HEARTBEAT_URL`/
`HEARTBEAT_PASSWORD` — without them the heartbeat loop is skipped.
