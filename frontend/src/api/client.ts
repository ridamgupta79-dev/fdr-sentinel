const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

export function getToken(): string | null {
  return localStorage.getItem("fdr_access_token");
}

export function authHeaders(extra: HeadersInit = {}): HeadersInit {
  const token = getToken();
  return { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra };
}

type ApiErrorBody = { detail?: unknown };

function extractDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item: { msg?: string; loc?: (string | number)[] }) =>
        `${(item.loc || []).slice(-1)[0] || "Field"}: ${item.msg || "Invalid value"}`)
      .join("; ");
  }
  if (detail && typeof detail === "object" && "msg" in (detail as Record<string, unknown>)) {
    return extractDetail([(detail as { msg: string }).msg]);
  }
  return "";
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: authHeaders({
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers || {}),
      }),
    });
  } catch {
    throw new Error("Cannot connect to the backend. Make sure the FastAPI server is running.");
  }

  let body: ApiErrorBody | T | null = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Your session has expired. Sign in again to continue.");
    }
    const detail = body && typeof body === "object" && "detail" in body
      ? extractDetail((body as ApiErrorBody).detail)
      : "";
    throw new Error(detail || `Request failed (HTTP ${response.status}).`);
  }

  return body as T;
}

export async function apiArray<T>(path: string): Promise<T[]> {
  const body = await apiRequest<unknown>(path);
  if (Array.isArray(body)) return body as T[];
  if (body && typeof body === "object") {
    const value = body as { items?: unknown; results?: unknown };
    if (Array.isArray(value.items)) return value.items as T[];
    if (Array.isArray(value.results)) return value.results as T[];
  }
  return [];
}

export function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}
