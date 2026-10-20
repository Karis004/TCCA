export const DEFAULT_CURRENCY = "HKD";

// Only currency names or country-qualified codes are explicit. Voice input symbols are ambiguous.
const currencyAliases: Record<string, string[]> = {
  HKD: ["hkd", "港币", "港幣", "港元", "hk$", "hong kong dollar"],
  USD: ["usd", "美元", "美金", "us$", "us dollar"],
  EUR: ["eur", "欧元", "歐元", "euro"],
  JPY: ["jpy", "日元", "日圆", "日圓", "japanese yen"],
  GBP: ["gbp", "英镑", "英鎊", "british pound"],
  MOP: ["mop", "澳门币", "澳門幣", "澳门元", "澳門元"],
  TWD: ["twd", "台币", "台幣", "新台币", "新台幣"],
  SGD: ["sgd", "新币", "新幣", "新加坡元"],
  CNY: ["cny", "rmb", "人民币", "人民幣"]
};

function hasAlias(text: string, alias: string) {
  if (/^[a-z]{3}$/.test(alias)) {
    return new RegExp(`(^|[^a-z])${alias}([^a-z]|$)`, "i").test(text);
  }
  return text.toLowerCase().includes(alias);
}

export function explicitCurrencies(text: string) {
  return Object.entries(currencyAliases)
    .filter(([, aliases]) => aliases.some((alias) => hasAlias(text, alias)))
    .map(([code]) => code);
}

export function normalizeCurrencyCode(value?: string | null) {
  if (!value?.trim()) return null;
  const cleaned = value.trim().toUpperCase();
  if (cleaned === "RMB") return "CNY";
  if (/^[A-Z]{3}$/.test(cleaned)) return cleaned;
  const explicit = explicitCurrencies(value);
  if (explicit.length === 1) return explicit[0];
  if (/^[¥￥$€£円元块塊\s]+$/.test(value.trim())) return DEFAULT_CURRENCY;
  return cleaned;
}

export function inferCurrencyFromText(text: string) {
  const codes = explicitCurrencies(text);
  return codes.length === 1 ? codes[0] : null;
}

export function resolveCurrency(parsedCurrency: string | null | undefined, sourceText: string, multipleTransactions = false) {
  const explicit = explicitCurrencies(sourceText);
  if (!explicit.length) return DEFAULT_CURRENCY;
  if (!multipleTransactions && explicit.length === 1) return explicit[0];
  const normalized = normalizeCurrencyCode(parsedCurrency);
  // In a multi-bill input, keep each AI-selected currency only when it was explicitly named.
  // An unqualified bill remains HKD instead of inheriting another bill's currency.
  return normalized && explicit.includes(normalized) ? normalized : DEFAULT_CURRENCY;
}
