/**
 * IPC helpers for the encrypted Agent Provider settings panel.
 *
 * The four Tauri commands behind these wrappers live in
 * `desktop/src-tauri/src/commands/agent_provider_settings/`. The plaintext
 * API key crosses the IPC boundary in exactly one direction (writer-only)
 * via `saveAgentProviderSettings`. The loader returns metadata + an
 * `apiKeyPreview` (last 4 chars) but never the full key.
 *
 * Wire shapes match the Rust structs under `#[serde(rename_all = "camelCase")]`.
 */

import { invokeTauri } from "@/shared/api/tauri";

export type ProviderDialect = "anthropic" | "openai";

/** What `get_agent_provider_settings` returns. Discriminated by `status`. */
export type AgentProviderSettingsLoadStatus =
  | { status: "none" }
  | { status: "ok"; view: AgentProviderSettingsView }
  | { status: "identity_mismatch"; storedPubkey: string };

export type AgentProviderSettingsView = {
  provider: ProviderDialect;
  model: string;
  baseUrl: string;
  anthropicApiVersion: string | null;
  systemPrompt: string | null;
  maxRounds: number | null;
  maxOutputTokens: number | null;
  llmTimeoutSecs: number | null;
  toolTimeoutSecs: number | null;
  maxHistoryBytes: number | null;
  detectedProviderId: string;
  detectionOverridden: boolean;
  apiKeyPresent: boolean;
  apiKeyPreview: string | null;
};

export type AgentProviderSettingsInput = {
  provider: ProviderDialect;
  /**
   * `null` = preserve previously stored key (only valid when an existing
   * record matches on provider, detected_provider_id, AND normalized
   * base-URL origin). Use `null` to update non-key fields without
   * round-tripping the secret. `""` is rejected by the backend.
   */
  apiKey: string | null;
  model: string;
  baseUrl: string;
  anthropicApiVersion: string | null;
  systemPrompt: string | null;
  maxRounds: number | null;
  maxOutputTokens: number | null;
  llmTimeoutSecs: number | null;
  toolTimeoutSecs: number | null;
  maxHistoryBytes: number | null;
  detectedProviderId: string;
  detectionOverridden: boolean;
};

export type AgentProviderEnvPresence = {
  sproutAgentProvider: boolean;
  anthropicApiKey: boolean;
  openaiCompatApiKey: boolean;
};

// ── Invocations ────────────────────────────────────────────────────────────

export async function getAgentProviderSettings(): Promise<AgentProviderSettingsLoadStatus> {
  return invokeTauri<AgentProviderSettingsLoadStatus>(
    "get_agent_provider_settings",
  );
}

export async function saveAgentProviderSettings(
  input: AgentProviderSettingsInput,
): Promise<void> {
  await invokeTauri<void>("save_agent_provider_settings", { input });
}

export async function deleteAgentProviderSettings(): Promise<void> {
  await invokeTauri<void>("delete_agent_provider_settings");
}

export async function getAgentProviderEnvPresence(): Promise<AgentProviderEnvPresence> {
  return invokeTauri<AgentProviderEnvPresence>(
    "get_agent_provider_env_presence",
  );
}
