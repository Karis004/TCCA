type FxResponse = {
  result?: string;
  rates?: Record<string, number>;
  conversion_rates?: Record<string, number>;
  "error-type"?: string;
};

const cache = new Map<string, { rate: number; expiresAt: number }>();
const inFlight = new Map<string, Promise<number>>();

export function getCachedRateToCny(currency: string) {
  const code = currency.toUpperCase();
  if (code === "CNY" || code === "RMB") return 1;

  const cached = cache.get(code);
  return cached && cached.expiresAt > Date.now() ? cached.rate : undefined;
}

export async function getRateToCny(currency: string) {
  const code = currency.toUpperCase();
  const cached = getCachedRateToCny(code);
  if (cached !== undefined) return cached;
  const pending = inFlight.get(code);
  if (pending) return pending;

  const request = fetchRateToCny(code).finally(() => inFlight.delete(code));
  inFlight.set(code, request);
  return request;
}

async function fetchRateToCny(code: string) {

  const response = await fetch(getFxUrl(code), {
    next: { revalidate: 1800 }
  });

  if (!response.ok) {
    throw new Error(`FX request failed: ${response.status}`);
  }

  const data = (await response.json()) as FxResponse;
  if (data.result === "error") {
    throw new Error(`FX request failed: ${data["error-type"] || "unknown error"}`);
  }

  const rate = data.rates?.CNY || data.conversion_rates?.CNY;

  if (!rate || Number.isNaN(rate)) {
    throw new Error(`No CNY rate returned for ${code}`);
  }

  cache.set(code, { rate, expiresAt: Date.now() + 30 * 60 * 1000 });
  return rate;
}

function getFxUrl(code: string) {
  const apiKey = process.env.FX_API_KEY;

  if (apiKey) {
    const keyedBaseUrl = (process.env.FX_API_BASE_URL || "https://v6.exchangerate-api.com/v6").replace(/\/$/, "");
    return `${keyedBaseUrl}/${encodeURIComponent(apiKey)}/latest/${encodeURIComponent(code)}`;
  }

  const openBaseUrl = (process.env.FX_API_BASE_URL || "https://open.er-api.com/v6/latest").replace(/\/$/, "");
  return `${openBaseUrl}/${encodeURIComponent(code)}`;
}
