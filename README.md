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

Configure το Retell webhook URL στο dashboard σου προς το endpoint της εφαρμογής.
