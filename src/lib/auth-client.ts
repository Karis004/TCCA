"use client";
import { createAuthClient } from "better-auth/react";
import { getGlobalBroadcastChannel } from "better-auth/client";
import { passkeyClient } from "@better-auth/passkey/client";
export const authClient = createAuthClient({ plugins: [passkeyClient()] });

export async function signOutLedger() {
  await authClient.signOut();
  getGlobalBroadcastChannel().post({ event: "session", data: { trigger: "signout" } });
  window.location.reload();
}
