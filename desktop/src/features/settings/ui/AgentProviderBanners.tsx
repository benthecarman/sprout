/**
 * Three contextual banners rendered above the Agent Provider settings form.
 * Extracted from `AgentProviderSettingsCard` to keep that file under the
 * project's 500-line cap; pure presentational components with no state.
 */

// A11y: error/warning banners use `role="alert"` so screen readers announce
// them when they mount, and the failure-mode banner uses `aria-live="assertive"`
// (the rotation banner is informational rather than blocking, so `polite`).
// The shell-env hint is purely informational, no live region.

export function AgentProviderLoadErrorBanner({
  message,
}: {
  message: string | null;
}) {
  if (!message) return null;
  return (
    <div
      aria-live="assertive"
      className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400"
      data-testid="agent-provider-load-error"
      role="alert"
    >
      <p className="font-medium">Saved settings could not be loaded.</p>
      <p className="mt-1 text-xs">{message}</p>
      <p className="mt-1 text-xs">
        Enter a fresh API key below and save to overwrite the file, or use Clear
        to remove it entirely.
      </p>
    </div>
  );
}

export function AgentProviderRotationBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    // <output> has implicit role="status"; we keep aria-live explicit so
    // the polling level is unambiguous across AT implementations.
    <output
      aria-live="polite"
      className="mb-4 block rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-700 dark:text-yellow-400"
      data-testid="agent-provider-rotation-warning"
    >
      <p className="font-medium">
        Saved settings were encrypted by a different identity.
      </p>
      <p className="mt-1 text-xs">
        Save new settings to overwrite the existing file. To recover the old
        ones, switch back to the identity that wrote them.
      </p>
    </output>
  );
}

export function AgentProviderShellEnvHint({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <p
      className="mb-3 rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
      data-testid="agent-provider-shell-env-hint"
    >
      Sprout Agent is currently using an API key from your shell environment.
      Save settings here to use them instead.
    </p>
  );
}
