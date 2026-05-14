/**
 * Resolve an ACP provider id (sprout-agent, claude-agent-acp, codex, goose, …)
 * from an `agent_command` string. Mirrors the Rust helper
 * `managed_agents::discovery::known_acp_provider` so the desktop UI can make
 * provider-specific decisions without an extra IPC round-trip.
 *
 * Recognized binary basenames (with `.exe` on Windows):
 * - sprout-agent
 * - claude-agent-acp / claude-code-acp
 * - codex / codex-acp
 * - goose
 *
 * The Rust resolver tries TWO normalizations in order:
 *   1. the full command, with whitespace and underscores mapped to `-`
 *      (so the alias `"Claude Code"` → `claude-code`);
 *   2. if (1) misses AND the command has whitespace, the first
 *      whitespace-delimited token, normalized the same way (so
 *      `"sprout-agent --verbose"` → `sprout-agent`).
 *
 * This function mirrors that two-pass behavior so the UI gate
 * (`isSproutAgent`) stays in lockstep with the Rust runtime's env-injection
 * gate. Drift between the two used to be the codex-review-#2 finding that
 * the UI hid per-agent prompt/model fields while the Rust runtime then
 * silently skipped the provider-settings injection.
 *
 * Returns `null` for unrecognized commands ("custom" agents).
 */
export type AcpProviderId =
  | "sprout-agent"
  | "claude-agent-acp"
  | "claude-code-acp"
  | "codex"
  | "goose"
  | null;

/** Strip path + .exe + lowercase + map [space, underscore] → '-'. */
function normalizeCommandIdentity(command: string): string {
  const trimmed = command.trim();
  const lastSlash = Math.max(
    trimmed.lastIndexOf("/"),
    trimmed.lastIndexOf("\\"),
  );
  const basename = lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;
  const lower = basename.toLowerCase().replace(/[\s_]/g, "-");
  return lower.replace(/\.exe$/, "");
}

function matchProvider(normalized: string): AcpProviderId {
  switch (normalized) {
    case "sprout-agent":
      return "sprout-agent";
    case "claude-agent-acp":
      return "claude-agent-acp";
    case "claude-code-acp":
    case "claude-code":
    case "claudecode":
      return "claude-code-acp";
    case "codex":
    case "codex-acp":
      return "codex";
    case "goose":
      return "goose";
    default:
      return null;
  }
}

export function resolveAcpProviderId(
  agentCommand: string | null | undefined,
): AcpProviderId {
  if (!agentCommand) return null;
  const trimmed = agentCommand.trim();
  if (!trimmed) return null;

  // Pass 1: try the full command (preserves the "Claude Code" alias).
  const full = matchProvider(normalizeCommandIdentity(trimmed));
  if (full !== null) return full;

  // Pass 2: if there's whitespace, try the first token (handles
  // `sprout-agent --verbose`). Must come after pass 1 so aliases win.
  const firstSpace = trimmed.search(/\s/);
  if (firstSpace > 0) {
    const head = trimmed.slice(0, firstSpace);
    return matchProvider(normalizeCommandIdentity(head));
  }
  return null;
}

export function isSproutAgent(
  agentCommand: string | null | undefined,
): boolean {
  return resolveAcpProviderId(agentCommand) === "sprout-agent";
}

/**
 * Gate for "is this the sprout-agent path" in the Create/Edit dialogs.
 * Pulls together the two signals the dialogs use: the selected provider id
 * (when the user picked from the catalog) and the raw agent command (which
 * covers the "Custom" provider + a sprout-agent binary path case).
 *
 * Extracted as a named helper so the Create-dialog gate, the Edit-dialog
 * gate, and the ManagedAgentRow gate stay in lockstep — and so we can
 * unit-test the gate without standing up a full React render fixture.
 */
export function isSproutAgentPath({
  selectedProviderId,
  agentCommand,
}: {
  selectedProviderId: string | null | undefined;
  agentCommand: string | null | undefined;
}): boolean {
  return (
    selectedProviderId === "sprout-agent" || isSproutAgent(agentCommand ?? "")
  );
}
