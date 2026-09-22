# VNS Analytics

SaaS technical analysis product based on **VNS Theory** (see `RULEBOOK.md`).

## Stack

- **Frontend:** Next.js + TradingView Lightweight Charts (multi-timeframe switcher)
- **Backend:** FastAPI + VNS rule engine
- **Data:** Upstox historical/LTP → PostgreSQL
- **Jobs:** Redis-backed sync worker (interval from env)
- **Packages:** Trial / Basic / Pro / Premium (entitlements; billing later)

## Quick start

1. Copy env and add Upstox credentials:

```bash
cp .env.example .env
# fill UPSTOX_API_KEY, UPSTOX_API_SECRET, UPSTOX_ACCESS_TOKEN
```

2. Start everything:

```bash
docker compose up --build
```

3. Open:
- App: http://localhost:3000
- API docs: http://localhost:8000/docs
- Default admin: `admin@vns.app` / `admin12345`

4. On the dashboard, pick a Nifty 50 script → **Sync + Analyze**.

## Current scope

- Nifty 50 equities only
- Daily VNS marks primary; chart TF switcher for day / week / 30m
- DT/DB uses absolute + percent tolerance (never exact float equality)

## Security note

Do not commit `UpStox.txt` or `.env`. Rotate any token that was shared in plaintext.
