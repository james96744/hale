# Relay101

Local-first Solana intel + telemetry backend with a realtime control dashboard.

## What is now wired

- Supervisor-managed services:
  - `telemetryHub`
  - `pumpfunWatcher` (demo stream)
  - `raydiumWatcher` (demo stream)
  - `txEnricherJob`
  - `coinAssessmentJob`
  - `securitySentinel` (24/7 runtime security checks)
- Hardened auth middleware:
  - constant-time token compare
  - per-IP abuse tracking
  - temporary IP blocking on brute-force patterns
- Realtime dashboard at `/`:
  - KPIs
  - service status/heartbeat
  - candidate stream
  - latest assessment
  - recent events
  - security alerts

## Quick start

```bash
cp .env.example .env
# set AUTH_TOKEN and Solana RPC endpoints

npm i
npm run dev
```

Open [http://127.0.0.1:8787/](http://127.0.0.1:8787/) and enter your `AUTH_TOKEN`.

## REST API

Auth header for protected routes:

`Authorization: Bearer <AUTH_TOKEN>`

- `GET  /api/health` (public)
- `GET  /api/state`
- `GET  /api/security`
- `POST /api/start`
- `POST /api/stop`
- `GET  /api/debug/ringbuffer`

## WebSocket telemetry

Endpoint:

`ws://127.0.0.1:8787/ws/telemetry?token=<AUTH_TOKEN>`

Message types:

- `analytics`
- `vitals`
- `candidates`
- `events`
- `assessment`
- `system_status`
- `security_alert`
- `rug_assessment`
- `rug_alert`

## Important notes

- Watchers are still demo/stub loops for data flow testing.
- `securitySentinel` can auto-pause the runtime when critical alerts fire (`SECURITY_AUTO_PAUSE_ON_CRITICAL=true`).
- Keep `AUTH_TOKEN` non-default before exposing host/network access.
