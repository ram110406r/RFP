import type { Person } from "@/types";

export const CURRENT_USER_ID = "p1";

export const people: Person[] = [
  {
    id: "p1",
    name: "Priya Nair",
    role: "Proposal Manager",
    team: "Bid Management",
    initials: "PN",
  },
  {
    id: "p2",
    name: "Marcus Webb",
    role: "Security Lead",
    team: "Security & Compliance",
    initials: "MW",
  },
  { id: "p3", name: "Elena Fischer", role: "Legal Counsel", team: "Legal", initials: "EF" },
  {
    id: "p4",
    name: "David Okafor",
    role: "Solutions Architect",
    team: "Architecture",
    initials: "DO",
  },
  { id: "p5", name: "Sana Raza", role: "Commercial Lead", team: "Commercial", initials: "SR" },
  { id: "p6", name: "Tom Bergstrom", role: "Product SME", team: "Product", initials: "TB" },
  { id: "p7", name: "Grace Lin", role: "Support Lead", team: "Customer Support", initials: "GL" },
  { id: "p8", name: "James Whitfield", role: "VP Sales", team: "Sales", initials: "JW" },
  { id: "p9", name: "Aisha Malik", role: "Compliance Analyst", team: "Compliance", initials: "AM" },
  {
    id: "p10",
    name: "Ravi Chandran",
    role: "Knowledge Manager",
    team: "Knowledge Ops",
    initials: "RC",
  },
];

export function getPerson(id: string | null | undefined): Person | undefined {
  if (!id) return undefined;
  return people.find((p) => p.id === id);
}

export function personName(id: string | null | undefined): string {
  if (!id) return "Unassigned";
  return getPerson(id)?.name ?? id;
}
