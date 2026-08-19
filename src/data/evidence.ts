import type { Evidence } from "@/types";
import { getKnowledgeSource } from "./knowledge";

function src(id: string) {
  const source = getKnowledgeSource(id);
  return source?.name ?? "Unknown source";
}

export const evidence: Evidence[] = [
  {
    id: "ev1",
    title: "SOC 2 Type II - Security trust criteria",
    sourceId: "ks1",
    sourceName: src("ks1"),
    excerpt:
      "The service commitments and system requirements related to security were achieved based on the criteria relevant to Security set forth in TSP section 100.",
    verifiedAt: "2026-07-28",
    freshnessDays: 23,
    confidence: 0.96,
    url: "/knowledge/ks1",
  },
  {
    id: "ev2",
    title: "SOC 2 Type II - Zero exceptions noted",
    sourceId: "ks1",
    sourceName: src("ks1"),
    excerpt:
      "No exceptions were identified as a result of the procedures performed during the review period.",
    verifiedAt: "2026-07-28",
    freshnessDays: 23,
    confidence: 0.97,
    url: "/knowledge/ks1",
  },
  {
    id: "ev3",
    title: "ISO 27001 certificate scope statement",
    sourceId: "ks2",
    sourceName: src("ks2"),
    excerpt:
      "Certificate IS 771342 covers the information security management system supporting product engineering, cloud infrastructure operations, and customer support.",
    verifiedAt: "2026-08-01",
    freshnessDays: 19,
    confidence: 0.98,
    url: "/knowledge/ks2",
  },
  {
    id: "ev4",
    title: "CAIQ - Encryption at rest control",
    sourceId: "ks3",
    sourceName: src("ks3"),
    excerpt:
      "All customer data at rest is encrypted using AES-256 with per-tenant data encryption keys managed via a dedicated KMS.",
    verifiedAt: "2026-04-11",
    freshnessDays: 131,
    confidence: 0.94,
    url: "/knowledge/ks3",
  },
  {
    id: "ev5",
    title: "CAIQ - Encryption in transit control",
    sourceId: "ks3",
    sourceName: src("ks3"),
    excerpt:
      "All data in transit between clients, services, and third parties is encrypted using TLS 1.2 or higher.",
    verifiedAt: "2026-04-11",
    freshnessDays: 131,
    confidence: 0.95,
    url: "/knowledge/ks3",
  },
  {
    id: "ev6",
    title: "CAIQ - Key rotation policy",
    sourceId: "ks3",
    sourceName: src("ks3"),
    excerpt:
      "Data encryption keys are rotated automatically on a 90-day interval without service interruption.",
    verifiedAt: "2026-04-11",
    freshnessDays: 131,
    confidence: 0.82,
    url: "/knowledge/ks3",
  },
  {
    id: "ev7",
    title: "CAIQ - Privileged access MFA",
    sourceId: "ks3",
    sourceName: src("ks3"),
    excerpt:
      "Multi-factor authentication is enforced for all administrative and privileged production access.",
    verifiedAt: "2026-04-11",
    freshnessDays: 131,
    confidence: 0.91,
    url: "/knowledge/ks3",
  },
  {
    id: "ev8",
    title: "Commercial Playbook - Standard payment terms",
    sourceId: "ks4",
    sourceName: src("ks4"),
    excerpt:
      "Standard payment terms are Net 30 from invoice date, with quarterly or annual billing options available.",
    verifiedAt: "2026-07-15",
    freshnessDays: 36,
    confidence: 0.92,
    url: "/knowledge/ks4",
  },
  {
    id: "ev9",
    title: "Commercial Playbook - Liability cap position",
    sourceId: "ks4",
    sourceName: src("ks4"),
    excerpt:
      "The approved fallback liability cap is 12 months of fees paid under the order form in the preceding 12 months.",
    verifiedAt: "2026-07-15",
    freshnessDays: 36,
    confidence: 0.86,
    url: "/knowledge/ks4",
  },
  {
    id: "ev10",
    title: "Architecture Whitepaper - Tenant isolation model",
    sourceId: "ks5",
    sourceName: src("ks5"),
    excerpt:
      "Each tenant is provisioned a dedicated logical schema with row-level security policies enforced at the data access layer.",
    verifiedAt: "2026-03-02",
    freshnessDays: 171,
    confidence: 0.85,
    url: "/knowledge/ks5",
  },
  {
    id: "ev11",
    title: "Architecture Whitepaper - Uptime commitment",
    sourceId: "ks5",
    sourceName: src("ks5"),
    excerpt:
      "The platform is architected for a 99.95% monthly uptime SLA across all production regions.",
    verifiedAt: "2026-03-02",
    freshnessDays: 171,
    confidence: 0.88,
    url: "/knowledge/ks5",
  },
  {
    id: "ev12",
    title: "DPA Template - Cross-border transfer mechanism",
    sourceId: "ks6",
    sourceName: src("ks6"),
    excerpt:
      "Cross-border data transfers rely on the EU Standard Contractual Clauses (2021 module) supplemented by a transfer impact assessment.",
    verifiedAt: "2026-08-05",
    freshnessDays: 15,
    confidence: 0.93,
    url: "/knowledge/ks6",
  },
  {
    id: "ev13",
    title: "DPA Template - Sub-processor notification",
    sourceId: "ks6",
    sourceName: src("ks6"),
    excerpt:
      "Customers receive at least 30 days advance notice before a new sub-processor is engaged, with a right to object.",
    verifiedAt: "2026-08-05",
    freshnessDays: 15,
    confidence: 0.9,
    url: "/knowledge/ks6",
  },
  {
    id: "ev14",
    title: "Support SLA - Severity 1 response commitment",
    sourceId: "ks7",
    sourceName: src("ks7"),
    excerpt:
      "Severity 1 (production down) incidents receive a 30 minute response commitment, 24 hours a day, 7 days a week.",
    verifiedAt: "2025-11-04",
    freshnessDays: 289,
    confidence: 0.71,
    url: "/knowledge/ks7",
  },
  {
    id: "ev15",
    title: "Support SLA - Available channels",
    sourceId: "ks7",
    sourceName: src("ks7"),
    excerpt:
      "Support is available via phone, email, and in-app chat, with dedicated Slack Connect channels for enterprise accounts.",
    verifiedAt: "2025-11-04",
    freshnessDays: 289,
    confidence: 0.74,
    url: "/knowledge/ks7",
  },
  {
    id: "ev16",
    title: "Prior RFP - Deployment model reference",
    sourceId: "ks8",
    sourceName: src("ks8"),
    excerpt:
      "For the Meridian Health regional engagement, a dedicated single-tenant environment was provisioned inside the customer's own VPC.",
    verifiedAt: "2026-02-18",
    freshnessDays: 183,
    confidence: 0.52,
    url: "/knowledge/ks8",
  },
  {
    id: "ev17",
    title: "ISO 27001 - Annual surveillance audit result",
    sourceId: "ks2",
    sourceName: src("ks2"),
    excerpt:
      "The most recent surveillance audit confirmed continued conformance with ISO/IEC 27001:2022 with no major nonconformities.",
    verifiedAt: "2026-08-01",
    freshnessDays: 19,
    confidence: 0.95,
    url: "/knowledge/ks2",
  },
  {
    id: "ev18",
    title: "Commercial Playbook - SLA service credits",
    sourceId: "ks4",
    sourceName: src("ks4"),
    excerpt:
      "Service credits of up to 10% of monthly fees are issued automatically when the uptime SLA is missed in a given month.",
    verifiedAt: "2026-07-15",
    freshnessDays: 36,
    confidence: 0.83,
    url: "/knowledge/ks4",
  },
];

export function getEvidenceById(id: string) {
  return evidence.find((e) => e.id === id);
}

export function getEvidenceForIds(ids: string[]): Evidence[] {
  return ids.map((id) => getEvidenceById(id)).filter((e): e is Evidence => Boolean(e));
}
