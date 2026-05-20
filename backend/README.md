# DeFiGate Backend Scaffold (Kotani + Privy)
This scaffold contains a minimal Node.js + Express backend and a Netlify-ready frontend snippet to demonstrate the DeFiGate flow using Kotani (on/off-ramp) and Privy (embedded wallets).

## What's included
- `server.js` — Express app wiring routes
- `routes/` & `controllers/` — Mento/Kotani and Privy placeholders
- `migrations/001_create_tables.sql` — Minimal Postgres schema
- `worker/processor.js` — background worker stub for processing crypto jobs
- `frontend/netlify_buy_form/index.html` — simple buy form you can host on Netlify
- `.env.example` — environment variables template
- Logo (already uploaded by you) path: /mnt/data/A_digital_vector_graphic_features_the_logo_for_"De.png
  (use this path to copy into your project assets)

## Quickstart (local)
1. Copy `.env.example` to `.env` and fill in secrets (Kotani, Privy, FRONTEND_URL).
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a local Postgres user and database if you are running locally:
   ```bash
   sudo -u postgres psql -c "CREATE ROLE defigate_user LOGIN PASSWORD 'Admin123';"
   sudo -u postgres psql -c "CREATE DATABASE defigate_db OWNER defigate_user;"
   ```
4. Update `.env` to use the local URL:
   ```bash
   DATABASE_URL=postgresql://defigate_user:Admin123@localhost:5432/defigate_db
   ```
5. Run DB migrations or initialize the schema with your preferred method.
6. Start server:
   ```bash
   npm start
   ```

For local Supabase-backed development, set `USE_SUPABASE_CLIENT=true` and run:
```bash
USE_SUPABASE_CLIENT=true npm run dev
```

Production checklist
- Ensure you set the following env vars in your deployment environment (Render/Heroku/VPS):
   - `SUPABASE_DATABASE_URL` (or `DATABASE_URL`)
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `JWT_SECRET`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `KOTANI_API_KEY` as needed
- Use `npm run start:prod` to start the server in production. A `Procfile` is provided for platforms that use it.
- For safety, migrations run only when `AUTO_RUN_MIGRATIONS=true`.

## Remote fallback
If local Postgres is unavailable, you can start the backend against a remote database by overriding `DATABASE_URL` or `SUPABASE_DATABASE_URL` when launching the server:
```bash
SUPABASE_DATABASE_URL="postgresql://postgres.lkceqrnarofwigtoiapv:wqVp6EzMPIjbUOEU@aws-0-eu-west-1.pooler.supabase.com:5432/postgres" npm start
```
For production, use the new `start:prod` script:
```bash
SUPABASE_DATABASE_URL="postgresql://..." npm run start:prod
```

## Notes
- `backend/config/database.js` now supports `SUPABASE_DATABASE_URL`, `DATABASE_URL`, or `LOCAL_DATABASE_URL`.
- `backend/config/supabase.js` also supports backend server-side use of `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
- Local DB connections to `localhost` will use no SSL, while remote DB URLs will use SSL with `rejectUnauthorized: false`.
- Keep credentials out of source control and do not commit your `.env` file.

## Kotani notes
- Kotani provides On-Ramp & Off-Ramp APIs. Refer to https://docs.kotanipay.com for complete API references, sandbox base URL, and webhook signing details.
- Typical flow: create onramp/deposit -> Kotani collects fiat -> mints/sends stablecoins to the specified recipient wallet -> Kotani calls your webhook when done.

## Next steps I can implement for you immediately
1. Wire the Kotani endpoints with fully accurate request/response fields (I can update the controllers using Kotani sandbox examples). I will need your Kotani sandbox API key and webhook secret.
2. Implement DB layer (Knex/TypeORM) and worker using BullMQ to process jobs reliably.
3. Implement Privy full integration with a client page to show wallet creation & balances.

Tell me which of the above you'd like next.
