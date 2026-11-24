"use client";
import { createAuthClient } from "better-auth/react";
import { getGlobalBroadcastChannel } from "better-auth/client";
import { passkeyClient } from "@better-auth/passkey/client";
import { accountSettingsCache } from "./accountSettingsCache";
export const authClient = createAuthClient({ plugins: [passkeyClient()] });

export async function signOutLedger() {
  accountSettingsCache.clear();
  await authClient.signOut();
  getGlobalBroadcastChannel().post({ event: "session", data: { trigger: "signout" } });
  window.location.reload();
}
