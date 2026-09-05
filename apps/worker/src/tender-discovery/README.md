# Tender discovery connectors

Official portals are registered by migration `0025_india_tender_discovery.sql`. Migration `0026_enable_official_tender_connectors.sql` enables the two verified built-in sources:

- `gem` reads GeM's public all-bids JSON endpoint. Frequent head refreshes are separated from paced, bounded deadline-window backfill runs so new notices stay fresh while the active catalog is filled.
- `cppp` reads the ten notices in CPPP's public latest-tenders window. It is intentionally marked `LATEST_PUBLIC_WINDOW`; CPPP's complete active-tender search remains outside this connector because it requires CAPTCHA interaction.

The remaining registered portals stay disabled until their public access mechanism and terms are verified. A healthy source means its configured scope is fresh, not that TENDYY has complete India-wide coverage.

Set `TENDER_DISCOVERY_FEEDS_JSON` in the worker environment to a JSON object keyed by portal key:

```json
{"gem":"https://approved-feed.example/gem","cppp":"https://approved-feed.example/cppp"}
```

Each endpoint returns normalized JSON:

```json
{"items":[{"sourceNoticeKey":"GEM/2026/B/123","title":"Supply of equipment","sourceUrl":"https://official.example/123","status":"ACTIVE"}],"nextCursor":null}
```

Configured feeds override a built-in connector. Only official or contractually licensed feed URLs should be configured. New HTML portal adapters must be explicit, fixture-tested connectors added after access and terms are verified.

## Operations

Apply migrations before starting the worker. Platform access is granted explicitly and is never implied by an organization role:

```bash
bun --env-file=../../.env run db:platform-admin grant operator@example.com
```

The registered GePNIC state portals and DEFPROC passed the public latest-window canary on 2026-09-06 and are marked verified but remain disabled until a platform administrator activates them. Their scope is ten recently published notices, not each portal's CAPTCHA-gated full catalog. IREPS and custom portals still require a verified official feed or adapter before activation.
