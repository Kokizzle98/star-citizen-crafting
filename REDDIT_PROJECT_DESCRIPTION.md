# Draft A – Technical / transparent

**I’m building a free Star Citizen group crafting tracker + Fabricator PWA**

I’ve been building a small private web app for my Star Citizen group because we kept losing track of who was storing which high-quality materials, where those materials were located, and which combination would give us the best result for a planned craft.

The project has grown into a PWA with a shared inventory and a Fabricator-inspired calculation layer. The current direction is strongly inspired by the way SCMDB presents crafting information, while adding group inventory planning on top.

Current features:
- shared group material inventory
- material quality from Q0–Q1000
- SCU / cSCU / mSCU / µSCU handling
- separate COUNT handling for materials that are used as pieces rather than cargo volume
- LIVE / PTU dataset selection
- SCMDB reference-data mirror synced through GitHub Actions
- Blueprint browser
- SMART / MAX / SAVE PREMIUM / MANUAL crafting strategies
- weighted quality when multiple material batches are mixed
- Product Stats shown as Base -> Crafted -> Delta
- per-slot quality effects and active modifier ranges
- PWA, so it can run in the browser or be installed like an app

The current engineering focus is making the Fabricator calculation match the underlying crafting data closely, including segmented quality thresholds and multiple recipe slots affecting the same final stat.

This is primarily a private hobby project for a small group, not an official CIG or SCMDB product. The data layer is designed so the app can update its reference data without manually re-entering thousands of blueprints and items.

I’d be interested in feedback especially from players who are already doing high-quality crafting: What information would you want to see immediately when choosing materials for a craft?

---

# Draft B – Community / concise

**Built a Star Citizen group crafting terminal because spreadsheets got out of hand**

A few friends and I farm high-quality crafting materials, and the hardest part quickly became inventory management: who has what, where is it stored, what quality is it, and what should we actually use for the next craft?

So I started building a free PWA that combines a shared material inventory with a Fabricator-style crafting calculator.

The idea is simple:
1. Everyone records material, amount, quality and location.
2. Pick a blueprint.
3. Choose SMART, MAX, SAVE PREMIUM or MANUAL.
4. The app evaluates available group stock and shows the projected component stats and each slot’s contribution.

It also supports LIVE/PTU reference datasets, cargo-volume and piece-count materials, and weighted quality when batches are mixed.

The UI is intentionally very close to a Star Citizen terminal, while the crafting presentation is heavily inspired by the clarity of SCMDB’s Fabricator.

Still very much a work in progress, but the shared inventory and data pipeline are already working. Next up is deeper stat validation and then project/reservation management.

What would you want from a group crafting tracker that existing tools don’t cover?
