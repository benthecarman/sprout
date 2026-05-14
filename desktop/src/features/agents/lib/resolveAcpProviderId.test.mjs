import assert from "node:assert/strict";
import test from "node:test";

import { isSproutAgent, resolveAcpProviderId } from "./resolveAcpProviderId.ts";

test("bare command names resolve", () => {
  assert.equal(resolveAcpProviderId("sprout-agent"), "sprout-agent");
  assert.equal(resolveAcpProviderId("goose"), "goose");
  assert.equal(resolveAcpProviderId("codex"), "codex");
  assert.equal(resolveAcpProviderId("claude-agent-acp"), "claude-agent-acp");
});

test("full path is stripped", () => {
  assert.equal(
    resolveAcpProviderId("/usr/local/bin/sprout-agent"),
    "sprout-agent",
  );
  assert.equal(
    resolveAcpProviderId("C:\\Tools\\sprout-agent.exe"),
    "sprout-agent",
  );
});

test(".exe suffix is stripped", () => {
  assert.equal(resolveAcpProviderId("sprout-agent.exe"), "sprout-agent");
  assert.equal(resolveAcpProviderId("goose.exe"), "goose");
});

test("trailing args are ignored (matches Rust two-pass resolver)", () => {
  assert.equal(resolveAcpProviderId("sprout-agent --verbose"), "sprout-agent");
  assert.equal(
    resolveAcpProviderId("/usr/local/bin/sprout-agent --foo bar"),
    "sprout-agent",
  );
  assert.equal(
    resolveAcpProviderId("totally-custom --verbose"),
    null,
    "args don't rescue an unknown binary",
  );
});

test("whitespace aliases match like Rust", () => {
  // The Rust resolver maps space → '-' in full-command normalization, so
  // "Claude Code" resolves to claude-code-acp. TS must agree.
  assert.equal(resolveAcpProviderId("Claude Code"), "claude-code-acp");
});

test("underscore variant matches", () => {
  assert.equal(resolveAcpProviderId("sprout_agent"), "sprout-agent");
  assert.equal(resolveAcpProviderId("claude_agent_acp"), "claude-agent-acp");
});

test("case-insensitive", () => {
  assert.equal(resolveAcpProviderId("Sprout-Agent.EXE"), "sprout-agent");
});

test("unrecognized command returns null", () => {
  assert.equal(resolveAcpProviderId("my-custom-agent"), null);
  assert.equal(resolveAcpProviderId(""), null);
  assert.equal(resolveAcpProviderId(null), null);
  assert.equal(resolveAcpProviderId(undefined), null);
});

test("isSproutAgent matches resolveAcpProviderId", () => {
  assert.equal(isSproutAgent("sprout-agent"), true);
  assert.equal(isSproutAgent("/path/to/sprout-agent"), true);
  assert.equal(isSproutAgent("goose"), false);
  assert.equal(isSproutAgent(null), false);
});

import { isSproutAgentPath } from "./resolveAcpProviderId.ts";

// ── isSproutAgentPath: gate shared by Create dialog, Create sections, ────
// and the Edit-time gate. Hides per-agent System prompt / Model fields when
// the resolved provider is sprout-agent.

test("isSproutAgentPath: selectedProviderId='sprout-agent' wins even if command is blank", () => {
  assert.equal(
    isSproutAgentPath({ selectedProviderId: "sprout-agent", agentCommand: "" }),
    true,
  );
  assert.equal(
    isSproutAgentPath({
      selectedProviderId: "sprout-agent",
      agentCommand: null,
    }),
    true,
  );
});

test("isSproutAgentPath: custom provider + sprout-agent binary path", () => {
  // The "Custom" provider in the dropdown lets the user type any binary;
  // we still want to hide the per-agent System prompt / Model when the
  // binary resolves to sprout-agent.
  assert.equal(
    isSproutAgentPath({
      selectedProviderId: "custom",
      agentCommand: "/usr/local/bin/sprout-agent",
    }),
    true,
  );
  assert.equal(
    isSproutAgentPath({
      selectedProviderId: "custom",
      agentCommand: "sprout-agent --verbose",
    }),
    true,
  );
});

test("isSproutAgentPath: goose/codex/claude do NOT trigger the gate", () => {
  for (const cmd of ["goose", "codex", "claude-agent-acp"]) {
    assert.equal(
      isSproutAgentPath({ selectedProviderId: "custom", agentCommand: cmd }),
      false,
      `${cmd} must not be classified as sprout-agent`,
    );
  }
});

test("isSproutAgentPath: nullish inputs are safe", () => {
  assert.equal(
    isSproutAgentPath({ selectedProviderId: null, agentCommand: null }),
    false,
  );
  assert.equal(
    isSproutAgentPath({
      selectedProviderId: undefined,
      agentCommand: undefined,
    }),
    false,
  );
});
