UPDATE "tender_notices" AS n
SET
  "source_url" = 'https://eprocure.gov.in/eprocure/app?service=restart',
  "metadata" = n."metadata" || '{"navigation":"SEARCH_BY_REFERENCE"}'::jsonb,
  "updated_at" = now()
WHERE EXISTS (
  SELECT 1
  FROM "tender_notice_sources" AS s
  INNER JOIN "tender_portals" AS p ON p."id" = s."portal_id"
  WHERE s."notice_id" = n."id" AND p."key" = 'cppp'
);--> statement-breakpoint

UPDATE "tender_notice_sources" AS s
SET "source_url" = 'https://eprocure.gov.in/eprocure/app?service=restart'
FROM "tender_portals" AS p
WHERE p."id" = s."portal_id" AND p."key" = 'cppp';--> statement-breakpoint

UPDATE "tender_notice_documents" AS d
SET
  "name" = 'Open CPPP and search by reference',
  "url" = 'https://eprocure.gov.in/eprocure/app?service=restart',
  "access" = 'EXTERNAL',
  "updated_at" = now()
FROM "tender_portals" AS p
WHERE p."id" = d."portal_id" AND p."key" = 'cppp';
