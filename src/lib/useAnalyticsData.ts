"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { analyticsQueryKey, analyticsQueryUrl, createAnalyticsCache, normalizeAnalyticsQuery } from "@/lib/analyticsCache";
import type { AnalyticsQuery, AnalyticsSnapshot } from "@/lib/analyticsCache";
import type { Analytics } from "@/lib/analytics";

const serverSnapshot: AnalyticsSnapshot = { data: null, loading: false, error: "", revision: 0 };
const cache = createAnalyticsCache(async (query) => {
  const response = await fetch(analyticsQueryUrl(query), { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "读取分析数据失败，请稍后重试。");
  return data as Analytics;
});

export function invalidateAnalytics() { cache.invalidate(); }

export function useAnalyticsData(query: AnalyticsQuery, enabled: boolean) {
  const key = analyticsQueryKey(query);
  // Canonical keys keep logically identical category lists from refetching.
  const stableQuery = useMemo(() => {
    const [month, currency, excludedCategories] = JSON.parse(key);
    return normalizeAnalyticsQuery({ month, currency, excludedCategories });
  }, [key]);
  const getSnapshot = useCallback(() => cache.getSnapshot(stableQuery), [stableQuery]);
  const snapshot = useSyncExternalStore(cache.subscribe, getSnapshot, () => serverSnapshot);
  const revision = useSyncExternalStore(cache.subscribe, cache.getRevision, () => 0);

  useEffect(() => {
    if (enabled) void cache.load(stableQuery);
  }, [stableQuery, enabled, revision]);

  useEffect(() => {
    if (!enabled) return;
    const revalidate = () => { if (document.visibilityState === "visible") void cache.load(stableQuery); };
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => { window.removeEventListener("focus", revalidate); document.removeEventListener("visibilitychange", revalidate); };
  }, [stableQuery, enabled]);

  return { analytics: snapshot.data, loading: !enabled || snapshot.loading || (!snapshot.data && !snapshot.error), error: snapshot.error, retry: () => { void cache.load(stableQuery, true); } };
}
