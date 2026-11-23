"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getGlobalBroadcastChannel } from "better-auth/client";
import { authClient, signOutLedger } from "@/lib/auth-client";
import { clearAnalytics } from "@/lib/useAnalyticsData";
import type { AppUser } from "@/lib/privateApi";
import type { SettingsSnapshot } from "@/lib/userSettings";

type LedgerAccount = { user: AppUser; settings: SettingsSnapshot };

export function AuthGate({ children }: { children: (user: AppUser, settings: SettingsSnapshot) => React.ReactNode }) {
  const [account, setAccount] = useState<LedgerAccount | null>(null);
  const [pending, setPending] = useState(true);
  const [banned, setBanned] = useState(false);
  const checkNow = useRef<() => void>(() => {});
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    let controller: AbortController | null = null;
    let userId: string | undefined;
    let lastChecked = 0;
    function changeAccount(next: LedgerAccount | null) {
      if (userId && userId !== next?.user.id) clearAnalytics();
      userId = next?.user.id;
      setAccount(next);
    }
    const load = async () => {
      if (controller) return;
      const request = new AbortController();
      controller = request;
      lastChecked = Date.now();
      try {
        const response = await fetch("/api/me?settings=1", { signal: request.signal, cache: "no-store" });
        const data = await response.json();
        if (request.signal.aborted) return;
        if (response.status === 401 || response.status === 403) {
          changeAccount(null);
          setBanned(response.status === 403);
          setError(response.status === 403 ? data.error : "");
          return;
        }
        if (!response.ok) throw new Error(data.error || "暂时无法读取账户。");
        setBanned(false);
        changeAccount(data);
        setError("");
      } catch (e) {
        if (!request.signal.aborted && !userId) setError(e instanceof Error ? e.message : "登录状态读取失败。");
      } finally {
        if (!request.signal.aborted) { controller = null; setPending(false); }
      }
    };
    checkNow.current = () => { setPending(true); void load(); };
    const revalidate = () => { if (document.visibilityState === "visible" && Date.now() - lastChecked > 30_000) void load(); };
    const broadcasts = getGlobalBroadcastChannel();
    const stopListening = broadcasts.setup();
    const unsubscribe = broadcasts.subscribe(message => {
      controller?.abort();
      controller = null;
      if (message.data?.trigger === "signout") { changeAccount(null); setBanned(false); setError(""); }
      void load();
    });
    void load();
    const timer = setInterval(revalidate, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", revalidate);
    window.addEventListener("focus", revalidate);
    return () => {
      controller?.abort(); clearInterval(timer); stopListening(); unsubscribe();
      document.removeEventListener("visibilitychange", revalidate);
      window.removeEventListener("focus", revalidate);
    };
  }, []);
  if (account) return <>{children(account.user, account.settings)}</>;
  if (pending) return <main className="app-shell"><section className="panel login-panel"><div className="brand">TCCA</div><p className="hint">正在打开账本…</p></section></main>;
  async function login(method: "google" | "passkey") {
    setBusy(true); setError("");
    try {
      const result = method === "google" ? await authClient.signIn.social({ provider: "google", callbackURL: "/" }) : await authClient.signIn.passkey();
      if (result.error) throw new Error(result.error.message || "登录未完成，请重试。");
      if (method === "passkey") window.location.reload();
    } catch (e) { setError(e instanceof Error ? e.message : "登录未完成。"); }
    finally { setBusy(false); }
  }
  return <main className="app-shell"><section className="panel login-panel"><div className="brand">TCCA</div><h1>自己的账，慢慢记。</h1>
    {error ? <p className="notice error" role="alert">{error}</p> : null}
    <button className="primary-button" disabled={busy} onClick={() => { void login("google"); }}>使用 Google 登录</button>
    <button className="text-button" disabled={busy} onClick={() => { void login("passkey"); }}>使用通行密钥登录</button>
    <div className="account-links"><Link href="/privacy">隐私说明</Link><Link href="/terms">使用条款</Link></div>
    {banned ? <button className="text-button" onClick={() => { void signOutLedger(); }}>退出当前账号</button> : error ? <button className="text-button" disabled={busy} onClick={() => checkNow.current()}>重试打开账本</button> : null}
  </section></main>;
}
