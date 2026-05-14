/**
 * Catalog of LLM providers Sprout's agent panel can target.
 *
 * Sources cross-referenced against `trufflesecurity/trufflehog`,
 * `gitleaks/gitleaks`, `betterleaks/betterleaks`, and each provider's
 * official SDK base-URL constant. See the thread on the
 * `sprout-agent-control-panel` channel for the full table of receipts.
 *
 * `dialect` is the runtime contract sprout-agent honors. `provider_id` is
 * a higher-level identity that survives the dialect collapse — e.g.
 * OpenAI, OpenRouter, xAI, Groq, etc. all share `dialect: "openai"` but
 * have distinct issuer pubkeys, so we track them as separate provider_ids.
 */

export type ProviderDialect = "anthropic" | "openai";

/** Confidence the auto-detection assigns. UI renders the badge tone from this. */
export type DetectionConfidence = "high" | "medium" | "none";

export type ProviderId =
  | "anthropic"
  | "openai"
  | "openrouter"
  | "groq"
  | "together"
  | "deepseek"
  | "mistral"
  | "xai"
  | "cerebras"
  | "fireworks"
  | "perplexity"
  | "ollama"
  | "vllm"
  | "llamacpp"
  | "block_gateway"
  | "custom";

export type ProviderEntry = {
  /** Stable identifier persisted in settings; not user-facing. */
  id: ProviderId;
  /** Human-readable label. */
  label: string;
  /** Default base URL when auto-filled (null = user must supply). */
  baseUrl: string | null;
  /** Which env-var set sprout-agent should use. */
  dialect: ProviderDialect;
  /** Curated model suggestions surfaced in the model dropdown. Freely editable. */
  modelSuggestions: string[];
  /** True for loopback providers — UI hides the API-key field and uses a placeholder. */
  isLocal: boolean;
  /** Anthropic version pin (only meaningful when dialect = "anthropic"). */
  anthropicApiVersion?: string;
  /** Free-form notes shown in the UI when the user expands the provider hint. */
  notes?: string;
};

export const PROVIDER_CATALOG: Record<ProviderId, ProviderEntry> = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    dialect: "anthropic",
    anthropicApiVersion: "2023-06-01",
    modelSuggestions: [
      "claude-sonnet-4-5",
      "claude-opus-4-1",
      "claude-3-5-haiku-latest",
    ],
    isLocal: false,
    notes: "Uses x-api-key auth. anthropic-version: 2023-06-01 pinned.",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    dialect: "openai",
    modelSuggestions: ["gpt-5", "gpt-4o", "gpt-4o-mini", "o3", "o4-mini"],
    isLocal: false,
    notes:
      'Bearer auth. The "T3BlbkFJ" infix in the key disambiguates OpenAI from other sk- providers.',
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    dialect: "openai",
    modelSuggestions: [
      "anthropic/claude-sonnet-4.5",
      "openai/gpt-5",
      "google/gemini-2.5-pro",
      "meta-llama/llama-3.3-70b-instruct",
    ],
    isLocal: false,
    notes: "OpenAI-compatible front for many providers.",
  },
  groq: {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    dialect: "openai",
    modelSuggestions: [
      "llama-3.3-70b-versatile",
      "qwen2.5-32b-instruct",
      "deepseek-r1-distill-llama-70b",
    ],
    isLocal: false,
    notes: "OpenAI-compat path is /openai/v1, not /v1.",
  },
  together: {
    id: "together",
    label: "Together AI",
    baseUrl: "https://api.together.xyz/v1",
    dialect: "openai",
    modelSuggestions: [
      "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      "Qwen/Qwen2.5-72B-Instruct-Turbo",
      "deepseek-ai/DeepSeek-V3",
    ],
    isLocal: false,
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    dialect: "openai",
    modelSuggestions: ["deepseek-chat", "deepseek-reasoner"],
    isLocal: false,
    notes:
      "Bare sk-XXXX (32 hex). Anthropic-dialect mirror exists at /anthropic if you prefer.",
  },
  mistral: {
    id: "mistral",
    label: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    dialect: "openai",
    modelSuggestions: ["mistral-large-latest", "codestral-latest"],
    isLocal: false,
    notes:
      "Mistral keys have no unique format — auto-detection cannot identify them, pick manually.",
  },
  xai: {
    id: "xai",
    label: "xAI (Grok)",
    baseUrl: "https://api.x.ai/v1",
    dialect: "openai",
    modelSuggestions: ["grok-4", "grok-code-fast-1"],
    isLocal: false,
  },
  cerebras: {
    id: "cerebras",
    label: "Cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    dialect: "openai",
    modelSuggestions: ["llama-4-scout", "llama3.3-70b"],
    isLocal: false,
  },
  fireworks: {
    id: "fireworks",
    label: "Fireworks AI",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    dialect: "openai",
    modelSuggestions: [
      "accounts/fireworks/models/llama-v3p3-70b-instruct",
      "accounts/fireworks/models/qwen2p5-coder-32b-instruct",
    ],
    isLocal: false,
  },
  perplexity: {
    id: "perplexity",
    label: "Perplexity",
    baseUrl: "https://api.perplexity.ai",
    dialect: "openai",
    modelSuggestions: ["sonar", "sonar-pro", "sonar-reasoning-pro"],
    isLocal: false,
  },
  ollama: {
    id: "ollama",
    label: "Ollama (local)",
    baseUrl: "http://127.0.0.1:11434/v1",
    dialect: "openai",
    modelSuggestions: ["llama3.3", "qwen2.5-coder:32b", "deepseek-r1:32b"],
    isLocal: true,
    notes:
      "Local server; no API key required. We send a dummy 'sk-local' so the env-var validator is satisfied.",
  },
  vllm: {
    id: "vllm",
    label: "vLLM (local)",
    baseUrl: "http://127.0.0.1:8000/v1",
    dialect: "openai",
    modelSuggestions: [],
    isLocal: true,
    notes: "Local vLLM server; default port 8000.",
  },
  llamacpp: {
    id: "llamacpp",
    label: "llama.cpp server (local)",
    baseUrl: "http://127.0.0.1:8080/v1",
    dialect: "openai",
    modelSuggestions: [],
    isLocal: true,
    notes: "Local llama.cpp server; default port 8080.",
  },
  block_gateway: {
    id: "block_gateway",
    label: "Block AI Gateway",
    baseUrl: null,
    dialect: "openai",
    modelSuggestions: [],
    isLocal: false,
    notes: "Internal Block AI Gateway — user-supplied URL and key.",
  },
  custom: {
    id: "custom",
    label: "Custom",
    baseUrl: null,
    dialect: "openai",
    modelSuggestions: [],
    isLocal: false,
    notes: "Bring your own base URL.",
  },
};

/** Ordered list for the dropdown — keeps related providers grouped. */
export const PROVIDER_OPTIONS: ProviderEntry[] = [
  PROVIDER_CATALOG.anthropic,
  PROVIDER_CATALOG.openai,
  PROVIDER_CATALOG.openrouter,
  PROVIDER_CATALOG.groq,
  PROVIDER_CATALOG.together,
  PROVIDER_CATALOG.deepseek,
  PROVIDER_CATALOG.mistral,
  PROVIDER_CATALOG.xai,
  PROVIDER_CATALOG.cerebras,
  PROVIDER_CATALOG.fireworks,
  PROVIDER_CATALOG.perplexity,
  PROVIDER_CATALOG.ollama,
  PROVIDER_CATALOG.vllm,
  PROVIDER_CATALOG.llamacpp,
  PROVIDER_CATALOG.block_gateway,
  PROVIDER_CATALOG.custom,
];

/** Placeholder API key for local providers — OpenAI-compat servers ignore the value. */
export const LOCAL_PLACEHOLDER_API_KEY = "sk-local";

/**
 * Sentinel returned by `detectProvider` when an API key matches an Anthropic
 * admin-only key prefix. Those keys are dashboard-only — never accepted for
 * agent use. UI shows an error and disables Save.
 */
export const ADMIN_ONLY_PROVIDER_ID = "anthropic_admin_only" as const;
