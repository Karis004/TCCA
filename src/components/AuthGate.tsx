"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { clearAnalytics } from "@/lib/useAnalyticsData";
import type { AppUser } from "@/lib/privateApi";
import type { SettingsSnapshot } from "@/lib/userSettings";

export function AuthGate({ children }: { children: (user: AppUser, settings: SettingsSnapshot) => React.ReactNode }) {
  const session = authClient.useSession();
  const [account, setAccount] = useState<{ user: AppUser; settings: SettingsSnapshot } | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    setAccount(null); setError(""); clearAnalytics();
    if (!session.data?.user.id) return;
    let active = true; const controller = new AbortController();
    const load = async () => {
      try {
        const responses = await Promise.all([fetch("/api/me", { signal: controller.signal, cache: "no-store" }), fetch("/api/settings", { signal: controller.signal, cache: "no-store" })]);
        const [user, settings] = await Promise.all(responses.map(r => r.json()));
        if (!active) return;
        if (!responses.every(r => r.ok)) { setAccount(null); throw new Error(user.error || settings.error || "暂时无法读取账户。"); }
        setAccount({ user, settings }); setError("");
      } catch (e) { if (active) setError(e instanceof Error ? e.message : "登录状态读取失败。"); }
    };
    void load();
    const timer = setInterval(() => { void authClient.getSession().then(() => load()).catch(() => {}); }, 5 * 60 * 1000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, [session.data?.user.id]);
  if (session.isPending || (session.data && !account && !error)) return <main className="app-shell"><section className="panel login-panel"><div className="brand">TCCA</div><p className="hint">正在打开账本…</p></section></main>;
  if (account && account.user.id === session.data?.user.id) return <>{children(account.user, account.settings)}</>;
  async function login(method: "google" | "passkey") {
    setBusy(true); setError("");
    try {
      const result = method === "google" ? await authClient.signIn.social({ provider: "google", callbackURL: "/" }) : await authClient.signIn.passkey();
      if (result.error) throw new Error(result.error.message || "登录未完成，请重试。");
      if (method === "passkey") window.location.reload();
    } catch (e) { setError(e instanceof Error ? e.message : "登录未完成。"); }
    finally { setBusy(false); }
  }
  return <main className="app-shell"><section className="panel login-panel"><div className="brand">TCCA</div><h1>自己的账，慢慢记。</h1><p className="hint">一句话整理收支。账单、预设与个人设置随账号保存。</p>
    {error ? <p className="notice error" role="alert">{error}</p> : null}
    <button className="primary-button" disabled={busy} onClick={() => { void login("google"); }}>使用 Google 登录</button>
    <button className="text-button" disabled={busy} onClick={() => { void login("passkey"); }}>使用通行密钥登录</button>
    <p className="hint">首次使用 Google 登录，之后可在设置中添加通行密钥。</p>
    <div className="account-links"><Link href="/privacy">隐私说明</Link><Link href="/terms">使用条款</Link></div>
    {session.data ? <button className="text-button" onClick={() => { void authClient.signOut().then(() => window.location.reload()); }}>退出当前账号</button> : null}
  </section></main>;
}
