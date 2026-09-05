# Tender discovery connectors

Official portals are registered by migration `0025_india_tender_discovery.sql` but remain disabled until a verified feed is configured. This prevents an unverified HTML scraper from being mistaken for production coverage.

Set `TENDER_DISCOVERY_FEEDS_JSON` in the worker environment to a JSON object keyed by portal key:

```json
{"gem":"https://approved-feed.example/gem","cppp":"https://approved-feed.example/cppp"}
```

Each endpoint returns normalized JSON:

```json
{"items":[{"sourceNoticeKey":"GEM/2026/B/123","title":"Supply of equipment","sourceUrl":"https://official.example/123","status":"ACTIVE"}],"nextCursor":null}
```

Only official or contractually licensed feed URLs should be configured. HTML portal adapters must be added as explicit, fixture-tested connectors after access and terms are verified.
