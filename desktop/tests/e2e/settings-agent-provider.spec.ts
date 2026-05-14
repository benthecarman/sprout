import { expect, test } from "@playwright/test";

import { installMockBridge } from "../helpers/bridge";
import { openSettings } from "../helpers/settings";

// Use a real-looking Anthropic-shaped key so the detector matches anthropic.
// Length is what `^sk-ant-(?:api03|admin01)-[A-Za-z0-9_\-]{93}AA$` expects.
const FAKE_ANTHROPIC_KEY = `sk-ant-api03-${"A".repeat(91)}aaAA`;
// OpenAI legacy/proj key shape: a fixed infix in the middle is the strong
// signal. Built via concat so GitHub's secret scanner does not regex-match
// an inline OpenAI-shaped key.
const OPENAI_INFIX = "T3" + "BlbkFJ";
const FAKE_OPENAI_KEY = `sk-proj-${"a".repeat(40)}${OPENAI_INFIX}${"b".repeat(40)}`;

// Screenshots land in `desktop/screenshots/agent-provider/` (gitignored — see
// .gitignore additions for this branch). Note: do NOT write into
// `playwright-report/` because the html reporter wipes that directory at the
// end of the run, deleting our artifacts.
const SCREENSHOT_DIR = "screenshots/agent-provider";

test.describe("Agent Provider settings panel", () => {
  test("empty state with shell-env hint and detected-anthropic save flow", async ({
    page,
  }) => {
    await installMockBridge(page, {
      agentProviderEnvPresence: { anthropicApiKey: true },
    });
    await page.goto("/");

    await openSettings(page, "agent-provider");
    const card = page.getByTestId("settings-agent-provider");
    await expect(card).toBeVisible();

    // Empty state: shell-env hint is visible, no rotation banner, no
    // api_key_present.
    await expect(
      page.getByTestId("agent-provider-shell-env-hint"),
    ).toBeVisible();
    await expect(
      page.getByTestId("agent-provider-rotation-warning"),
    ).toHaveCount(0);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/01-empty-with-shell-env-hint.png`,
      fullPage: false,
    });

    // Paste a real-shaped Anthropic key; detection should pick anthropic.
    await page.getByTestId("agent-provider-api-key").fill(FAKE_ANTHROPIC_KEY);
    await expect(
      page.getByTestId("agent-provider-detected-badge"),
    ).toContainText("Anthropic");

    // Base URL should auto-fill.
    await expect(page.getByTestId("agent-provider-base-url")).toHaveValue(
      "https://api.anthropic.com",
    );

    // Model defaulted to a non-empty string per provider catalog.
    await expect(page.getByTestId("agent-provider-model")).not.toHaveValue("");

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/02-detected-anthropic-filled.png`,
      fullPage: false,
    });

    // Expand Advanced and screenshot.
    await page.getByTestId("agent-provider-advanced-toggle").click();
    await expect(
      page.getByTestId("agent-provider-system-prompt"),
    ).toBeVisible();
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/03-advanced-expanded.png`,
      fullPage: false,
    });

    // Save — toast appears, form persists. Re-opening shows api_key_present.
    await page.getByTestId("agent-provider-save").click();
    await expect(page.getByText(/saved/i).first()).toBeVisible({
      timeout: 5000,
    });

    // Reopen settings and verify state survived round-trip.
    await page.getByTestId("settings-close").click();
    await openSettings(page, "agent-provider");
    // Once settings exist, the shell-env hint is hidden — settings win.
    await expect(page.getByTestId("agent-provider-shell-env-hint")).toHaveCount(
      0,
    );
    // api_key field is empty placeholder; preview text shows "(saved — type to replace)"
    // somewhere in the row.
    await expect(card).toContainText(/saved/i);
  });

  test("identity-rotation banner appears when stored pubkey differs", async ({
    page,
  }) => {
    // Plant a record under a different pubkey to drive identity_mismatch.
    await installMockBridge(page, {
      agentProviderSettings: {
        storedPubkey:
          "1111111111111111111111111111111111111111111111111111111111111111",
        view: {
          provider: "anthropic",
          model: "claude-sonnet-4-5",
          baseUrl: "https://api.anthropic.com",
          anthropicApiVersion: null,
          systemPrompt: null,
          maxRounds: null,
          maxOutputTokens: null,
          llmTimeoutSecs: null,
          toolTimeoutSecs: null,
          maxHistoryBytes: null,
          detectedProviderId: "anthropic",
          detectionOverridden: false,
          apiKeyPresent: true,
          apiKeyPreview: "abcd",
        },
      },
    });

    await page.goto("/");
    await openSettings(page, "agent-provider");
    await expect(
      page.getByTestId("agent-provider-rotation-warning"),
    ).toBeVisible();
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/04-rotation-banner.png`,
      fullPage: false,
    });
  });

  test("provider-change-warning blocks save when key is required for new provider", async ({
    page,
  }) => {
    // Pre-seed a saved record under the active mock identity (DEFAULT_MOCK_IDENTITY
    // pubkey = "deadbeef" repeated 8x). The card loads it, then we change the
    // provider dropdown and expect the inline warning + disabled Save.
    const activePubkey = "deadbeef".repeat(8);
    await installMockBridge(page, {
      agentProviderSettings: {
        storedPubkey: activePubkey,
        view: {
          provider: "anthropic",
          model: "claude-sonnet-4-5",
          baseUrl: "https://api.anthropic.com",
          anthropicApiVersion: null,
          systemPrompt: null,
          maxRounds: null,
          maxOutputTokens: null,
          llmTimeoutSecs: null,
          toolTimeoutSecs: null,
          maxHistoryBytes: null,
          detectedProviderId: "anthropic",
          detectionOverridden: false,
          apiKeyPresent: true,
          apiKeyPreview: "abcd",
        },
      },
    });

    await page.goto("/");
    await openSettings(page, "agent-provider");
    const card = page.getByTestId("settings-agent-provider");
    await expect(card).toBeVisible();

    // Sanity: saved key exists, no shell-env hint (settings win), no warning yet.
    await expect(page.getByTestId("agent-provider-shell-env-hint")).toHaveCount(
      0,
    );
    await expect(
      page.getByTestId("agent-provider-provider-change-warning"),
    ).toHaveCount(0);

    // Change provider to OpenAI (different issuer) without filling api_key.
    // Warning appears, Save is disabled.
    await page
      .getByTestId("agent-provider-provider-select")
      .selectOption("openai");
    await expect(
      page.getByTestId("agent-provider-provider-change-warning"),
    ).toBeVisible();
    await expect(page.getByTestId("agent-provider-save")).toBeDisabled();

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/05-provider-change-warning.png`,
      fullPage: false,
    });
  });

  test("key-format detection beats prefilled default base URL (openai)", async ({
    page,
  }) => {
    // Regression for codex #1: opening the panel with the default form
    // (baseUrl pre-filled to Anthropic), then pasting an OpenAI key should
    // detect OpenAI — key format wins over base URL.
    await installMockBridge(page, {});
    await page.goto("/");
    await openSettings(page, "agent-provider");
    await page.getByTestId("agent-provider-api-key").fill(FAKE_OPENAI_KEY);
    await expect(
      page.getByTestId("agent-provider-detected-badge"),
    ).toContainText(/openai/i);
    await expect(page.getByTestId("agent-provider-base-url")).toHaveValue(
      "https://api.openai.com/v1",
    );
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/06-detected-openai-key-wins.png`,
      fullPage: false,
    });
  });

  test("load-error banner surfaces when stored envelope is unreadable", async ({
    page,
  }) => {
    // Drives the new corrupt-envelope UI: `get_agent_provider_settings`
    // throws (e.g., parse error / decrypt failure on disk). The banner
    // is informational; the user can still save fresh credentials.
    await installMockBridge(page, {
      agentProviderSettingsLoadError:
        "parse stored settings: expected value at line 1 column 1",
    });
    await page.goto("/");
    await openSettings(page, "agent-provider");
    await expect(page.getByTestId("agent-provider-load-error")).toBeVisible();
    await expect(page.getByTestId("agent-provider-load-error")).toContainText(
      /parse stored settings/i,
    );
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/07-load-error-banner.png`,
      fullPage: false,
    });
  });

  test("clear flow removes settings and returns the empty state", async ({
    page,
  }) => {
    const activePubkey = "deadbeef".repeat(8);
    await installMockBridge(page, {
      agentProviderSettings: {
        storedPubkey: activePubkey,
        view: {
          provider: "anthropic",
          model: "claude-sonnet-4-5",
          baseUrl: "https://api.anthropic.com",
          anthropicApiVersion: null,
          systemPrompt: null,
          maxRounds: null,
          maxOutputTokens: null,
          llmTimeoutSecs: null,
          toolTimeoutSecs: null,
          maxHistoryBytes: null,
          detectedProviderId: "anthropic",
          detectionOverridden: false,
          apiKeyPresent: true,
          apiKeyPreview: "abcd",
        },
      },
    });
    await page.goto("/");
    await openSettings(page, "agent-provider");

    await page.getByTestId("agent-provider-clear").click();

    // A11y: the confirm prompt is a Radix AlertDialog. AT should see
    // `role="alertdialog"` plus auto-wired labelledby/describedby pointing
    // at the title/description. (Radix relies on focus trap rather than
    // an explicit aria-modal attribute, matching the WAI-ARIA dialog
    // pattern guidance.)
    const dialog = page.getByTestId("agent-provider-clear-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("role", "alertdialog");
    // Radix sets aria-labelledby/-describedby to its own generated IDs;
    // we just assert the attributes are present and non-empty.
    await expect(dialog).toHaveAttribute("aria-labelledby", /.+/);
    await expect(dialog).toHaveAttribute("aria-describedby", /.+/);
    // Cancel button autofocuses (destructive defaults to safe).
    await expect(page.getByTestId("agent-provider-clear-cancel")).toBeFocused();

    await page.getByTestId("agent-provider-clear-confirm").click();
    // After clear, mutation success invalidates the query → re-fetch returns
    // `{ status: "none" }`. We don't assert a specific empty UI state beyond
    // verifying the load-error banner stays hidden (settings file is gone,
    // not corrupt).
    await expect(page.getByTestId("agent-provider-load-error")).toHaveCount(0);
    await expect(
      page.getByTestId("agent-provider-rotation-warning"),
    ).toHaveCount(0);
  });

  test("clear dialog: Escape cancels without deleting", async ({ page }) => {
    const activePubkey = "deadbeef".repeat(8);
    await installMockBridge(page, {
      agentProviderSettings: {
        storedPubkey: activePubkey,
        view: {
          provider: "anthropic",
          model: "claude-sonnet-4-5",
          baseUrl: "https://api.anthropic.com",
          anthropicApiVersion: null,
          systemPrompt: null,
          maxRounds: null,
          maxOutputTokens: null,
          llmTimeoutSecs: null,
          toolTimeoutSecs: null,
          maxHistoryBytes: null,
          detectedProviderId: "anthropic",
          detectionOverridden: false,
          apiKeyPresent: true,
          apiKeyPreview: "abcd",
        },
      },
    });
    await page.goto("/");
    await openSettings(page, "agent-provider");

    await page.getByTestId("agent-provider-clear").click();
    const dialog = page.getByTestId("agent-provider-clear-dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    // Settings still loaded — the Clear button is still enabled because
    // settings are still present.
    await expect(page.getByTestId("agent-provider-clear")).toBeEnabled();
  });

  test("rotation banner is role=status / aria-live=polite (a11y)", async ({
    page,
  }) => {
    // Plant a record under a different identity to drive identity_mismatch
    // (matches the pattern of the rotation-banner test above).
    await installMockBridge(page, {
      agentProviderSettings: {
        storedPubkey:
          "1111111111111111111111111111111111111111111111111111111111111111",
        view: {
          provider: "anthropic",
          model: "claude-sonnet-4-5",
          baseUrl: "https://api.anthropic.com",
          anthropicApiVersion: null,
          systemPrompt: null,
          maxRounds: null,
          maxOutputTokens: null,
          llmTimeoutSecs: null,
          toolTimeoutSecs: null,
          maxHistoryBytes: null,
          detectedProviderId: "anthropic",
          detectionOverridden: false,
          apiKeyPresent: true,
          apiKeyPreview: "abcd",
        },
      },
    });
    await page.goto("/");
    await openSettings(page, "agent-provider");

    const banner = page.getByTestId("agent-provider-rotation-warning");
    await expect(banner).toBeVisible();
    // <output> has implicit role="status". Assert via the locator's role
    // rather than the attribute, since we now use the semantic element.
    await expect(banner).toHaveJSProperty("tagName", "OUTPUT");
    await expect(banner).toHaveAttribute("aria-live", "polite");
  });

  // Regression: codex review #5 P2 (a). With a saved key in place, switching
  // to a local provider (Ollama/vLLM/llama.cpp) must NOT show the
  // "provider changed without key" warning and must NOT disable Save —
  // local providers don't need a real key (sprout-agent injects a
  // placeholder), so requiring one would lock the user out of the switch.
  test("switching to a local provider with a saved key keeps Save enabled", async ({
    page,
  }) => {
    const activePubkey = "deadbeef".repeat(8);
    await installMockBridge(page, {
      agentProviderSettings: {
        storedPubkey: activePubkey,
        view: {
          provider: "anthropic",
          model: "claude-sonnet-4-5",
          baseUrl: "https://api.anthropic.com",
          anthropicApiVersion: null,
          systemPrompt: null,
          maxRounds: null,
          maxOutputTokens: null,
          llmTimeoutSecs: null,
          toolTimeoutSecs: null,
          maxHistoryBytes: null,
          detectedProviderId: "anthropic",
          detectionOverridden: false,
          apiKeyPresent: true,
          apiKeyPreview: "abcd",
        },
      },
    });

    await page.goto("/");
    await openSettings(page, "agent-provider");
    const card = page.getByTestId("settings-agent-provider");
    await expect(card).toBeVisible();

    // Pick Ollama (local). No warning, Save stays enabled.
    await page
      .getByTestId("agent-provider-provider-select")
      .selectOption("ollama");
    await expect(
      page.getByTestId("agent-provider-provider-change-warning"),
    ).toHaveCount(0);
    await expect(page.getByTestId("agent-provider-save")).toBeEnabled();
  });

  // Regression: codex review #6 P2. The MANUAL provider picker must
  // mirror the auto-detect path: when switching providers, replace the
  // model (when still on the previous default) and don't silently leave
  // a stale base URL pointing at the old provider's host for
  // catalog entries that have no default (Custom / Block Gateway).
  test("manual provider switch resets model and clears stale base URL for null-default providers", async ({
    page,
  }) => {
    await installMockBridge(page, { agentProviderSettings: { view: null } });
    await page.goto("/");
    await openSettings(page, "agent-provider");
    const card = page.getByTestId("settings-agent-provider");
    await expect(card).toBeVisible();

    const modelInput = page.getByTestId("agent-provider-model");
    const baseUrlInput = page.getByTestId("agent-provider-base-url");

    // Sanity: empty-state defaults to Anthropic + claude-sonnet-4-5 +
    // api.anthropic.com.
    await expect(modelInput).toHaveValue("claude-sonnet-4-5");
    await expect(baseUrlInput).toHaveValue("https://api.anthropic.com");

    // Switch to OpenAI manually. Model must reset to OpenAI default.
    await page
      .getByTestId("agent-provider-provider-select")
      .selectOption("openai");
    await expect(modelInput).toHaveValue("gpt-5");
    await expect(baseUrlInput).toHaveValue("https://api.openai.com/v1");

    // Switch back and then to Custom. Custom has no default baseUrl —
    // we must clear, not leave the previous provider's host in place.
    await page
      .getByTestId("agent-provider-provider-select")
      .selectOption("anthropic");
    await expect(baseUrlInput).toHaveValue("https://api.anthropic.com");
    await page
      .getByTestId("agent-provider-provider-select")
      .selectOption("custom");
    // Custom has no baseUrl default and the previous baseUrl was Anthropic's
    // default — must clear, not silently keep api.anthropic.com.
    await expect(baseUrlInput).toHaveValue("");
  });

  // Regression: codex review #5 P2 (c). On a fresh card (default Anthropic
  // model), pasting an OpenAI-shaped key flips provider + base URL to
  // OpenAI; the model must also flip away from `claude-sonnet-4-5` to the
  // OpenAI default — otherwise we'd save an invalid model for the
  // detected provider.
  test("detected provider change resets model when still on previous default", async ({
    page,
  }) => {
    await installMockBridge(page, { agentProviderSettings: { view: null } });
    await page.goto("/");
    await openSettings(page, "agent-provider");
    const card = page.getByTestId("settings-agent-provider");
    await expect(card).toBeVisible();

    // Sanity: the empty-state default model is the Anthropic suggestion.
    const modelInput = page.getByTestId("agent-provider-model");
    await expect(modelInput).toHaveValue("claude-sonnet-4-5");

    // Paste an OpenAI-shaped key. Detection flips providerId to "openai";
    // the model should reset to OpenAI's first suggestion ("gpt-5"), not
    // remain on Anthropic's default.
    await page.getByTestId("agent-provider-api-key").fill(FAKE_OPENAI_KEY);
    await expect(
      page.getByTestId("agent-provider-provider-select"),
    ).toHaveValue("openai");
    await expect(modelInput).not.toHaveValue("claude-sonnet-4-5");
    await expect(modelInput).toHaveValue("gpt-5");
  });

  test("api key input is cleared after a successful save (R7 regression)", async ({
    page,
  }) => {
    // R7-P2 (UI): when replacing an existing key with a new one whose
    // *redacted view round-trip is structurally identical* — same provider,
    // model, baseUrl, and preview (last 4 chars) — React-Query's structural
    // sharing returns the previous reference and the hydrate-on-loadedView
    // effect never re-runs, so the typed key would otherwise stay visible
    // in the password input and React state.
    //
    // To force a structurally-identical reload, we plant a record whose
    // apiKeyPreview ends in "aaAA" and replace it with another sk-ant key
    // that also ends in "aaAA" (the FAKE_ANTHROPIC_KEY constant). After a
    // successful save the input must be empty regardless of whether the
    // saved-view reference changed.
    const activePubkey = "deadbeef".repeat(8);
    await installMockBridge(page, {
      agentProviderSettings: {
        storedPubkey: activePubkey,
        view: {
          provider: "anthropic",
          model: "claude-sonnet-4-5",
          baseUrl: "https://api.anthropic.com",
          anthropicApiVersion: null,
          systemPrompt: null,
          maxRounds: null,
          maxOutputTokens: null,
          llmTimeoutSecs: null,
          toolTimeoutSecs: null,
          maxHistoryBytes: null,
          detectedProviderId: "anthropic",
          detectionOverridden: false,
          apiKeyPresent: true,
          // Same last-4 as FAKE_ANTHROPIC_KEY, so the replacement save
          // returns a view whose `apiKeyPreview` is unchanged.
          apiKeyPreview: "aaAA",
        },
      },
    });

    await page.goto("/");
    await openSettings(page, "agent-provider");
    const card = page.getByTestId("settings-agent-provider");
    await expect(card).toBeVisible();
    const keyInput = page.getByTestId("agent-provider-api-key");
    // Baseline: pre-save the input is empty (saved key is opaque server-side).
    await expect(keyInput).toHaveValue("");

    // Replace with a key that hits the same preview suffix.
    await keyInput.fill(FAKE_ANTHROPIC_KEY);
    await expect(keyInput).toHaveValue(FAKE_ANTHROPIC_KEY);

    // Reveal so a leak would be visible to e2e — also asserts revealKey
    // resets to hidden after save.
    await page.getByTestId("agent-provider-api-key-reveal").click();
    await expect(keyInput).toHaveAttribute("type", "text");

    await page.getByTestId("agent-provider-save").click();
    await expect(page.getByText(/saved/i).first()).toBeVisible({
      timeout: 5000,
    });

    // Post-save: input is cleared and reveal is back off. This is the
    // hardening — independent of any rehydrate-on-query-change effect.
    await expect(keyInput).toHaveValue("");
    await expect(keyInput).toHaveAttribute("type", "password");
  });
});
