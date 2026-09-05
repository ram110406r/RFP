# Tender discovery connectors

Official portals are registered by migration `0025_india_tender_discovery.sql`. Migration `0026_enable_official_tender_connectors.sql` enables the two verified built-in sources:

- `gem` reads GeM's public all-bids JSON endpoint. It uses a paced, resumable page cursor so the complete active catalog can be backfilled across runs.
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
