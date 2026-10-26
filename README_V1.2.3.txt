SC Group Crafting V1.2.3 - SCMDB Snapshot Build

Upload/replace:
- app.js
- sw.js
- styles.css (provided merged)

The existing data/scmdb folder remains managed by GitHub Actions.
No new Supabase migration is required for the LIVE/PTU selector and SCMDB read-only data source.
COUNT inventory is recognized in the UI, but native database reservation/accounting for COUNT will be handled in a later migration before project reservations are enabled.
