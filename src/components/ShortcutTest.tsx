"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function ShortcutTest() {
  const [endpoint, setEndpoint] = useState("");
  const [token, setToken] = useState("");
  const [text, setText] = useState("支付成功\n星辰咖啡\n原价 HKD 48.00\n优惠 HKD 19.50\n实付 HKD 28.50\n支付方式 八达通");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [openUrl, setOpenUrl] = useState("");

  useEffect(() => { setEndpoint(`${window.location.origin}/api/shortcuts/receipt`); }, []);

  async function createKey() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/shortcuts/key", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "生成失败。");
      setToken(data.token);
      setMessage("密钥已生成，可复制到快捷指令。原测试密钥已失效。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "生成失败。");
    } finally { setBusy(false); }
  }

  async function submit() {
    setBusy(true);
    setMessage("");
    setOpenUrl("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.trim()}` },
        body: JSON.stringify({ text })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "提交失败。");
      setOpenUrl(data.openUrl);
      setMessage(`HTTP ${response.status}，识别完成，账单待确认。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "提交失败。");
    } finally { setBusy(false); }
  }

  return <main className="app-shell">
    <section className="panel settings-block">
      <h1>快捷指令本地测试</h1>
      <div className="settings-form">
        <label className="field"><span>POST 地址</span><input className="input" readOnly value={endpoint} onFocus={event => event.currentTarget.select()} /></label>
        <label className="field"><span>快捷指令密钥</span><input className="input" value={token} autoComplete="off" onChange={event => setToken(event.target.value)} onFocus={event => event.currentTarget.select()} /></label>
        <button type="button" className="text-button" disabled={busy} onClick={() => void createKey()}>生成或更换测试密钥</button>
        <label className="field"><span>识别文字</span><textarea className="textarea" value={text} maxLength={12000} onChange={event => setText(event.target.value)} /></label>
        <button type="button" className="primary-button" disabled={busy || !token.trim() || !text.trim()} onClick={() => void submit()}>{busy ? "处理中…" : "发送测试 POST"}</button>
        {message ? <p className="settings-feedback" role="status">{message}</p> : null}
        {openUrl ? <a className="primary-button" href={openUrl}>查看待确认账单</a> : null}
        <Link className="text-button" href="/">返回账本</Link>
      </div>
    </section>
  </main>;
}
