import { resolveCurrency } from "@/lib/currency";
import { parseLedgerText } from "@/lib/aiClient";
import { getCachedRateToCny } from "@/lib/fx";
import { ledgerToday } from "@/lib/transactionPresets";
import { shortcutPaymentMethod } from "@/lib/shortcutInput";

export async function parseDrafts(text: string, options: Parameters<typeof parseLedgerText>[1] = {}) {
  const startedAt = Date.now();
  const parsed = await parseLedgerText(text, options);
  const parseDurationMs = Date.now() - startedAt;
  return parsed.map(item => {
    const currency = resolveCurrency(item.currency, text, !!options.shortcut || parsed.length > 1, options.defaultCurrency);
    const paymentMethod = options.shortcut
      ? shortcutPaymentMethod(item.paymentMethod, options.paymentMethods)
      : item.paymentMethod;
    const fxRateToCny = getCachedRateToCny(currency);
    const amount = options.shortcut ? Math.abs(item.amount || 0) : item.amount || 0;
    return {
      ...item, date: item.date || options.referenceDate || ledgerToday(),
      needsReview: item.needsReview || !item.date || Boolean(options.shortcut && (!amount || !paymentMethod)),
      currency, amount, paymentMethod, parseDurationMs, originalText: text,
      ...(fxRateToCny !== undefined ? { amountCny: Number((amount * fxRateToCny).toFixed(2)), fxRateToCny } : {})
    };
  });
}
