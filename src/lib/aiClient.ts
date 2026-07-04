import { z } from "zod";
import { buildLedgerPrompt } from "@/lib/aiPrompt";

type ParseOptions = {
  categories?: string[];
  paymentMethods?: string[];
};

class AiRequestError extends Error {
  retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "AiRequestError";
    this.retryable = retryable;
  }
}

const parsedSchema = z.object({
  type: z.enum(["expense", "income", "transfer", "refund"]),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  date: z.string().nullable(),
  category: z.string().nullable(),
  paymentMethod: z.string().nullable(),
  merchant: z.string().nullable(),
  tags: z.array(z.string()).default([]),
  note: z.string().nullable(),
  confidence: z.number().min(0).max(1).default(0.5),
  needsReview: z.boolean().default(true)
});

function getChatCompletionsUrl(apiBaseUrl: string) {
  const base = apiBaseUrl.trim().replace(/\/$/, "");

  if (base.endsWith("/chat/completions")) {
    return base;
  }

  if (base.endsWith("/v1")) {
    return `${base}/chat/completions`;
  }

  return `${base}/v1/chat/completions`;
}

function looksLikeHtml(text: string) {
  const head = text.trim().slice(0, 120).toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html") || head.includes("<title>new api</title>");
}

function describeBadAiResponse(status: number, body: string) {
  if (looksLikeHtml(body)) {
    return {
      message: [
        `AI request returned HTML instead of JSON. Status: ${status}.`,
        "This usually means AI_API_BASE_URL points to the New API web UI root.",
        "Use the API base URL ending with /v1, or provide the full /v1/chat/completions path."
      ].join(" "),
      retryable: false
    };
  }

  const parsed = parseErrorBody(body);
  const message = parsed ? `AI API 返回错误 ${status}: ${parsed}` : `AI API 返回错误 ${status}: ${body.slice(0, 500)}`;
  const lower = `${status} ${body}`.toLowerCase();
  const quotaLike = ["quota", "billing", "insufficient", "credit", "余额", "额度", "token用完", "tokens used"].some((item) => lower.includes(item));
  const retryable =
    !quotaLike &&
    ([408, 409, 425, 429, 500, 502, 503, 504].includes(status) ||
      ["temporarily unavailable", "timeout", "timed out", "overloaded", "try again", "upstream"].some((item) => lower.includes(item)));

  return { message, retryable };
}

function parseErrorBody(body: string) {
  try {
    const data = JSON.parse(body);
    const error = data.error || data;
    return [error.message, error.type, error.code].filter(Boolean).join(" / ");
  } catch {
    return body.trim();
  }
}

function parseAssistantJson(content: string) {
  const trimmed = content.trim();
  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const raw = JSON.parse(withoutFence);
  const candidate = Array.isArray(raw) ? raw[0] : raw;

  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("AI returned an invalid ledger object.");
  }

  return parsedSchema.parse(candidate);
}

export async function parseLedgerText(input: string, options: ParseOptions = {}) {
  const apiBaseUrl = process.env.AI_API_BASE_URL;
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;

  if (!apiBaseUrl || !apiKey || !model) {
    throw new Error("Missing AI_API_BASE_URL, AI_API_KEY, or AI_MODEL.");
  }

  const today = new Date().toISOString().slice(0, 10);
  const prompt = buildLedgerPrompt(input, today, options);
  const requestBody = JSON.stringify({
    model,
    stream: false,
    temperature: 0,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user }
    ],
    response_format: { type: "json_object" }
  });

  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await requestAndParseAi(getChatCompletionsUrl(apiBaseUrl), apiKey, requestBody);
    } catch (error) {
      lastError = error;
      if (!(error instanceof AiRequestError) || !error.retryable || attempt === 1) {
        throw error;
      }
      await delay(900);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("AI request failed.");
}

async function requestAndParseAi(url: string, apiKey: string, requestBody: string) {
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: requestBody
    });
  } catch (error) {
    throw new AiRequestError(error instanceof Error ? `AI API 网络错误: ${error.message}` : "AI API 网络错误。", true);
  }

  const responseText = await response.text();

  if (!response.ok) {
    const error = describeBadAiResponse(response.status, responseText);
    throw new AiRequestError(error.message, error.retryable);
  }

  if (looksLikeHtml(responseText)) {
    const error = describeBadAiResponse(response.status, responseText);
    throw new AiRequestError(error.message, error.retryable);
  }

  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`AI response is not valid JSON: ${responseText.slice(0, 300)}`);
  }

  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("AI returned empty content.");
  }

  return parseAssistantJson(content);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
