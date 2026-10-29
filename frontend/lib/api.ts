const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type PackageTier = "trial" | "basic" | "pro" | "premium";

export type User = {
  id: number;
  email: string;
  full_name: string;
  package: PackageTier;
  is_admin: boolean;
};

export type AdminUser = User & {
  is_active: boolean;
  package_expires_at: string | null;
  created_at: string | null;
};

export type Instrument = {
  id: number;
  symbol: string;
  name: string;
  exchange?: string;
  segment?: string;
  trading_symbol?: string;
  instrument_key: string;
  tick_size: number;
  tolerance_abs: number;
  tolerance_pct: number;
  is_nifty50: boolean;
  last_synced_at: string | null;
};

export type InstrumentSearchHit = {
  exchange: string;
  segment: string;
  symbol: string;
  trading_symbol: string;
  name: string;
  isin: string;
  instrument_key: string;
  tick_size: number;
  instrument_type: string;
  in_library: boolean;
};

export type Candle = {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Mark = {
  mark_date: string;
  column_side: string;
  price: number;
  label: "BU" | "BE" | "R" | "DT" | "DB";
  note: string;
};

export type Analysis = {
  instrument: Instrument;
  timeframe: string;
  trend: string;
  last_bu: number | null;
  last_be: number | null;
  last_r: number | null;
  last_dt: number | null;
  last_db: number | null;
  signal: string;
  signal_note: string;
  stop_hint: number | null;
  as_of: string | null;
  marks: Mark[];
};

function authHeader() {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("vns_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeader(),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

export async function register(email: string, password: string, full_name: string) {
  return request<User>("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, full_name }),
  });
}

export async function login(email: string, password: string) {
  const body = new URLSearchParams();
  body.set("username", email);
  body.set("password", password);
  const res = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error("Login failed");
  const data = await res.json();
  localStorage.setItem("vns_token", data.access_token);
  return data;
}

export async function me() {
  return request<User>("/api/v1/auth/me");
}

export async function listInstruments(scope?: "watchlist" | "nifty50" | "all") {
  const qs = scope ? `?scope=${scope}` : "";
  return request<Instrument[]>(`/api/v1/instruments${qs}`);
}

export async function searchInstruments(query: string, exchange?: "NSE" | "BSE") {
  const params = new URLSearchParams({ q: query, limit: "25" });
  if (exchange) params.set("exchange", exchange);
  return request<InstrumentSearchHit[]>(`/api/v1/instruments/search?${params}`);
}

export async function openInstrument(instrumentKey: string, sync = true, allTimeframes = true) {
  return request<{
    instrument: Instrument;
    added_to_watchlist: boolean;
    sync: {
      synced: number;
      analyzed: number;
      candle_rows: number;
      errors: string[];
      timeframes: string[];
    } | null;
  }>("/api/v1/instruments/open", {
    method: "POST",
    body: JSON.stringify({
      instrument_key: instrumentKey,
      sync,
      all_timeframes: allTimeframes,
    }),
  });
}

export async function removeFromWatchlist(symbol: string) {
  return request<{ removed: boolean; symbol: string }>(
    `/api/v1/watchlist/${encodeURIComponent(symbol)}`,
    { method: "DELETE" }
  );
}

export async function getCandles(symbol: string, timeframe = "day") {
  const limit =
    timeframe === "15minute" || timeframe === "30minute"
      ? 2500
      : timeframe === "1hour" || timeframe === "4hour"
        ? 2000
        : 1500;
  return request<Candle[]>(
    `/api/v1/instruments/${encodeURIComponent(symbol)}/candles?timeframe=${timeframe}&limit=${limit}`
  );
}

export async function getAnalysis(symbol: string, timeframe = "day") {
  return request<Analysis>(
    `/api/v1/instruments/${encodeURIComponent(symbol)}/analysis?timeframe=${timeframe}`
  );
}

export async function listAnalyses(timeframe = "day") {
  return request<Analysis[]>(`/api/v1/analyses?timeframe=${timeframe}`);
}

export async function triggerSync(symbol?: string, allTimeframes = true) {
  return request<{
    synced: number;
    analyzed: number;
    candle_rows: number;
    errors: string[];
    timeframes: string[];
  }>("/api/v1/admin/sync", {
    method: "POST",
    body: JSON.stringify({
      all_timeframes: allTimeframes,
      symbol: symbol || null,
    }),
  });
}

export async function listAdminUsers() {
  return request<AdminUser[]>("/api/v1/admin/users");
}

export async function createAdminUser(payload: {
  email: string;
  password: string;
  full_name?: string;
  package?: PackageTier;
  is_admin?: boolean;
  trial_days?: number;
}) {
  return request<AdminUser>("/api/v1/admin/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAdminUser(
  userId: number,
  payload: {
    full_name?: string;
    package?: PackageTier;
    is_active?: boolean;
    is_admin?: boolean;
    extend_days?: number;
    password?: string;
  }
) {
  return request<AdminUser>(`/api/v1/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function logout() {
  localStorage.removeItem("vns_token");
}
