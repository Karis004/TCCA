"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { clearAnalytics } from "@/lib/useAnalyticsData";
import { currencies, categories as defaultCategories, paymentMethods as defaultMethods } from "@/presets/ledger";
import type { AppUser } from "@/lib/privateApi";
import { settingsSchema } from "@/lib/userSettings";
import type { SettingsSnapshot, UserSettings } from "@/lib/userSettings";

type Props = { user: AppUser; settings: SettingsSnapshot; syncStatus: string; onChange: (patch: Partial<UserSettings>) => void; onReload: () => void; onRetry: () => void; readLegacyLists: () => any };
export function AccountSettings({ user, settings, syncStatus, onChange, onReload, onRetry, readLegacyLists }: Props) {
  const [ai, setAi] = useState({ baseUrl: "", model: "", configured: false });
  const [key, setKey] = useState(""); const [reveal, setReveal] = useState(false);
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const [passkeyName, setPasskeyName] = useState("");
  const passkeys = authClient.useListPasskeys();
  const [legacy, setLegacy] = useState<any>(null);
  useEffect(() => {
    let alive = true; setLegacy(readLegacyLists());
    fetch("/api/ai-config", { cache: "no-store" }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); if (alive) setAi(data); }).catch(() => { if (alive) setMessage("读取 AI 配置失败，可稍后重新进入设置。"); });
    return () => { alive = false; };
  // Legacy settings are offered explicitly, never imported into an arbitrary newly signed-in account.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function aiAction(action: "save" | "reveal" | "test" | "delete" | "import-legacy") {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/ai-config", { method: action === "save" ? "PUT" : action === "delete" ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: action === "delete" ? undefined : JSON.stringify(action === "save" ? { baseUrl: ai.baseUrl, model: ai.model, ...(key ? { apiKey: key } : {}) } : { action }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "操作失败。");
      if (action === "reveal") { setKey(data.apiKey); setReveal(true); }
      else { setKey(""); setReveal(false); const current = await fetch("/api/ai-config", { cache: "no-store" }); if (!current.ok) throw new Error("读取配置失败。"); setAi(await current.json()); }
      setMessage(action === "test" ? "AI 连接正常。" : action === "delete" ? "AI 配置已删除。" : action === "reveal" ? "" : "AI 配置已保存。");
    } catch (e) { setMessage(e instanceof Error ? e.message : "操作失败。"); } finally { setBusy(false); }
  }
  async function addPasskey() {
    setBusy(true); setMessage("");
    try { const result = await authClient.passkey.addPasskey({ name: passkeyName.trim() || "我的设备" }); if (result.error) throw new Error(result.error.message || "未添加通行密钥。"); setPasskeyName(""); await passkeys.refetch(); setMessage("通行密钥已添加，可用于直接登录本站。"); }
    catch (e) { setMessage(e instanceof Error ? e.message : "未添加通行密钥。"); } finally { setBusy(false); }
  }
  function exportLists() {
    const blob = new Blob([JSON.stringify({ categories: settings.categories, paymentMethods: settings.paymentMethods, defaultCurrency: settings.defaultCurrency }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "tcca-personal-settings.json"; anchor.click(); URL.revokeObjectURL(url);
  }
  return <>
    <div className="account-row"><span className="hint">{user.email}</span><div className="account-links">{user.role === "owner" ? <Link href="/admin">管理用户</Link> : null}<button className="text-button" onClick={() => { clearAnalytics(); void authClient.signOut().then(() => { localStorage.removeItem(`tcca-settings:${user.id}`); window.location.reload(); }); }}>退出登录</button></div></div>
    {syncStatus ? <div className="settings-sync" role="status"><span>{syncStatus}</span><button className="text-button" onClick={onRetry}>重试保存</button><button className="text-button" onClick={onReload}>载入服务器设置</button></div> : null}
    <label className="field"><span>默认识别币种</span><select className="select" value={settings.defaultCurrency} onChange={e => onChange({ defaultCurrency: e.target.value })}>{currencies.map(code => <option key={code} value={code}>{code}</option>)}</select></label>
    {legacy ? <div className="setting-import"><p className="hint">此浏览器有旧版分类和支付方式。导入后归入当前账号。</p><button className="text-button" onClick={() => { if (window.confirm(`将此浏览器的旧设置导入 ${user.email}？这会替换当前账号的分类和支付方式。`)) { try { onChange(settingsSchema.parse({ ...settings, categories: legacy.categories || settings.categories, paymentMethods: legacy.paymentMethods || settings.paymentMethods })); setLegacy(null); } catch { setMessage("旧版设置格式无效，请导出后检查。"); } } }}>导入旧版设置</button></div> : null}
    <div className="account-links"><button className="text-button" onClick={exportLists}>导出个人设置</button><a className="text-button" href="/api/export" download>导出全部账单</a><label className="text-button file-button">导入设置文件<input type="file" accept="application/json,.json" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; try { if (file.size > 65536) throw new Error("文件过大。"); const { settingsSchema } = await import("@/lib/userSettings"); const loaded = JSON.parse(await file.text()); const imported = loaded.legacyCustomOnly ? { ...loaded, categories: [...defaultCategories, ...loaded.categories], paymentMethods: [...defaultMethods, ...loaded.paymentMethods] } : loaded; const data = settingsSchema.parse({ ...settings, ...imported }); if (window.confirm(`将文件中的设置导入 ${user.email}？`)) onChange(data); } catch { setMessage("导入失败，请检查设置文件。"); } e.target.value = ""; }} /></label></div>
    <details className="setting-group"><summary><span>我的 AI</span><small>{ai.configured ? "已配置" : "未配置"}</small></summary><div className="list">
      <label className="field"><span>API Base URL</span><input className="input" type="url" autoComplete="off" value={ai.baseUrl} onChange={e => setAi({ ...ai, baseUrl: e.target.value })} placeholder="https://api.example.com/v1" /></label>
      <label className="field"><span>Model</span><input className="input" autoComplete="off" value={ai.model} onChange={e => setAi({ ...ai, model: e.target.value })} /></label>
      <label className="field"><span>API Key</span><input className="input" type={reveal ? "text" : "password"} autoComplete="off" value={key} placeholder={ai.configured ? "已保存，留空保持不变" : "填写自己的 API Key"} onChange={e => setKey(e.target.value)} /></label>
      <div className="account-links"><button className="primary-button" disabled={busy} onClick={() => { void aiAction("save"); }}>保存 AI 配置</button>{ai.configured ? <><button className="text-button" disabled={busy} onClick={() => { if (reveal) { setKey(""); setReveal(false); } else void aiAction("reveal"); }}>{reveal ? "隐藏 Key" : "查看 Key"}</button><button className="text-button" disabled={busy} onClick={() => { if (window.confirm("使用已保存的配置发送一条测试请求，可能消耗少量 API 额度。继续？")) void aiAction("test"); }}>测试连接</button><button className="text-button" disabled={busy} onClick={() => { if (window.confirm("删除本账号的 AI 配置？")) void aiAction("delete"); }}>删除配置</button></> : null}
      {user.role === "owner" && !ai.configured ? <button className="text-button" disabled={busy} onClick={() => { void aiAction("import-legacy"); }}>导入原服务器 AI 配置</button> : null}</div>
      <p className="hint">识别文字会通过本站服务器发往你配置的 API。未配置时可手动录入或暂存文字。</p>
    </div></details>
    <details className="setting-group"><summary><span>通行密钥</span><small>{passkeys.data?.length || 0} 枚</small></summary><div className="list">
      <p className="hint">在每台常用设备上添加，可用 Face ID、指纹或设备解锁直接登录。</p>
      <div className="account-row"><input className="input" aria-label="通行密钥名称" placeholder="例如 iPhone、Android" maxLength={50} value={passkeyName} onChange={e => setPasskeyName(e.target.value)} /><button className="text-button" disabled={busy} onClick={() => { void addPasskey(); }}>添加</button></div>
      {passkeys.data?.map(item => <div className="account-row" key={item.id}><span>{item.name || "我的设备"}</span><button className="text-button" disabled={busy} onClick={async () => { const name = window.prompt("通行密钥名称", item.name || "我的设备")?.trim(); if (!name || name.length > 50) return; const result = await authClient.passkey.updatePasskey({ id: item.id, name }); if (result.error) setMessage(result.error.message || "重命名失败。"); else await passkeys.refetch(); }}>重命名</button><button className="text-button" disabled={busy} onClick={async () => { if (!window.confirm(`移除通行密钥「${item.name || "我的设备"}」？Google 登录仍可使用。`)) return; const result = await authClient.passkey.deletePasskey({ id: item.id }); if (result.error) setMessage(result.error.message || "移除失败。"); else await passkeys.refetch(); }}>移除</button></div>)}
    </div></details>
    {message ? <p className="hint" role="status">{message}</p> : null}
  </>;
}
