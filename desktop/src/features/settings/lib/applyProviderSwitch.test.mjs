import assert from "node:assert/strict";
import test from "node:test";

import {
  applyProviderSwitch,
  blankFormForProvider,
} from "./agentProviderFormState.ts";

// ── Shared policy: model + baseUrl reset rules ────────────────────────

test("manual switch from default Anthropic → OpenAI resets model and baseUrl", () => {
  const start = blankFormForProvider("anthropic");
  const next = applyProviderSwitch(start, "openai", { manual: true });
  assert.equal(next.providerId, "openai");
  assert.equal(next.model, "gpt-5");
  assert.equal(next.baseUrl, "https://api.openai.com/v1");
  assert.equal(next.detectionOverridden, true);
});

test("manual switch preserves user-edited model", () => {
  const start = {
    ...blankFormForProvider("anthropic"),
    model: "custom-model-x",
  };
  const next = applyProviderSwitch(start, "openai", { manual: true });
  assert.equal(next.model, "custom-model-x");
});

test("manual switch from Anthropic → Custom clears stale anthropic baseUrl", () => {
  const start = blankFormForProvider("anthropic");
  const next = applyProviderSwitch(start, "custom", { manual: true });
  assert.equal(next.baseUrl, "");
});

test("manual switch from Custom (user-set baseUrl) → Custom keeps it", () => {
  // Pathological case: switching to the same provider shouldn't matter,
  // but if it does, user-edited baseUrl must survive.
  const start = {
    ...blankFormForProvider("custom"),
    baseUrl: "https://my.gateway.example/v1",
  };
  const next = applyProviderSwitch(start, "custom", { manual: true });
  assert.equal(next.baseUrl, "https://my.gateway.example/v1");
});

test("switch TO a local provider clears the api_key", () => {
  const start = {
    ...blankFormForProvider("anthropic"),
    apiKey: "sk-ant-api03-real-looking-key",
  };
  const next = applyProviderSwitch(start, "ollama", { manual: true });
  assert.equal(next.apiKey, "");
  assert.equal(next.providerId, "ollama");
});

test("switch from local → cloud preserves apiKey field (empty)", () => {
  const start = blankFormForProvider("ollama");
  const next = applyProviderSwitch(start, "anthropic", { manual: true });
  assert.equal(next.apiKey, "");
  assert.equal(next.providerId, "anthropic");
});

test("detected (non-manual) switch does NOT set detectionOverridden", () => {
  const start = blankFormForProvider("anthropic");
  const next = applyProviderSwitch(start, "openai", { manual: false });
  assert.equal(next.detectionOverridden, false);
});

test("manual switch always sets detectionOverridden true", () => {
  const start = blankFormForProvider("anthropic");
  const next = applyProviderSwitch(start, "groq", { manual: true });
  assert.equal(next.detectionOverridden, true);
});

test("model field with empty string still resets to new provider default", () => {
  const start = {
    ...blankFormForProvider("anthropic"),
    model: "",
  };
  const next = applyProviderSwitch(start, "openai", { manual: true });
  assert.equal(next.model, "gpt-5");
});

test("anthropic version is carried over from catalog when present, kept otherwise", () => {
  const start = {
    ...blankFormForProvider("openai"),
    anthropicApiVersion: "2024-99-99",
  };
  // Switching to anthropic should pick the catalog version (2023-06-01).
  const toAnthropic = applyProviderSwitch(start, "anthropic", { manual: true });
  assert.equal(toAnthropic.anthropicApiVersion, "2023-06-01");
  // Switching to a non-anthropic catalog entry should keep prev value.
  const back = applyProviderSwitch(toAnthropic, "openai", { manual: true });
  assert.equal(back.anthropicApiVersion, "2023-06-01");
});
