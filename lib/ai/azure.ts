// Azure OpenAI wiring for the chat. Server only: it reads the API key from the environment.
//
// Two facts measured in research/05-benchmark.md shape this file:
// 1. On azure.chat(), reasoningEffort must go under providerOptions.openai. The "azure" key is
//    silently ignored there and the call falls back to the default effort.
// 2. The deployment's token rate limit is tight, so calls are not fanned out and a 429 is a
//    normal outcome that the caller turns into a reply.
import { createAzure } from "@ai-sdk/azure";
import { costUsd, reserve, settle, spent, worstCaseUsd } from "./budget";
import { APICallError, NoObjectGeneratedError, Output, RetryError, generateText } from "ai";
import type { FlexibleSchema } from "ai";

if (typeof window !== "undefined") {
  throw new Error("lib/ai/azure.ts must only run on the server.");
}

export const RESOURCE = "aim-australia-east";
export const DEPLOYMENT = "gpt-5-mini-hiring";

export type Effort = "minimal" | "low" | "medium";

let provider: ReturnType<typeof createAzure> | null = null;

function getProvider() {
  if (!process.env.AZURE_OPENAI_API_KEY) return null;
  provider ??= createAzure({ resourceName: RESOURCE, apiKey: process.env.AZURE_OPENAI_API_KEY });
  return provider;
}

/** The chat model. Throws if the key is missing, so prefer callStructured, which never throws. */
export function chatModel() {
  const p = getProvider();
  if (!p) throw new Error("AZURE_OPENAI_API_KEY is not set.");
  return p.chat(DEPLOYMENT);
}

/** Provider options for azure.chat(). Keep the "openai" key, see note 1 at the top. */
export function modelOptions(effort: Effort = "low") {
  return { openai: { reasoningEffort: effort, store: false } };
}

export type Usage = {
  input: number;
  cachedInput: number;
  output: number;
  reasoning: number;
};

export type FailReason = "timeout" | "content_filter" | "rate_limited" | "invalid_output" | "budget" | "error";

export type CallResult<T> =
  | { ok: true; output: T; usage: Usage; ms: number }
  | { ok: false; reason: FailReason; usage: Usage | null; ms: number };

type UsageLike = {
  inputTokens?: number;
  outputTokens?: number;
  inputTokenDetails?: { cacheReadTokens?: number };
  outputTokenDetails?: { reasoningTokens?: number };
};

function toUsage(u: UsageLike | undefined | null): Usage | null {
  if (!u) return null;
  return {
    input: u.inputTokens ?? 0,
    cachedInput: u.inputTokenDetails?.cacheReadTokens ?? 0,
    output: u.outputTokens ?? 0,
    reasoning: u.outputTokenDetails?.reasoningTokens ?? 0,
  };
}

function classify(error: unknown, timedOut: boolean): FailReason {
  if (timedOut) return "timeout";
  const e = RetryError.isInstance(error) ? error.lastError : error;
  if (NoObjectGeneratedError.isInstance(e)) {
    return e.finishReason === "content-filter" ? "content_filter" : "invalid_output";
  }
  if (APICallError.isInstance(e)) {
    if (e.statusCode === 429) return "rate_limited";
    // Azure's prompt shield and content filter answer 400 with code "content_filter".
    if (e.statusCode === 400 && /content_filter|ResponsibleAIPolicyViolation|jailbreak/i.test(e.responseBody ?? "")) {
      return "content_filter";
    }
  }
  return "error";
}

// One JSON line per call. Never the key, never prompt or output text.
function logCall(entry: Record<string, unknown>) {
  console.info(JSON.stringify({ event: "llm_call", deployment: DEPLOYMENT, ...entry }));
}

/**
 * One structured call to gpt-5-mini. Never throws: every failure, including a timeout, a
 * rate limit and Azure's content filter, comes back as { ok: false, reason } so the caller
 * can leave the page untouched and answer in plain words.
 */
export async function callStructured<T>({
  label,
  system,
  prompt,
  schema,
  effort = "low",
  timeoutMs = 15_000,
  maxOutputTokens = 2_000,
}: {
  label: string;
  system: string;
  prompt: string;
  schema: FlexibleSchema<T>;
  effort?: Effort;
  timeoutMs?: number;
  // Reasoning tokens count against this limit.
  maxOutputTokens?: number;
}): Promise<CallResult<T>> {
  const t0 = performance.now();
  const p = getProvider();
  if (!p) {
    const ms = Math.round(performance.now() - t0);
    logCall({ label, ok: false, reason: "error", detail: "missing AZURE_OPENAI_API_KEY", ms });
    return { ok: false, reason: "error", usage: null, ms };
  }

  // Hard spend cap (lib/ai/budget.ts). A call that could cross it is never sent.
  const worstCase = worstCaseUsd(system.length + prompt.length, maxOutputTokens);
  const reservation = await reserve(worstCase);
  if (!reservation) {
    const ms = Math.round(performance.now() - t0);
    logCall({ label, ok: false, reason: "budget", ms, ...(await spent()) });
    return { ok: false, reason: "budget", usage: null, ms };
  }

  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const r = await generateText({
      model: p.chat(DEPLOYMENT),
      system,
      prompt,
      output: Output.object({ schema }),
      providerOptions: modelOptions(effort),
      maxOutputTokens,
      maxRetries: 1,
      abortSignal: signal,
    });
    const ms = Math.round(performance.now() - t0);
    const usage = toUsage(r.usage) ?? { input: 0, cachedInput: 0, output: 0, reasoning: 0 };
    await settle(reservation, costUsd(usage));
    logCall({ label, ok: true, ms, effort, finishReason: r.finishReason, ...usage, spentUsd: (await spent()).usd });
    return { ok: true, output: r.output as T, usage, ms };
  } catch (error) {
    const ms = Math.round(performance.now() - t0);
    const reason = classify(error, signal.aborted);
    const usage = toUsage((error as { usage?: UsageLike }).usage);
    await settle(reservation, usage ? costUsd(usage) : null);
    logCall({ label, ok: false, reason, ms, effort, ...(usage ?? {}), spentUsd: (await spent()).usd });
    return { ok: false, reason, usage, ms };
  }
}
