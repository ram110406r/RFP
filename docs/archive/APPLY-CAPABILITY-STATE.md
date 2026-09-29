# Apply/RFP Automation Capability State

Updated: 2026-09-15

## Canonical Workflow

Apply automation is canonical on the `tenders` workflow. Legacy `rfp_*` tables and routes remain compatibility surfaces only and should not receive new product features unless a migration task explicitly requires it.

## Capability Matrix

| Capability | State | Notes |
|---|---|---|
| Tender workspace, requirements, questions, answers, reviews | Real | Persisted in tender tables and guarded by tenant/resource permissions. |
| Requirement extraction from processed text | Real | Deterministic extraction from parsed document content with human accept/reject. |
| PDF/DOCX text extraction | Real | Text-native PDFs and DOCX files are parsed into the shared extraction model. |
| Scanned-PDF OCR | Real adapter | `DOCUMENT_OCR` persists externally generated OCR text from `<objectKey>.ocr.txt` into the same extraction model. A bundled OCR engine is not included yet. |
| Table extraction and normalization jobs | Not implemented | Job names exist, but still fail loudly until a later phase. |
| AI answer generation | Real when configured | Uses the registered AI provider. Production fails closed if the provider is unavailable. |
| Deterministic answer fallback | Fallback | Development/test fallback is explicitly marked in generation metadata as `deterministic_fallback`. |
| Package generation | Real | Generates DOCX, XLSX, evidence manifest, checklist, and ZIP package artifacts. |
| Package approval | Real | Requires current validation and current approved reviews. |
| Package download | Real | Generates a presigned download URL and records audit/activity. |
| External submission | Manual | TENDYY records a portal/email acknowledgement after the team submits externally. It does not submit to buyer portals. |
| Receipt file linking | Real | Submission receipt file IDs are accepted only when they belong to the same organization. |
| Portal automation | Deferred | No credentialed autonomous GeM/CPPP/email submission should be added without a separate security review. |

## Operator Notes

- Configure `GROQ_API_KEY` and `GROQ_MODEL` for live AI generation.
- For scanned PDFs today, run OCR outside TENDYY and upload UTF-8 text beside the original object as `<objectKey>.ocr.txt`, then enqueue `DOCUMENT_OCR`.
- Keep buyer-portal credentials out of the platform until portal automation has a reviewed design.
