import type { Analytics, AnalyticsDisplayCurrency } from "./analytics";

export type AnalyticsQuery = { month: string; currency: AnalyticsDisplayCurrency; excludedCategories: string[] };
export type AnalyticsSnapshot = { data: Analytics | null; loading: boolean; error: string; revision: number };
type Entry = { state: AnalyticsSnapshot; updatedAt: number; request: Promise<void> | null; token: number };

export function normalizeAnalyticsQuery(query: AnalyticsQuery): AnalyticsQuery {
  return { ...query, excludedCategories: [...new Set(query.excludedCategories.map((name) => name.trim()).filter(Boolean))].sort() };
}
export function analyticsQueryKey(query: AnalyticsQuery) {
  const normalized = normalizeAnalyticsQuery(query);
  return JSON.stringify([normalized.month, normalized.currency, normalized.excludedCategories]);
}
export function analyticsQueryUrl(query: AnalyticsQuery) {
  const normalized = normalizeAnalyticsQuery(query);
  const params = new URLSearchParams({ month: normalized.month, currency: normalized.currency });
  normalized.excludedCategories.forEach((name) => params.append("excludeCategory", name));
  return `/api/analytics?${params}`;
}

// Shared across tab mounts. Invalidated requests may finish, but cannot replace newer results.
export function createAnalyticsCache(
  loader: (query: AnalyticsQuery) => Promise<Analytics>,
  now: () => number = Date.now,
  maxAge = 5 * 60 * 1000
) {
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  let revision = 0;
  const notify = () => listeners.forEach((listener) => listener());
  function entryFor(query: AnalyticsQuery) {
    const key = analyticsQueryKey(query);
    let entry = entries.get(key);
    if (!entry) {
      entry = { state: { data: null, loading: false, error: "", revision }, updatedAt: 0, request: null, token: 0 };
      entries.set(key, entry);
    }
    return entry;
  }
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot(query: AnalyticsQuery) { return entryFor(query).state; },
    load(query: AnalyticsQuery, force = false): Promise<void> {
      const entry = entryFor(query);
      if (entry.request) return entry.request;
      if (!force && entry.state.data && entry.state.revision === revision && now() - entry.updatedAt < maxAge) return Promise.resolve();
      const token = ++entry.token;
      entry.state = { ...entry.state, loading: true, error: "", revision };
      entry.request = Promise.resolve().then(() => loader(normalizeAnalyticsQuery(query))).then((data) => {
        if (entry.token !== token) return;
        entry.updatedAt = now();
        entry.state = { data, loading: false, error: "", revision };
      }).catch((error: unknown) => {
        if (entry.token !== token) return;
        entry.state = { ...entry.state, loading: false, error: error instanceof Error ? error.message : "读取分析数据失败。" };
      }).finally(() => {
        if (entry.token !== token) return;
        entry.request = null;
        notify();
      });
      notify();
      return entry.request;
    },
    invalidate() {
      revision++;
      entries.forEach((entry) => {
        entry.token++;
        entry.request = null;
        entry.updatedAt = 0;
        // Keep the old revision until reloaded, so a fresh TTL can never revive invalid data.
        entry.state = { ...entry.state, loading: false };
      });
      notify();
    },
    getRevision() { return revision; }
  };
}
