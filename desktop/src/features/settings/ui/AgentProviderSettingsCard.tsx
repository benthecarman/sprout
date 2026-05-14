import * as React from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { toast } from "sonner";

import {
  applyProviderSwitch,
  blankFormForProvider,
  type FormState,
  loadedFormFromView,
  parseOptionalInt,
} from "@/features/settings/lib/agentProviderFormState.ts";
import {
  ADMIN_ONLY_PROVIDER_ID,
  detectProvider,
} from "@/features/settings/lib/detectProvider.ts";
import {
  LOCAL_PLACEHOLDER_API_KEY,
  PROVIDER_CATALOG,
  PROVIDER_OPTIONS,
  type ProviderId,
} from "@/features/settings/lib/providerCatalog.ts";
import type {
  AgentProviderSettingsInput,
  ProviderDialect,
} from "@/features/settings/lib/agentProviderSettingsApi.ts";
import {
  useAgentProviderEnvPresenceQuery,
  useAgentProviderSettingsQuery,
  useDeleteAgentProviderSettingsMutation,
  useSaveAgentProviderSettingsMutation,
} from "@/features/settings/hooks/useAgentProviderSettings.ts";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { cn } from "@/shared/lib/cn";

import { AgentProviderAdvancedFields } from "./AgentProviderAdvancedFields";
import {
  AgentProviderLoadErrorBanner,
  AgentProviderRotationBanner,
  AgentProviderShellEnvHint,
} from "./AgentProviderBanners";
import { ClearSettingsDialog } from "./AgentProviderClearDialog";

function detectedProviderLabel(
  id: ProviderId | typeof ADMIN_ONLY_PROVIDER_ID,
): string {
  if (id === ADMIN_ONLY_PROVIDER_ID) {
    return "Anthropic admin key (rejected)";
  }
  return PROVIDER_CATALOG[id]?.label ?? "Custom";
}

export function AgentProviderSettingsCard() {
  const settingsQuery = useAgentProviderSettingsQuery();
  const envPresenceQuery = useAgentProviderEnvPresenceQuery();
  const saveMutation = useSaveAgentProviderSettingsMutation();
  const deleteMutation = useDeleteAgentProviderSettingsMutation();

  const [form, setForm] = React.useState<FormState>(() =>
    blankFormForProvider("anthropic"),
  );
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [revealKey, setRevealKey] = React.useState(false);
  const [showConfirmClear, setShowConfirmClear] = React.useState(false);

  const loadStatus = settingsQuery.data;
  const loadedView =
    loadStatus && loadStatus.status === "ok" ? loadStatus.view : null;
  const identityMismatch =
    loadStatus && loadStatus.status === "identity_mismatch"
      ? loadStatus.storedPubkey
      : null;
  const noSettings = loadStatus?.status === "none";
  // Corrupt envelope on disk (read/decrypt/parse error). User can still save
  // a fresh key to overwrite — `save_agent_provider_settings` is tolerant of
  // unreadable existing envelopes when an api_key is provided.
  const loadError = settingsQuery.error
    ? settingsQuery.error instanceof Error
      ? settingsQuery.error.message
      : String(settingsQuery.error)
    : null;

  // Snap form to loaded view when the query resolves, but only once — we
  // don't want to clobber user edits on every refetch.
  const hydratedRef = React.useRef(false);
  React.useEffect(() => {
    if (!loadedView || hydratedRef.current) return;
    setForm(loadedFormFromView(loadedView));
    hydratedRef.current = true;
  }, [loadedView]);

  // When user picks a provider manually (different from what the key implies),
  // detection_overridden becomes true. We track this on every change.
  const update = React.useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const setProviderManually = React.useCallback((providerId: ProviderId) => {
    setForm((prev) => applyProviderSwitch(prev, providerId, { manual: true }));
  }, []);

  // Live detection — runs whenever the API key or base URL changes.
  const detection = React.useMemo(
    () => detectProvider(form.apiKey, form.baseUrl),
    [form.apiKey, form.baseUrl],
  );

  // If detection lands on a real provider and the user hasn't overridden,
  // auto-snap providerId + base URL + model to the detection result. Shares
  // the `applyProviderSwitch` reducer with the manual picker so the
  // "what gets reset on switch" policy stays in one place.
  React.useEffect(() => {
    if (form.detectionOverridden) return;
    if (detection.providerId === ADMIN_ONLY_PROVIDER_ID) return;
    if (detection.confidence === "none") return;
    // Narrow the union: detection.providerId is now ProviderId (not the
    // admin-only sentinel).
    const detectedId: ProviderId = detection.providerId;
    setForm((prev) => {
      if (prev.providerId === detectedId) return prev;
      return applyProviderSwitch(prev, detectedId, { manual: false });
    });
  }, [detection.providerId, detection.confidence, form.detectionOverridden]);

  const providerEntry = PROVIDER_CATALOG[form.providerId];
  const dialect: ProviderDialect = providerEntry.dialect;
  const isLocal = providerEntry.isLocal;
  const adminKeyDetected = detection.providerId === ADMIN_ONLY_PROVIDER_ID;
  const apiKeyPresent = loadedView?.apiKeyPresent ?? false;
  const apiKeyPreview = loadedView?.apiKeyPreview ?? null;

  // Detect provider change while api_key blank but a saved key exists.
  // Local providers don't need a real key (we inject a placeholder), so
  // switching to one with a saved key is always allowed — otherwise the
  // user would have to clear settings just to go from Anthropic → Ollama.
  const savedProviderId = loadedView?.detectedProviderId;
  const providerChangedWithoutKey =
    apiKeyPresent &&
    !form.apiKey &&
    !isLocal &&
    savedProviderId !== undefined &&
    savedProviderId !== form.providerId;

  const saveDisabled =
    saveMutation.isPending ||
    adminKeyDetected ||
    !form.model.trim() ||
    !form.baseUrl.trim() ||
    (isLocal ? false : !form.apiKey && !apiKeyPresent) ||
    providerChangedWithoutKey;

  const onSave = async () => {
    let parsed: AgentProviderSettingsInput;
    try {
      parsed = {
        provider: dialect,
        // Local providers ALWAYS use the placeholder, regardless of what
        // may have been typed before switching to the local provider. This
        // prevents leaking a real Anthropic/OpenAI key to a loopback OpenAI-
        // compatible server (Ollama/vLLM/llama.cpp). For remote providers,
        // an empty field means "reuse the previously saved key" (None).
        apiKey: isLocal
          ? LOCAL_PLACEHOLDER_API_KEY
          : form.apiKey
            ? form.apiKey
            : null,
        model: form.model.trim(),
        baseUrl: form.baseUrl.trim().replace(/\/+$/, ""),
        anthropicApiVersion:
          dialect === "anthropic" && form.anthropicApiVersion.trim()
            ? form.anthropicApiVersion.trim()
            : null,
        systemPrompt: form.systemPrompt.trim() || null,
        maxRounds: parseOptionalInt(form.maxRounds),
        maxOutputTokens: parseOptionalInt(form.maxOutputTokens),
        llmTimeoutSecs: parseOptionalInt(form.llmTimeoutSecs),
        toolTimeoutSecs: parseOptionalInt(form.toolTimeoutSecs),
        maxHistoryBytes: parseOptionalInt(form.maxHistoryBytes),
        detectedProviderId: form.providerId,
        detectionOverridden: form.detectionOverridden,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Invalid input: ${msg}`);
      return;
    }
    try {
      await saveMutation.mutateAsync(parsed);
      toast.success("Agent provider settings saved");

      // Clear plaintext from the password input + state immediately. We do
      // not rely on the hydrate-on-loadedView-change effect alone: when the
      // redacted query result is structurally identical to the previous one
      // (e.g. same provider/model/baseUrl, and a new key sharing its last 4
      // chars), React-Query's structural sharing returns the same reference,
      // the useEffect on loadedView does not re-run, and the typed key would
      // otherwise remain in `form.apiKey` and visible if reveal is on.
      setForm((prev) => ({ ...prev, apiKey: "" }));
      setRevealKey(false);
      hydratedRef.current = false; // re-hydrate from fresh server state
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Save failed: ${msg}`);
    }
  };

  const onClear = async () => {
    setShowConfirmClear(false);
    try {
      await deleteMutation.mutateAsync();
      toast.success("Agent provider settings cleared");
      setForm(blankFormForProvider("anthropic"));

      hydratedRef.current = false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Clear failed: ${msg}`);
    }
  };

  // Hint state: shell env var is set but no saved settings.
  const env = envPresenceQuery.data;
  const showShellEnvHint = Boolean(
    noSettings && env && (env.anthropicApiKey || env.openaiCompatApiKey),
  );

  return (
    <section className="min-w-0" data-testid="settings-agent-provider">
      <div className="mb-3 min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <KeyRound className="h-4 w-4" /> Agent Provider
        </h2>
        <p className="text-sm text-muted-foreground">
          Configure the language model your Sprout agents use. Saved on this
          device, encrypted with your nostr key. When saved, these replace any
          environment variables you have set in your shell.
        </p>
      </div>

      <AgentProviderLoadErrorBanner message={loadError} />
      <AgentProviderRotationBanner visible={Boolean(identityMismatch)} />
      <AgentProviderShellEnvHint visible={showShellEnvHint} />

      <form
        className="flex flex-col gap-4"
        data-testid="agent-provider-form"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave();
        }}
      >
        {/* Provider picker */}
        <div className="flex flex-col gap-1.5">
          <label
            className="text-sm font-medium"
            htmlFor="agent-provider-provider-select"
          >
            Provider
          </label>
          <select
            className="rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            data-testid="agent-provider-provider-select"
            id="agent-provider-provider-select"
            onChange={(e) => setProviderManually(e.target.value as ProviderId)}
            value={form.providerId}
          >
            {PROVIDER_OPTIONS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          {detection.confidence !== "none" && !form.detectionOverridden ? (
            <span
              className={cn(
                "text-xs",
                adminKeyDetected
                  ? "text-red-600 dark:text-red-400"
                  : detection.confidence === "medium"
                    ? "text-yellow-600 dark:text-yellow-400"
                    : "text-emerald-600 dark:text-emerald-400",
              )}
              data-testid="agent-provider-detected-badge"
            >
              Detected: {detectedProviderLabel(detection.providerId)}
              {detection.confidence === "medium" ? " (medium confidence)" : ""}
            </span>
          ) : null}
          {providerEntry.notes ? (
            <p className="text-xs text-muted-foreground">
              {providerEntry.notes}
            </p>
          ) : null}
        </div>

        {/* API key */}
        <div className="flex flex-col gap-1.5">
          <label
            className="text-sm font-medium"
            htmlFor="agent-provider-api-key"
          >
            API key
          </label>
          <div className="relative">
            <Input
              autoComplete="off"
              data-testid="agent-provider-api-key"
              disabled={isLocal}
              id="agent-provider-api-key"
              onChange={(e) => update("apiKey", e.target.value)}
              placeholder={
                isLocal
                  ? "(no auth required — using sk-local placeholder)"
                  : apiKeyPresent
                    ? `(saved — type to replace${
                        apiKeyPreview ? ` — ends in ${apiKeyPreview}` : ""
                      })`
                    : "Paste your API key"
              }
              spellCheck={false}
              type={revealKey ? "text" : "password"}
              value={form.apiKey}
            />
            {!isLocal ? (
              <button
                aria-label={revealKey ? "Hide API key" : "Reveal API key"}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
                data-testid="agent-provider-api-key-reveal"
                onClick={() => setRevealKey((v) => !v)}
                type="button"
              >
                {revealKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            ) : null}
          </div>
          {adminKeyDetected ? (
            <p
              className="text-xs text-red-600 dark:text-red-400"
              data-testid="agent-provider-admin-key-error"
            >
              Anthropic admin keys (sk-ant-admin01-…) are dashboard-only and
              cannot be used for agent inference. Use a regular API key
              (sk-ant-api03-…) instead.
            </p>
          ) : null}
          {providerChangedWithoutKey ? (
            <p
              className="text-xs text-yellow-700 dark:text-yellow-400"
              data-testid="agent-provider-provider-change-warning"
            >
              Provider changed — enter a new API key for the new provider.
            </p>
          ) : null}
        </div>

        {/* Model */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="agent-provider-model">
            Model
          </label>
          <Input
            data-testid="agent-provider-model"
            id="agent-provider-model"
            list="agent-provider-model-suggestions"
            onChange={(e) => update("model", e.target.value)}
            placeholder="claude-sonnet-4-5"
            value={form.model}
          />
          {providerEntry.modelSuggestions.length > 0 ? (
            <datalist id="agent-provider-model-suggestions">
              {providerEntry.modelSuggestions.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          ) : null}
        </div>

        {/* Base URL */}
        <div className="flex flex-col gap-1.5">
          <label
            className="text-sm font-medium"
            htmlFor="agent-provider-base-url"
          >
            Base URL
          </label>
          <Input
            data-testid="agent-provider-base-url"
            id="agent-provider-base-url"
            onChange={(e) => update("baseUrl", e.target.value)}
            placeholder="https://api.anthropic.com"
            value={form.baseUrl}
          />
        </div>

        {/* Anthropic version pin */}
        {dialect === "anthropic" ? (
          <div className="flex flex-col gap-1.5">
            <label
              className="text-sm font-medium"
              htmlFor="agent-provider-anthropic-version"
            >
              Anthropic API version
            </label>
            <Input
              data-testid="agent-provider-anthropic-version"
              id="agent-provider-anthropic-version"
              onChange={(e) => update("anthropicApiVersion", e.target.value)}
              placeholder="2023-06-01"
              value={form.anthropicApiVersion}
            />
          </div>
        ) : null}

        <AgentProviderAdvancedFields
          form={form}
          onChange={update}
          onToggle={setShowAdvanced}
          open={showAdvanced}
        />

        <div className="flex items-center justify-between gap-2 pt-2">
          <Button
            data-testid="agent-provider-clear"
            disabled={
              deleteMutation.isPending || (noSettings && !identityMismatch)
            }
            onClick={() => setShowConfirmClear(true)}
            type="button"
            variant="ghost"
          >
            Clear settings
          </Button>
          <Button
            data-testid="agent-provider-save"
            disabled={saveDisabled}
            type="submit"
          >
            {saveMutation.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>

      <ClearSettingsDialog
        onConfirm={() => void onClear()}
        onOpenChange={setShowConfirmClear}
        open={showConfirmClear}
      />
    </section>
  );
}
