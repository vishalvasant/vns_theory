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

4. Sign in:
   - Users land on **Today** (`/today`) — daily Teji/Mandi/DT/DB board
   - Admins land on **Admin** (`/admin`) — users + sync ops
   - Default admin: `admin@vns.app` / `admin12345`

5. On Today, filter the board → click a script → read chart + next move.

## Current scope

- Nifty 50 equities only
- Chart TF switcher: 15m / 30m / 1h / 4h / day / week / month (Upstox v3 candles)
- DT/DB uses absolute + percent tolerance (never exact float equality)

## Security note

Do not commit `UpStox.txt` or `.env`. Rotate any token that was shared in plaintext.
