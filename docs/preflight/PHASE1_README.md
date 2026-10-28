# VECTOR PreFlight Phase 1 - 1.2.0

Integrates the application-side Identity, Account, SYSTEM_ADMIN authorization, OAuth callback and signout baseline from VECTOR_PREFLIGHT_V1 into the already-green Next.js scaffold.

## Preserve from green scaffold
- middleware.ts
- lib/supabase/server.ts
- lib/supabase/admin.ts
- package.json / package-lock.json
- .env.example with CITIZEN_ID_ENABLED=false

## After upload
1. Merge HeaderAccountMenu into the existing AppHeader only after authentication routes compile.
2. Run scaffold CI again.
3. Do not run SQL on production. Database migrations are a separate staging gate.
