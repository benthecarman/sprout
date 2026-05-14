/**
 * Detect which LLM provider an API key (and optional base URL) belongs to.
 *
 * Detection order (first match wins):
 *   1. Key-format match (high confidence) — `sk-ant-` etc. ALWAYS beats
 *      base_url. This prevents the prefilled default base URL (e.g.
 *      api.anthropic.com on a freshly opened form) from routing a freshly
 *      pasted OpenAI key to the wrong provider.
 *   2. If key-format gave low/no confidence, fall back to base_url host
 *      matching (loopback ports → ollama/vllm/llamacpp, known hosts → their
 *      provider).
 *
 * Key-format sub-order (most specific first):
 *   a. `sk-ant-` → Anthropic (admin01 sub-prefix is detected and rejected).
 *   b. `T3BlbkFJ` infix → OpenAI (covers sk-, sk-proj-, sk-svcacct-, sk-admin-).
 *   c. `sk-or-v1-` → OpenRouter.
 *   d. `gsk_` → Groq.
 *   e. `xai-` → xAI.
 *   f. `csk-` → Cerebras.
 *   g. `tgp_v1_` → Together.
 *   h. `pplx-` → Perplexity.
 *   i. `fw_` → Fireworks (medium confidence — undocumented in trufflehog).
 *   j. `^sk-[a-f0-9]{32}$` → DeepSeek.
 *   k. else → confidence none (handed to base_url fallback or "custom").
 *
 * Mistral keys have no unique format — they always fall through to manual.
 *
 * The function is pure and side-effect-free. Detection is advisory: the
 * UI exposes a Provider dropdown so the user can always override.
 */

import {
  ADMIN_ONLY_PROVIDER_ID,
  PROVIDER_CATALOG,
  type DetectionConfidence,
  type ProviderId,
} from "./providerCatalog.ts";

export type DetectionResult = {
  providerId: ProviderId | typeof ADMIN_ONLY_PROVIDER_ID;
  /** Suggested base URL — may be null when detection fails. */
  baseUrl: string | null;
  /** "high" — unique prefix match; "medium" — ambiguous; "none" — no match. */
  confidence: DetectionConfidence;
  /** Human-readable reason — useful for UI tooltips. */
  reason: string;
};

const T3BLBKFJ_INFIX = "T3BlbkFJ";

/** Match a known issuer-hostname against the base URL, before key-prefix matching. */
function detectByBaseUrl(baseUrl: string): DetectionResult | null {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const port = url.port; // string; empty when default

  // Loopback variants → local providers by port.
  if (host === "127.0.0.1" || host === "localhost" || host === "[::1]") {
    if (port === "11434") {
      return {
        providerId: "ollama",
        baseUrl: PROVIDER_CATALOG.ollama.baseUrl,
        confidence: "high",
        reason: "Loopback host + port 11434 → Ollama",
      };
    }
    if (port === "8000") {
      return {
        providerId: "vllm",
        baseUrl: PROVIDER_CATALOG.vllm.baseUrl,
        confidence: "high",
        reason: "Loopback host + port 8000 → vLLM",
      };
    }
    if (port === "8080") {
      return {
        providerId: "llamacpp",
        baseUrl: PROVIDER_CATALOG.llamacpp.baseUrl,
        confidence: "high",
        reason: "Loopback host + port 8080 → llama.cpp",
      };
    }
    return {
      providerId: "custom",
      baseUrl: baseUrl,
      confidence: "medium",
      reason:
        "Loopback host with non-standard port — treating as custom local provider",
    };
  }

  const hostMatches: Array<[string, ProviderId]> = [
    ["api.anthropic.com", "anthropic"],
    ["api.openai.com", "openai"],
    ["openrouter.ai", "openrouter"],
    ["api.groq.com", "groq"],
    ["api.together.xyz", "together"],
    ["api.deepseek.com", "deepseek"],
    ["api.mistral.ai", "mistral"],
    ["api.x.ai", "xai"],
    ["api.cerebras.ai", "cerebras"],
    ["api.fireworks.ai", "fireworks"],
    ["api.perplexity.ai", "perplexity"],
  ];
  for (const [needle, providerId] of hostMatches) {
    if (host === needle || host.endsWith(`.${needle}`)) {
      return {
        providerId,
        baseUrl: PROVIDER_CATALOG[providerId].baseUrl,
        confidence: "high",
        reason: `Base URL host matches ${needle}`,
      };
    }
  }
  return null;
}

/**
 * Match key prefixes/infixes. Order matters: more specific prefixes
 * (anthropic, OpenAI's T3BlbkFJ, sk-or-v1) come first; the ambiguous
 * bare-sk DeepSeek match is last.
 */
function detectByKey(key: string): DetectionResult {
  const trimmed = key.trim();
  if (trimmed.length === 0) {
    return {
      providerId: "custom",
      baseUrl: null,
      confidence: "none",
      reason: "No API key entered yet",
    };
  }

  // Anthropic admin01 keys are dashboard-only — reject explicitly.
  if (/^sk-ant-admin01-/.test(trimmed)) {
    return {
      providerId: ADMIN_ONLY_PROVIDER_ID,
      baseUrl: null,
      confidence: "high",
      reason:
        "Anthropic admin keys (sk-ant-admin01-…) are dashboard-only and cannot be used for agent inference. Use a regular API key (sk-ant-api03-…) instead.",
    };
  }

  // sk-ant-apiNN- are the documented user-facing prefixes (sk-ant-api01-,
  // api02-, api03-, …). Match the family with a tight prefix rather than
  // accepting any sk-ant-* — that keeps a future Anthropic-issued sub-class
  // (e.g. another dashboard-only family like admin01) from being silently
  // accepted as a regular inference key.
  if (/^sk-ant-api\d{2,}-/.test(trimmed)) {
    return {
      providerId: "anthropic",
      baseUrl: PROVIDER_CATALOG.anthropic.baseUrl,
      confidence: "high",
      reason: "sk-ant-apiNN- prefix → Anthropic",
    };
  }

  if (trimmed.includes(T3BLBKFJ_INFIX)) {
    return {
      providerId: "openai",
      baseUrl: PROVIDER_CATALOG.openai.baseUrl,
      confidence: "high",
      reason: "T3BlbkFJ infix → OpenAI",
    };
  }

  if (trimmed.startsWith("sk-or-v1-")) {
    return {
      providerId: "openrouter",
      baseUrl: PROVIDER_CATALOG.openrouter.baseUrl,
      confidence: "high",
      reason: "sk-or-v1- prefix → OpenRouter",
    };
  }

  if (trimmed.startsWith("gsk_")) {
    return {
      providerId: "groq",
      baseUrl: PROVIDER_CATALOG.groq.baseUrl,
      confidence: "high",
      reason: "gsk_ prefix → Groq",
    };
  }

  if (trimmed.startsWith("xai-")) {
    return {
      providerId: "xai",
      baseUrl: PROVIDER_CATALOG.xai.baseUrl,
      confidence: "high",
      reason: "xai- prefix → xAI",
    };
  }

  if (trimmed.startsWith("csk-")) {
    return {
      providerId: "cerebras",
      baseUrl: PROVIDER_CATALOG.cerebras.baseUrl,
      confidence: "high",
      reason: "csk- prefix → Cerebras",
    };
  }

  if (trimmed.startsWith("tgp_v1_")) {
    return {
      providerId: "together",
      baseUrl: PROVIDER_CATALOG.together.baseUrl,
      confidence: "high",
      reason: "tgp_v1_ prefix → Together AI",
    };
  }

  if (trimmed.startsWith("pplx-")) {
    return {
      providerId: "perplexity",
      baseUrl: PROVIDER_CATALOG.perplexity.baseUrl,
      confidence: "high",
      reason: "pplx- prefix → Perplexity",
    };
  }

  if (trimmed.startsWith("fw_")) {
    return {
      providerId: "fireworks",
      baseUrl: PROVIDER_CATALOG.fireworks.baseUrl,
      // fw_ prefix is documented but not in trufflehog/betterleaks — be honest.
      confidence: "medium",
      reason:
        "fw_ prefix → Fireworks (medium confidence — undocumented in trufflehog)",
    };
  }

  // Bare sk- + 32 lowercase hex → DeepSeek. Distinct from OpenAI legacy keys
  // which always carry the T3BlbkFJ infix and were matched above.
  if (/^sk-[a-f0-9]{32}$/.test(trimmed)) {
    return {
      providerId: "deepseek",
      baseUrl: PROVIDER_CATALOG.deepseek.baseUrl,
      confidence: "high",
      reason: "sk-<32-hex> → DeepSeek",
    };
  }

  return {
    providerId: "custom",
    baseUrl: null,
    confidence: "none",
    reason: "Key format not recognized — pick a provider manually",
  };
}

/**
 * Detect provider from an (apiKey, baseUrl) pair.
 *
 * Resolution order:
 * 1. High-confidence key prefix wins outright (e.g. sk-ant-api03-… → Anthropic,
 *    T3BlbkFJ → OpenAI). A recognized prefix is a strong signal of which
 *    provider issued the key, and we should never let the form's prefilled
 *    default `baseUrl` shadow it.
 * 2. High-confidence base URL beats medium-confidence key. `fw_*` is
 *    documented for Fireworks but not exclusive enough to overrule a clear
 *    host signal (e.g. user pasted `fw_…` against `https://api.openai.com`).
 *    Letting the host win prevents shipping a Fireworks-formatted key to
 *    OpenAI under the wrong dialect.
 * 3. Otherwise fall back to base URL host matching (covers manual operator
 *    intent: local Ollama, vLLM, llama.cpp, or a known provider hostname
 *    with an unrecognized key).
 * 4. If both fail, return the key-detection result (which carries the
 *    "Key format not recognized" reason).
 */
export function detectProvider(
  apiKey: string,
  baseUrl?: string,
): DetectionResult {
  const byKey = detectByKey(apiKey);
  if (byKey.confidence === "high") {
    return byKey;
  }
  const byUrl =
    baseUrl && baseUrl.trim().length > 0
      ? detectByBaseUrl(baseUrl.trim())
      : null;
  if (byUrl && byUrl.confidence === "high") {
    return byUrl;
  }
  if (byKey.confidence === "medium") {
    return byKey;
  }
  if (byUrl) {
    return byUrl;
  }
  return byKey;
}

export { ADMIN_ONLY_PROVIDER_ID };
