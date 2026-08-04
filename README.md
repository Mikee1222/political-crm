# Political CRM (Next.js + Supabase)

Πλήρης full-stack εφαρμογή πολιτικού CRM με:

- Next.js 14 (App Router)
- Supabase (Auth + Postgres)
- Tailwind CSS
- TypeScript
- Retell AI integration (outbound calls + webhook updates)

## Setup

1. Εγκατάσταση:

```bash
npm install
```

2. Δημιούργησε `.env.local` από το `.env.example` και συμπλήρωσε:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (ρόλος διακομιστή — για admin APIs)
- `NEXT_PUBLIC_APP_URL` — βάση **CRM** (production: `https://crm.kkaragkounis.com`)
- `NEXT_PUBLIC_PORTAL_URL` — βάση **portal πολιτών** (production: `https://kkaragkounis.com`; αν κενό, χρησιμοποιείται το CRM URL)
- `RETELL_API_KEY`, `RETELL_AGENT_ID`, `RETELL_FROM_NUMBER`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (ίδιο URL με το Google Cloud Console — production: `https://crm.kkaragkounis.com/api/auth/google/callback`)

3. Τρέξε το SQL schema στο Supabase SQL Editor:

- `supabase/schema.sql`

4. Run app:

```bash
npm run dev
```

## Routes

- `/login` — σύνδεση
- `/dashboard` — στατιστικά (Manager+)
- `/contacts` — επαφές (Καλείς: ανάγνωση + κατάσταση κλήσης)
- `/requests`, `/tasks`, `/campaigns` — αιτήματα, εργασίες, καμπάνιες (Manager+)
- `/schedule` — Google Calendar, πρόγραμμα (Manager+)
- `/settings` — ρυθμίσεις, χρήστες, OAuth (μόνο Admin)

## Retell Endpoints

- Trigger outbound call: `POST /api/retell/call`
- Retell webhook: `POST /api/retell/webhook`
- Production webhook URL: `https://crm.kkaragkounis.com/api/retell/webhook?token=<RETELL_WEBHOOK_TOKEN>`

Configure this URL in the Retell dashboard (account or agent webhook). Session auth is bypassed for `/api/retell/webhook` and `/api/retell/llm`. Primary auth is a shared URL token (`RETELL_WEBHOOK_TOKEN` — generate with `openssl rand -hex 16`); when set, a missing/wrong `?token=` returns 401. When unset, the handler warns and allows (dev). Optional HMAC via `RETELL_WEBHOOK_SECRET` only if you set it explicitly (Retell has no signing secret). A body like `{"event":"test"}` returns 200 after the URL token check (optional HMAC skipped).
