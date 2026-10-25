import { resolveCurrency } from "@/lib/currency";
import { parseLedgerText } from "@/lib/aiClient";
import { getRateToCny } from "@/lib/fx";
import { ledgerToday } from "@/lib/transactionPresets";

export async function parseDrafts(text: string, options: Parameters<typeof parseLedgerText>[1] = {}) {
  const startedAt = Date.now();
  const parsed = await parseLedgerText(text, options);
  const parseDurationMs = Date.now() - startedAt;
  return Promise.all(parsed.map(async (item) => {
    const currency = resolveCurrency(item.currency, text, parsed.length > 1);
    const fxRateToCny = await getRateToCny(currency);
    const amount = item.amount || 0;
    return { ...item, date: item.date || options.referenceDate || ledgerToday(), needsReview: item.needsReview || !item.date, currency, amount, amountCny: Number((amount * fxRateToCny).toFixed(2)), fxRateToCny, parseDurationMs, originalText: text };
  }));
}
