"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { clearAnalytics } from "@/lib/useAnalyticsData";
import { currencies } from "@/presets/ledger";
import type { AppUser } from "@/lib/privateApi";
import { settingsSchema } from "@/lib/userSettings";
import type { SettingsSnapshot, UserSettings } from "@/lib/userSettings";

type Props = {
  user: AppUser;
  settings: SettingsSnapshot;
  syncStatus: string;
  onChange: (patch: Partial<UserSettings>) => void;
  onReload: () => void;
  onRetry: () => void;
  onReset: () => void;
  readLegacyLists: () => any;
  children: ReactNode;
};
type AiConfiguration = { baseUrl: string; model: string; configured: boolean };

export function AccountSettings({ user, settings, syncStatus, onChange, onReload, onRetry, onReset, readLegacyLists, children }: Props) {
  const [ai, setAi] = useState<AiConfiguration>({ baseUrl: "", model: "", configured: false });
  const [aiLoaded, setAiLoaded] = useState(false);
  const [key, setKey] = useState("");
  const [reveal, setReveal] = useState(false);
  const [aiMessage, setAiMessage] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [passkeyName, setPasskeyName] = useState("");
  const [passkeyMessage, setPasskeyMessage] = useState("");
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const passkeys = authClient.useListPasskeys();
  const [legacy, setLegacy] = useState<any>(null);
  const [legacyError, setLegacyError] = useState("");
  const showSyncStatus = syncStatus && !["设置已同步", "已载入服务器设置"].includes(syncStatus);
  const syncFailed = showSyncStatus && !["正在保存设置…", "设置尚未保存"].includes(syncStatus);

  useEffect(() => {
    let alive = true;
    setLegacy(readLegacyLists());
    fetch("/api/ai-config", { cache: "no-store" }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (alive) { setAi(data); setAiLoaded(true); }
    }).catch(() => { if (alive) setAiMessage("读取 AI 配置失败，请稍后重试。"); });
    return () => { alive = false; };
    // Legacy data is imported only after an explicit choice for the current account.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function aiAction(action: "save" | "reveal" | "test" | "delete" | "import-legacy") {
    setAiBusy(true); setAiMessage("");
    try {
      const response = await fetch("/api/ai-config", {
        method: action === "save" ? "PUT" : action === "delete" ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: action === "delete" ? undefined : JSON.stringify(action === "save"
          ? { baseUrl: ai.baseUrl, model: ai.model, ...(key ? { apiKey: key } : {}) }
          : { action })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "操作失败。");
      if (action === "reveal") { setKey(data.apiKey); setReveal(true); }
      else {
        setKey(""); setReveal(false);
        const current = await fetch("/api/ai-config", { cache: "no-store" });
        if (!current.ok) throw new Error("读取配置失败。");
        setAi(await current.json()); setAiLoaded(true);
      }
      setAiMessage(action === "test" ? "连接正常" : action === "delete" ? "配置已删除" : action === "reveal" ? "" : "配置已保存");
    } catch (e) { setAiMessage(e instanceof Error ? e.message : "操作失败。"); }
    finally { setAiBusy(false); }
  }

  async function addPasskey() {
    setPasskeyBusy(true); setPasskeyMessage("");
    try {
      const result = await authClient.passkey.addPasskey({ name: passkeyName.trim() || "我的设备" });
      if (result.error) throw new Error(result.error.message || "未添加通行密钥。");
      setPasskeyName(""); await passkeys.refetch(); setPasskeyMessage("已添加");
    } catch (e) { setPasskeyMessage(e instanceof Error ? e.message : "未添加通行密钥。"); }
    finally { setPasskeyBusy(false); }
  }

  function importLegacy() {
    if (!window.confirm(`将旧分类和支付方式导入 ${user.email}？这会替换当前分类和支付方式。`)) return;
    try {
      onChange(settingsSchema.parse({ ...settings, categories: legacy.categories || settings.categories, paymentMethods: legacy.paymentMethods || settings.paymentMethods }));
      setLegacy(null);
    } catch { setLegacyError("旧版设置格式无效，未导入。"); }
  }

  return <div className="settings-page">
    <h1 className="settings-title">设置</h1>

    <section className="panel settings-block" aria-labelledby="ledger-settings-title">
      <h2 id="ledger-settings-title">记账偏好</h2>
      <label className="settings-preference-row">
        <span>默认币种</span>
        <select className="select" aria-label="默认识别币种" value={settings.defaultCurrency} onChange={e => onChange({ defaultCurrency: e.target.value })}>
          {currencies.map(code => <option key={code} value={code}>{code}</option>)}
        </select>
      </label>
      <div className="settings-groups">{children}</div>
      <div className="settings-section-footer">
        {legacy ? <button className="text-button" onClick={importLegacy}>导入旧分类</button> : null}
        <button className="text-button settings-reset" onClick={() => { if (window.confirm("将消费分类和支付方式恢复默认？")) onReset(); }}>恢复默认分类与支付方式</button>
      </div>
      {legacyError ? <p className="settings-feedback" role="alert">{legacyError}</p> : null}
      {showSyncStatus ? <div className="settings-sync" role="status">
        <span>{syncStatus}</span>
        {syncFailed ? <div className="settings-actions"><button className="text-button" onClick={onRetry}>重试保存</button><button className="text-button" onClick={onReload}>重新载入</button></div> : null}
      </div> : null}
    </section>

    <details className="panel setting-group settings-ai">
      <summary><span>AI 配置</span><small>{aiLoaded ? ai.configured ? "已配置" : "未配置" : aiMessage ? "读取失败" : "读取中…"}</small></summary>
      <div className="setting-group-body">
        <form className="settings-form" onSubmit={event => { event.preventDefault(); void aiAction("save"); }}>
          <label className="field"><span>API Base URL</span><input className="input" type="url" required autoComplete="off" value={ai.baseUrl} onChange={e => setAi({ ...ai, baseUrl: e.target.value })} placeholder="https://api.example.com/v1" /></label>
          <label className="field"><span>Model</span><input className="input" required autoComplete="off" value={ai.model} onChange={e => setAi({ ...ai, model: e.target.value })} /></label>
          <div className="field"><label htmlFor="settings-api-key">API Key</label><div className="settings-key-row">
            <input id="settings-api-key" className="input" type={reveal ? "text" : "password"} autoComplete="off" value={key} placeholder={ai.configured ? "已保存，留空保留" : "填写 API Key"} onChange={e => setKey(e.target.value)} />
            {ai.configured ? <button type="button" className="text-button" disabled={aiBusy} onClick={() => { if (reveal) { setKey(""); setReveal(false); } else void aiAction("reveal"); }}>{reveal ? "隐藏" : "查看"}</button> : null}
          </div></div>
          <div className="settings-ai-actions">
            <button type="submit" className="primary-button" disabled={aiBusy}>{aiBusy ? "处理中…" : "保存配置"}</button>
            {ai.configured ? <>
              <button type="button" className="text-button" disabled={aiBusy} onClick={() => { if (window.confirm("发送一条测试请求，可能消耗少量 API 额度。继续？")) void aiAction("test"); }}>测试连接</button>
              <button type="button" className="text-button" disabled={aiBusy} onClick={() => { if (window.confirm("删除本账号的 AI 配置？")) void aiAction("delete"); }}>删除配置</button>
            </> : null}
          </div>
        </form>
        {user.role === "owner" && aiLoaded && !ai.configured ? <button className="text-button" disabled={aiBusy} onClick={() => { void aiAction("import-legacy"); }}>导入原 AI 配置</button> : null}
        {aiMessage ? <p className="settings-feedback" role="status">{aiMessage}</p> : null}
      </div>
    </details>

    <section className="panel settings-block" aria-labelledby="account-settings-title">
      <div className="settings-account-heading"><h2 id="account-settings-title">账号</h2><p>{user.email}</p></div>
      <details className="setting-group">
        <summary><span>通行密钥</span><small>{passkeys.data?.length || 0} 枚</small></summary>
        <div className="setting-group-body">
          <form className="settings-passkey-add" onSubmit={event => { event.preventDefault(); void addPasskey(); }}>
            <input className="input" aria-label="通行密钥名称" placeholder="设备名称" maxLength={50} value={passkeyName} onChange={e => setPasskeyName(e.target.value)} />
            <button className="text-button" type="submit" disabled={passkeyBusy}>添加</button>
          </form>
          {passkeys.data?.length ? <div className="settings-passkey-list">{passkeys.data.map(item => <div className="settings-passkey-item" key={item.id}>
            <span>{item.name || "我的设备"}</span>
            <div className="settings-actions">
              <button className="text-button" disabled={passkeyBusy} onClick={async () => {
                const name = window.prompt("通行密钥名称", item.name || "我的设备")?.trim(); if (!name || name.length > 50) return;
                const result = await authClient.passkey.updatePasskey({ id: item.id, name });
                if (result.error) setPasskeyMessage(result.error.message || "重命名失败。"); else await passkeys.refetch();
              }}>重命名</button>
              <button className="text-button" disabled={passkeyBusy} onClick={async () => {
                if (!window.confirm(`移除通行密钥「${item.name || "我的设备"}」？`)) return;
                const result = await authClient.passkey.deletePasskey({ id: item.id });
                if (result.error) setPasskeyMessage(result.error.message || "移除失败。"); else await passkeys.refetch();
              }}>移除</button>
            </div>
          </div>)}</div> : null}
          {passkeys.error ? <p className="settings-feedback" role="alert">读取通行密钥失败<button className="text-button" onClick={() => { void passkeys.refetch(); }}>重试</button></p> : null}
          {passkeyMessage ? <p className="settings-feedback" role="status">{passkeyMessage}</p> : null}
        </div>
      </details>
      <div className="settings-section-footer settings-account-actions">
        {user.role === "owner" ? <Link className="text-button" href="/admin">管理用户</Link> : null}
        <button className="text-button" onClick={() => { clearAnalytics(); void authClient.signOut().then(() => { localStorage.removeItem(`tcca-settings:${user.id}`); window.location.reload(); }); }}>退出登录</button>
      </div>
    </section>
  </div>;
}
