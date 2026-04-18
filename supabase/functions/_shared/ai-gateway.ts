/**
 * Lovable AI Gateway helpers shared across edge functions.
 *
 * - `AI_GATEWAY_URL` is the canonical OpenAI-compatible chat-completions endpoint.
 * - `callAiGateway()` wraps the standard system+user POST with auth headers,
 *   429/402 rate-limit handling, and JSON parsing of the assistant message.
 *
 * Call sites that need streaming, tool-calling, or non-trivial bodies should
 * still use `fetch(AI_GATEWAY_URL, …)` directly with the shared constant.
 */

export const AI_GATEWAY_URL =
  "https://ai.gateway.lovable.dev/v1/chat/completions";

export class AiGatewayError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AiGatewayError";
    this.status = status;
  }
}

export interface AiCallOptions {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  /**
   * Optional, defaults to a forgiving error message. Consumers can override to
   * propagate provider details upstream.
   */
  errorPrefix?: string;
}

/**
 * Standard "single system + single user message" call against Lovable AI.
 *
 * Returns the assistant message string (trimmed of nothing — caller decides).
 * Throws `AiGatewayError` with `status` set to 429 / 402 / 500 / upstream code
 * so callers can map to user-facing toasts.
 */
export async function callAiGateway({
  apiKey,
  model,
  system,
  user,
  errorPrefix = "AI gateway error",
}: AiCallOptions): Promise<string> {
  const res = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (res.status === 429) {
    throw new AiGatewayError(
      "AI rate limit exceeded. Please try again later.",
      429,
    );
  }
  if (res.status === 402) {
    throw new AiGatewayError(
      "AI credits exhausted. Please add funds.",
      402,
    );
  }
  if (!res.ok) {
    const t = await res.text();
    throw new AiGatewayError(
      `${errorPrefix} [${res.status}]: ${t.slice(0, 300)}`,
      res.status,
    );
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}
