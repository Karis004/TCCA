import http from "node:http";
import https from "node:https";
import { z } from "zod";
import { ledgerToday } from "@/lib/transactionPresets";
import { buildLedgerPrompt } from "@/lib/aiPrompt";
import { resolveAiTarget, redactAiError } from "@/lib/aiSecurity";
import type { AiCredentials } from "@/lib/aiSecurity";

type ParseOptions = {
  categories?: string[];
  paymentMethods?: string[];
  referenceDate?: string;
  defaultCurrency?: string;
  shortcut?: boolean;
  credentials?: AiCredentials;
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

function describeNetworkError(error: unknown) {
  if (!(error instanceof Error)) {
    return "unknown network error";
  }

  const code = (error as Error & { code?: string }).code;
  const address = (error as Error & { address?: string }).address;
  return [error.message, code, address].filter(Boolean).join(" / ");
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

function parseAssistantJson(content: string): unknown {
  const trimmed = content.trim();
  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  return JSON.parse(withoutFence);
}

function parseLedgerResponse(content: string, shortcut: boolean) {
  const raw = parseAssistantJson(content) as any;
  const candidates = Array.isArray(raw) ? raw : raw?.transactions || raw?.items || raw?.data || [raw];

  if (shortcut && Array.isArray(candidates) && !candidates.length) {
    throw new Error("未能从截图文字中提取交易。可以补充或编辑文字后重试。");
  }

  if (!Array.isArray(candidates) || !candidates.length || candidates.length > 50) {
    throw new Error("AI returned no ledger transactions.");
  }

  return candidates.map((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error("AI returned an invalid ledger object.");
    }

    return parsedSchema.parse(candidate);
  });
}

export async function parseLedgerText(input: string, options: ParseOptions = {}) {
  if (!options.credentials) {
    throw new Error("请先在设置中填写自己的 AI 配置。");
  }

  const today = options.referenceDate || ledgerToday();
  const prompt = buildLedgerPrompt(input, today, options);
  return requestJsonAi(options.credentials, prompt, content => parseLedgerResponse(content, Boolean(options.shortcut)), { temperature: 0, attempts: 2 });
}

export async function requestJsonAi<T>(
  credentials: AiCredentials,
  prompt: { system: string; user: string },
  parse: (content: string) => T,
  options: { temperature: number; attempts: number }
) {
  const { baseUrl, apiKey, model } = credentials;
  if (!baseUrl || !apiKey || !model) throw new Error("请先在设置中填写自己的 AI 配置。");
  const requestBody = JSON.stringify({
    model,
    stream: false,
    temperature: options.temperature,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user }
    ],
    response_format: { type: "json_object" }
  });

  let lastError: unknown;

  for (let attempt = 0; attempt < options.attempts; attempt += 1) {
    try {
      return parse(await requestAi(getChatCompletionsUrl(baseUrl), apiKey, requestBody, credentials));
    } catch (error) {
      lastError = error;
      if (!(error instanceof AiRequestError) || !error.retryable || attempt === options.attempts - 1) {
        const message = redactAiError(error instanceof Error ? error.message : "AI 请求失败。", credentials);
        throw new AiRequestError(message, error instanceof AiRequestError && error.retryable);
      }
      await delay(900);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("AI request failed.");
}

export function validateAiJson<S extends z.ZodTypeAny>(schema: S) {
  return (content: string): z.infer<S> => schema.parse(parseAssistantJson(content));
}

export function canRetryAi(error: unknown) {
  return error instanceof AiRequestError && error.retryable;
}

async function requestAi(url: string, apiKey: string, requestBody: string, credentials: AiCredentials) {
  let response: { ok: boolean; status: number; text: string };

  try {
    response = await postText(url, apiKey, requestBody, credentials);
  } catch (error) {
    throw new AiRequestError(`AI API 网络错误: ${describeNetworkError(error)}`, true);
  }

  const responseText = response.text;

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

  if (typeof content !== "string") throw new Error("AI returned invalid content.");
  return content;
}

async function postText(url: string, apiKey: string, requestBody: string, credentials: AiCredentials) {
  const checked = await resolveAiTarget(url, credentials.trustedOrigin);
  return new Promise<{ ok: boolean; status: number; text: string }>((resolve, reject) => {
    const target = checked.target;
    const transport = target.protocol === "http:" ? http : https;
    const request = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: "POST",
        lookup: (_host: string, options: any, callback: any) => options?.all
          ? callback(null, [checked.address]) : callback(null, checked.address.address, checked.address.family),
        timeout: 30000,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(requestBody),
          Authorization: `Bearer ${apiKey}`
        }
      },
      (response) => {
        response.on("error", reject);
        response.on("aborted", () => reject(new Error("AI 响应中断。")));
        const chunks: Buffer[] = [];
        let responseBytes = 0;

        response.on("data", (chunk) => {
          responseBytes += chunk.length;
          if (responseBytes > 2 * 1024 * 1024) { request.destroy(new Error("AI 响应过大。")); return; }
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        response.on("end", () => {
          const status = response.statusCode || 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            text: Buffer.concat(chunks).toString("utf8")
          });
        });
      }
    );
    const deadline = setTimeout(() => request.destroy(new Error("request timed out")), 35000);
    request.on("close", () => clearTimeout(deadline));

    request.on("timeout", () => {
      request.destroy(new Error("request timed out"));
    });
    request.on("error", reject);
    request.write(requestBody);
    request.end();
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
