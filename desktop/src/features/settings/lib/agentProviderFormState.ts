import { PROVIDER_CATALOG, type ProviderId } from "./providerCatalog.ts";
import type { AgentProviderSettingsView } from "./agentProviderSettingsApi.ts";

/**
 * Pure reducer: apply a provider switch (manual OR auto-detected) to the
 * form state. Mirrors a single policy across both code paths so the
 * "what fields get reset on provider change" rules can't drift.
 *
 * Rules:
 *  - When switching TO a local provider, drop any previously typed real
 *    API key (the field is disabled; a stale value would otherwise be
 *    silently sent to localhost on save).
 *  - Replace the model when it's empty or still the previous provider's
 *    default — don't trample user-edited model names.
 *  - Replace the base URL when (a) the new provider supplies a default,
 *    OR (b) the user hasn't edited it (still empty / equal to prev default).
 *    For null-default providers (Custom / Block Gateway), clearing the
 *    previous provider's host is the safe default — otherwise a switch
 *    from Anthropic → Custom would silently keep api.anthropic.com.
 */
export function applyProviderSwitch(
  prev: FormState,
  nextProviderId: ProviderId,
  { manual }: { manual: boolean },
): FormState {
  const entry = PROVIDER_CATALOG[nextProviderId];
  const prevEntry = PROVIDER_CATALOG[prev.providerId];

  const apiKey = entry.isLocal ? "" : prev.apiKey;

  const prevDefaultModel = prevEntry.modelSuggestions[0] ?? "";
  const nextDefaultModel = entry.modelSuggestions[0] ?? prev.model;
  const nextModel =
    prev.model === "" || prev.model === prevDefaultModel
      ? nextDefaultModel
      : prev.model;

  const prevDefaultBaseUrl = prevEntry.baseUrl;
  const prevBaseUrlIsPrevDefault =
    prev.baseUrl !== "" && prev.baseUrl === prevDefaultBaseUrl;
  const nextBaseUrl =
    entry.baseUrl !== null
      ? entry.baseUrl
      : prevBaseUrlIsPrevDefault
        ? ""
        : prev.baseUrl;

  return {
    ...prev,
    providerId: nextProviderId,
    apiKey,
    model: nextModel,
    baseUrl: nextBaseUrl,
    anthropicApiVersion: entry.anthropicApiVersion ?? prev.anthropicApiVersion,
    // Manual change always marks the form as overridden so the auto-detect
    // effect doesn't immediately snap back. Detected change doesn't.
    detectionOverridden: manual ? true : prev.detectionOverridden,
  };
}

/**
 * Local form state for the Agent Provider settings card. All numeric knobs
 * live as strings so the user's typing is preserved without coercion noise;
 * `parseOptionalInt` converts to nullable numbers at save time.
 */
export type FormState = {
  providerId: ProviderId;
  apiKey: string;
  model: string;
  baseUrl: string;
  anthropicApiVersion: string;
  systemPrompt: string;
  maxRounds: string;
  maxOutputTokens: string;
  llmTimeoutSecs: string;
  toolTimeoutSecs: string;
  maxHistoryBytes: string;
  detectionOverridden: boolean;
};

export function blankFormForProvider(providerId: ProviderId): FormState {
  const entry = PROVIDER_CATALOG[providerId];
  return {
    providerId,
    apiKey: "",
    model: entry.modelSuggestions[0] ?? "",
    baseUrl: entry.baseUrl ?? "",
    anthropicApiVersion: entry.anthropicApiVersion ?? "",
    systemPrompt: "",
    maxRounds: "",
    maxOutputTokens: "",
    llmTimeoutSecs: "",
    toolTimeoutSecs: "",
    maxHistoryBytes: "",
    detectionOverridden: false,
  };
}

export function loadedFormFromView(view: AgentProviderSettingsView): FormState {
  const id = (view.detectedProviderId as ProviderId) ?? "custom";
  const safeId: ProviderId = id in PROVIDER_CATALOG ? id : "custom";
  return {
    providerId: safeId,
    apiKey: "",
    model: view.model,
    baseUrl: view.baseUrl,
    anthropicApiVersion: view.anthropicApiVersion ?? "",
    systemPrompt: view.systemPrompt ?? "",
    maxRounds: view.maxRounds == null ? "" : String(view.maxRounds),
    maxOutputTokens:
      view.maxOutputTokens == null ? "" : String(view.maxOutputTokens),
    llmTimeoutSecs:
      view.llmTimeoutSecs == null ? "" : String(view.llmTimeoutSecs),
    toolTimeoutSecs:
      view.toolTimeoutSecs == null ? "" : String(view.toolTimeoutSecs),
    maxHistoryBytes:
      view.maxHistoryBytes == null ? "" : String(view.maxHistoryBytes),
    detectionOverridden: view.detectionOverridden,
  };
}

export function parseOptionalInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new Error(`expected a non-negative integer, got "${raw}"`);
  }
  return n;
}
