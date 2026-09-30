export type Tone = "success" | "warning" | "danger" | "neutral";

export function statusTone(status: string): Tone {
  const normalized = status.toLowerCase();
  if (normalized === "active" || normalized === "approved" || normalized === "connected") return "success";
  if (normalized === "pending" || normalized === "invited" || normalized === "review") return "warning";
  if (normalized === "removed" || normalized === "suspended" || normalized === "archived" || normalized === "expired") return "danger";
  return "neutral";
}

export function roleTone(role: string): Tone {
  const normalized = role.toUpperCase();
  if (normalized === "OWNER") return "danger";
  if (normalized === "ADMIN") return "warning";
  if (normalized === "RFP_MANAGER") return "success";
  return "neutral";
}

export function formatRole(role: string) {
  return role.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatStatus(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function relativeTime(value: string | null | undefined) {
  if (!value) return "Not set";
  const deltaMinutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (deltaMinutes < 1) return "Just now";
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const hours = Math.round(deltaMinutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const [first = "AN", second = ""] = parts;
  if (parts.length <= 1) return first.slice(0, 2).toUpperCase();
  return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
}

export function workspaceLabel(workspaceId: string | null, workspaces: Array<{ id: string; name: string }>) {
  if (!workspaceId) return "All workspaces";
  return workspaces.find((workspace) => workspace.id === workspaceId)?.name ?? workspaceId;
}

export function jumpTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
