"use client";

import { useState } from "react";
import type { ShortcutConfiguration } from "@/lib/accountSettingsCache";

type Props = {
  configuration: ShortcutConfiguration;
  loaded: boolean;
  onChange: (configuration: ShortcutConfiguration) => void;
};

export function ShortcutSettings({ configuration, loaded, onChange }: Props) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const { configured, token } = configuration;
  const authorization = token ? "Bearer " + token : "";
  const endpoint = typeof window === "undefined" ? "" : window.location.origin + "/api/shortcuts/receipt";

  async function updateKey(method: "POST" | "DELETE") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/shortcuts/key", { method });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "操作失败，请稍后重试。");
      onChange({ configured: data.configured, token: data.token || "" });
      setMessage(method === "POST" ? "密钥已保存。" : "密钥已停用。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败，请稍后重试。");
    } finally { setBusy(false); }
  }

  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setMessage("已复制。"); }
    catch { setMessage("请选中文字并手动复制。"); }
  }

  return <div className="setting-group-body">
    <div className="settings-form">
      <div className="field"><label htmlFor="shortcut-endpoint">POST 地址</label><div className="settings-key-row">
        <input id="shortcut-endpoint" className="input" readOnly value={endpoint} onFocus={event => event.currentTarget.select()} />
        <button className="text-button" type="button" onClick={() => void copy(endpoint)}>复制</button>
      </div></div>
      {configured ? <div className="field"><label htmlFor="shortcut-token">Authorization</label><div className="settings-key-row">
        <input id="shortcut-token" className="input" value={authorization} readOnly autoComplete="off" placeholder={token ? "" : "旧密钥需更换一次以支持重新查看"} onFocus={event => event.currentTarget.select()} />
        <button className="text-button" type="button" disabled={!authorization} onClick={() => void copy(authorization)}>复制</button>
      </div></div> : null}
      <div className="settings-actions">
        <button className={configured ? "text-button" : "primary-button"} type="button" disabled={busy || !loaded} onClick={() => {
          if (!configured || window.confirm("更换后请更新快捷指令中的密钥。继续吗？")) void updateKey("POST");
        }}>{configured ? "更换密钥" : "生成密钥"}</button>
        {configured ? <button className="text-button" type="button" disabled={busy} onClick={() => {
          if (window.confirm("停用快捷指令的提交权限？")) void updateKey("DELETE");
        }}>停用密钥</button> : null}
      </div>
    </div>
    {message ? <p className="settings-feedback" role="status">{message}</p> : null}
  </div>;
}
