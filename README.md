# VECTOR 1.2.0 - Next.js 14 Scaffold

Initial `develop` scaffold for the VECTOR restart.

## Local gates
1. Copy `.env.example` to `.env.local` and add only local/staging credentials.
2. `npm install`
3. `npm run typecheck`
4. `npm run lint`
5. `npm test`
6. `npm run build`

## Safety
- `CITIZEN_ID_ENABLED=false` is the initial default.
- Never commit `.env.local` or server secrets.
- Database migrations are not executed by this scaffold.
- Production promotion is blocked until PreFlight and RC pass.
