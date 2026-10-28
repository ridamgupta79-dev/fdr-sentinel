export function money(value: unknown): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

export function compactMoney(value: unknown): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  if (Math.abs(amount) >= 1e7) return `₹${(amount / 1e7).toFixed(2)} Cr`;
  if (Math.abs(amount) >= 1e5) return `₹${(amount / 1e5).toFixed(1)} L`;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

export function dateLabel(value?: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function dateTimeLabel(value?: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function relativeTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value.endsWith("Z") || value.includes("T") ? value : `${value}Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  const seconds = Math.round((Date.now() - parsed.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return dateLabel(value);
}

export function daysUntil(value?: string | null): number | null {
  if (!value) return null;
  const target = new Date(`${value}T00:00:00Z`).getTime();
  if (Number.isNaN(target)) return null;
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((target - todayUtc) / 86400000);
}

export type MaturityInfo = { key: "matured" | "soon" | "thisQuarter" | "future"; label: string; tone: "bad" | "pending" | "good" | "neutral" };

export function maturityInfo(maturityDate?: string | null): MaturityInfo {
  const days = daysUntil(maturityDate);
  if (days === null) return { key: "future", label: "—", tone: "neutral" };
  if (days < 0) return { key: "matured", label: `Matured ${-days}d ago`, tone: "bad" };
  if (days === 0) return { key: "soon", label: "Matures today", tone: "pending" };
  if (days <= 30) return { key: "soon", label: `${days}d to maturity`, tone: "pending" };
  if (days <= 90) return { key: "thisQuarter", label: `${days}d to maturity`, tone: "good" };
  return { key: "future", label: `${days}d to maturity`, tone: "neutral" };
}

export function monthKey(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  const index = Number(month) - 1;
  return `${MONTH_NAMES[index] || month} ${String(year).slice(2)}`;
}

export function lastMonthKeys(count: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

export function percent(part: number, total: number): string {
  if (!total) return "—";
  return `${Math.round((part / total) * 100)}%`;
}

export function statusClass(status?: string | null): string {
  const normalized = (status || "unknown").toLowerCase();
  if (["verified", "approved", "active", "released", "completed"].includes(normalized)) return "status-good";
  if (["pending", "submitted", "under_verification", "release_pending", "under review"].includes(normalized)) return "status-pending";
  if (["rejected", "expired", "overdue", "failed", "verification_failed"].includes(normalized)) return "status-bad";
  return "status-neutral";
}

export function statusLabel(status?: string | null): string {
  if (!status) return "Unknown";
  return status.replaceAll("_", " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function actionLabel(action?: string | null): string {
  if (!action) return "Event";
  return action.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function tenureLabel(issueDate?: string | null, maturityDate?: string | null): string {
  if (!issueDate || !maturityDate) return "—";
  const start = new Date(`${issueDate}T00:00:00Z`).getTime();
  const end = new Date(`${maturityDate}T00:00:00Z`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return "—";
  const months = Math.round((end - start) / (86400000 * 30.4375));
  return months >= 12 ? `${(months / 12).toFixed(months % 12 === 0 ? 0 : 1)} yr` : `${months} mo`;
}
