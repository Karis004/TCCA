import { z } from "zod";
import { categories, paymentMethods, currencies } from "../presets/ledger";

const named = z.object({ id: z.string().min(1).max(100), name: z.string().trim().max(100) });
const category = named.extend({ type: z.enum(["expense", "income", "transfer", "refund"]).optional(), includeInAnalytics: z.boolean().optional() });
export const settingsSchema = z.object({
  categories: z.array(category).max(100), paymentMethods: z.array(named).max(100),
  defaultCurrency: z.enum(currencies as [string, ...string[]]).default("HKD"),
  analysisCurrency: z.enum(["HKD", "CNY"]).default("HKD")
}).refine((data) => new Set(data.categories.map(x => x.id)).size === data.categories.length && new Set(data.paymentMethods.map(x => x.id)).size === data.paymentMethods.length, "列表编号不能重复。");
export type UserSettings = z.infer<typeof settingsSchema>;
export type SettingsSnapshot = UserSettings & { version: number; saved: boolean };
export function defaultSettings(): SettingsSnapshot {
  return { categories: structuredClone(categories), paymentMethods: structuredClone(paymentMethods), defaultCurrency: "HKD", analysisCurrency: "HKD", version: 0, saved: false };
}
