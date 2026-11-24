"use client";

import { useEffect, useState } from "react";

export function ShortcutSettings() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/shortcuts/key", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("读取失败");
      const data = await response.json();
      if (!controller.signal.aborted) setConfigured(data.configured);
    }).catch(() => { if (!controller.signal.aborted) setMessage("读取快捷指令设置失败。"); });
    return () => controller.abort();
  }, [retry]);

  async function updateKey(method: "POST" | "DELETE") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/shortcuts/key", { method });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "操作失败，请稍后重试。");
      setConfigured(data.configured);
      setToken(data.token || "");
      setMessage(method === "POST" ? "请复制密钥。关闭这项设置后，密钥无法再次查看。" : "快捷指令密钥已停用。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  const endpoint = `${window.location.origin}/api/shortcuts/receipt`;

  return <div className="setting-group-body">
    <label className="field"><span>POST 地址</span><input className="input" readOnly value={endpoint} onFocus={event => event.currentTarget.select()} /></label>
    {configured === null ? message
      ? <button className="text-button" type="button" onClick={() => { setMessage(""); setRetry(current => current + 1); }}>重试</button>
      : <p className="settings-feedback">正在读取设置…</p>
      : <div className="settings-actions">
        <button className="primary-button" type="button" disabled={busy} onClick={() => {
          if (!configured || window.confirm("更换密钥后，使用旧密钥的快捷指令会失效。继续吗？")) void updateKey("POST");
        }}>{configured ? "更换密钥" : "生成密钥"}</button>
        {configured ? <button className="text-button" type="button" disabled={busy} onClick={() => {
          if (window.confirm("停用快捷指令的提交权限？")) void updateKey("DELETE");
        }}>停用密钥</button> : null}
      </div>}
    {token ? <div className="field"><label htmlFor="shortcut-token">快捷指令密钥</label><div className="settings-key-row">
      <input className="input" id="shortcut-token" value={token} readOnly autoComplete="off" onFocus={event => event.currentTarget.select()} />
      <button className="text-button" type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(token); setMessage("密钥已复制。"); }
        catch { setMessage("请选中密钥并手动复制。"); }
      }}>复制</button>
    </div></div> : null}
    {message ? <p className="settings-feedback" role="status">{message}</p> : null}
  </div>;
}
