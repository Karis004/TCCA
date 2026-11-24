export type ShortcutConfiguration = { configured: boolean; token: string };
export type AccountConfiguration = {
  ai: { baseUrl: string; model: string; configured: boolean };
  shortcut: ShortcutConfiguration;
};

export const accountSettingsCache = new Map<string, AccountConfiguration>();
