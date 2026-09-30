# Canonical Product Domain

Tender is the active product domain.

In TENDYY, a tender is the discovery opportunity, the application workspace,
the answer/evidence/review surface, the automation run target, and the package
generation context.

Legacy RFP is migration compatibility only. The `apps/api/src/modules/rfp/**`
module, `rfp_*` tables, and any RFP-named worker jobs remain until a later data
migration/removal plan, but new product behavior should be built on `tenders`
and related tender tables.

Short version: Tender = discovery/opportunity/application workspace; legacy
RFP = migration compatibility only.
