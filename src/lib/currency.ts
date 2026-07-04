const currencyAliases: Record<string, string[]> = {
  HKD: ["hkd", "港币", "港幣", "港元", "八达通", "八達通", "hk$", "hong kong dollar"],
  USD: ["usd", "美元", "美金", "us$", "$"],
  EUR: ["eur", "欧元", "歐元", "€"],
  JPY: ["jpy", "日元", "日圆", "日圓", "円", "¥"],
  GBP: ["gbp", "英镑", "英鎊", "£"],
  MOP: ["mop", "澳门币", "澳門幣", "澳门元", "澳門元"],
  TWD: ["twd", "台币", "台幣", "新台币", "新台幣"],
  SGD: ["sgd", "新币", "新幣", "新加坡元"],
  CNY: ["cny", "rmb", "人民币", "人民幣", "人民币元", "元", "块", "塊"]
};

export function normalizeCurrencyCode(value?: string | null) {
  if (!value) return null;

  const cleaned = value.trim().toUpperCase();
  if (!cleaned) return null;
  if (cleaned === "RMB") return "CNY";
  if (/^[A-Z]{3}$/.test(cleaned)) return cleaned;

  const lower = value.trim().toLowerCase();
  for (const [code, aliases] of Object.entries(currencyAliases)) {
    if (aliases.some((alias) => lower === alias || lower.includes(alias))) {
      return code;
    }
  }

  return cleaned;
}

export function inferCurrencyFromText(text: string) {
  const lower = text.toLowerCase();

  for (const [code, aliases] of Object.entries(currencyAliases)) {
    if (code === "CNY") continue;
    if (aliases.some((alias) => lower.includes(alias))) {
      return code;
    }
  }

  if (currencyAliases.CNY.some((alias) => lower.includes(alias))) {
    return "CNY";
  }

  return null;
}

export function resolveCurrency(parsedCurrency: string | null | undefined, sourceText: string) {
  const textCurrency = inferCurrencyFromText(sourceText);
  const normalizedParsed = normalizeCurrencyCode(parsedCurrency);

  if (textCurrency && normalizedParsed !== textCurrency) {
    return textCurrency;
  }

  return normalizedParsed || textCurrency || "CNY";
}
