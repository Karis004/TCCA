"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SettingsSnapshot, UserSettings } from "./userSettings";

export function useSyncedSettings(initial: SettingsSnapshot, userId: string) {
  const [settings, setSettings] = useState(initial);
  const [status, setStatus] = useState("");
  const current = useRef(initial); const revision = useRef(0); const savedRevision = useRef(0);
  const running = useRef(false); const alive = useRef(true); const timer = useRef<ReturnType<typeof setTimeout>>();
  const conflict = useRef(false);
  const drain = useCallback(async () => {
    if (running.current || conflict.current || !alive.current) return;
    running.current = true;
    try {
      while (savedRevision.current < revision.current && alive.current) {
        const at = revision.current; const payload = current.current;
        setStatus("正在保存设置…");
        const response = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: payload, version: payload.version }) });
        const data = await response.json();
        if (!alive.current) return;
        if (!response.ok) { if (response.status === 409) conflict.current = true; throw new Error(data.error || "设置保存失败。"); }
        savedRevision.current = at;
        current.current = revision.current === at ? data : { ...current.current, version: data.version, saved: true };
        setSettings(current.current);
        localStorage.setItem(`tcca-settings:${userId}`, JSON.stringify(current.current));
      }
      if (alive.current) setStatus("设置已同步");
    } catch (error) { if (alive.current) setStatus(error instanceof Error ? error.message : "设置尚未保存，请重试。"); }
    finally { running.current = false; }
  }, [userId]);
  const update = useCallback((patch: Partial<UserSettings>) => {
    current.current = { ...current.current, ...patch }; revision.current++;
    setSettings(current.current); setStatus("设置尚未保存"); clearTimeout(timer.current);
    timer.current = setTimeout(() => { void drain(); }, 500);
  }, [drain]);
  const reload = useCallback(async () => {
    if (running.current) return;
    try {
      const response = await fetch("/api/settings", { cache: "no-store" }); const data = await response.json();
      if (!response.ok) throw new Error(data.error || "读取设置失败。");
      current.current = data; savedRevision.current = revision.current; conflict.current = false;
      setSettings(data); setStatus("已载入服务器设置");
    } catch (error) { setStatus(error instanceof Error ? error.message : "读取失败。"); }
  }, []);
  useEffect(() => { alive.current = true; return () => { alive.current = false; clearTimeout(timer.current); }; }, []);
  return { settings, status, update, reload, retry: () => { void drain(); } };
}
