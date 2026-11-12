"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
type ManagedUser = { id: string; name: string; email: string; role: string; banned: boolean; counts: Record<string, number>; recentErrors: number };
export function AdminPanel() {
  const [users, setUsers] = useState<ManagedUser[]>([]); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const [open, setOpen] = useState(false);
  async function load() { const response = await fetch("/api/admin/users", { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setUsers(data.users); setOpen(data.registrationsOpen); }
  useEffect(() => { void load().catch(e => setMessage(e.message)); }, []);
  async function act(user: ManagedUser, action: "ban" | "unban" | "clear" | "restore" | "purge") {
    let confirmation: string | null = null;
    if (action === "clear" || action === "restore" || action === "purge") { confirmation = window.prompt(`${action === "clear" ? "将该用户的账单、预设和暂存移入可恢复的清理区" : action === "restore" ? "恢复该用户被清理的数据" : "彻底删除该用户清理区的数据，此操作无法在网站内撤销"}。输入邮箱 ${user.email} 确认：`); if (confirmation === null) return; }
    else if (!window.confirm(`${action === "ban" ? "停用" : "恢复"} ${user.email}？`)) return;
    setBusy(true); setMessage("");
    try { const response = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: user.id, action, confirmation: confirmation || undefined }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); await load(); setMessage("操作已完成。"); }
    catch (e) { setMessage(e instanceof Error ? e.message : "操作失败。"); } finally { setBusy(false); }
  }
  return <main className="app-shell"><section className="panel"><div className="panel-head"><span>用户管理</span><Link href="/">返回账本</Link></div><p className="hint">新用户注册：{open ? "开放" : "已关闭"}</p>{message ? <p className="notice" role="status">{message}</p> : null}
    <div className="list">{users.map(user => <article className="panel admin-user" key={user.id}><div className="account-row"><strong>{user.name || "用户"}</strong><span className="hint">{user.role === "owner" ? "站长" : user.banned ? "已停用" : "正常"}</span></div><p className="hint">{user.email}</p><p className="hint">流水 {user.counts.transactions} · 预设 {user.counts.transaction_presets} · 暂存 {user.counts.pending_inputs} · 近7天错误 {user.recentErrors}</p>
    {user.role !== "owner" ? <div className="account-links"><button className="text-button" disabled={busy} onClick={() => { void act(user, user.banned ? "unban" : "ban"); }}>{user.banned ? "解封" : "封禁"}</button>{user.banned ? <><button className="text-button" disabled={busy} onClick={() => { void act(user, "clear"); }}>清理数据</button><button className="text-button" disabled={busy} onClick={() => { void act(user, "restore"); }}>恢复清理数据</button><button className="text-button" disabled={busy} onClick={() => { void act(user, "purge"); }}>彻底删除清理数据</button></> : null}</div> : null}</article>)}</div>
  </section></main>;
}
