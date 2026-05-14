import assert from "node:assert/strict";
import test from "node:test";

import { detectProvider, ADMIN_ONLY_PROVIDER_ID } from "./detectProvider.ts";

// ── Empty / whitespace ────────────────────────────────────────────────

test("empty key → confidence none", () => {
  const r = detectProvider("");
  assert.equal(r.providerId, "custom");
  assert.equal(r.confidence, "none");
});

test("whitespace-only key → confidence none", () => {
  const r = detectProvider("   ");
  assert.equal(r.providerId, "custom");
  assert.equal(r.confidence, "none");
});

// ── Anthropic ────────────────────────────────────────────────────────

test("sk-ant-api03-… → Anthropic, high confidence", () => {
  const r = detectProvider("sk-ant-api03-AAAAAAAAAAAAAAAAAAAA");
  assert.equal(r.providerId, "anthropic");
  assert.equal(r.confidence, "high");
  assert.equal(r.baseUrl, "https://api.anthropic.com");
});

test("sk-ant-admin01-… → admin-only sentinel, high confidence", () => {
  const r = detectProvider("sk-ant-admin01-DUMMY");
  assert.equal(r.providerId, ADMIN_ONLY_PROVIDER_ID);
  assert.equal(r.confidence, "high");
});

// ── OpenAI infix ─────────────────────────────────────────────────────
// All OpenAI fixtures construct the infix via concat so GitHub's secret
// scanner cannot regex-match an inline OpenAI-shaped key string.
const OPENAI_INFIX = "T3" + "BlbkFJ";

test("legacy sk-…OpenAI-infix… → OpenAI", () => {
  const r = detectProvider(
    `sk-abcdefghijklmnopqrst${OPENAI_INFIX}abcdefghijklmnopqrst`,
  );
  assert.equal(r.providerId, "openai");
  assert.equal(r.confidence, "high");
  assert.equal(r.baseUrl, "https://api.openai.com/v1");
});

test("sk-proj- with OpenAI infix → OpenAI", () => {
  const r = detectProvider(`sk-proj-deadbeef${OPENAI_INFIX}cafebabe`);
  assert.equal(r.providerId, "openai");
  assert.equal(r.confidence, "high");
});

test("sk-svcacct- with OpenAI infix → OpenAI", () => {
  // Construct the fixture with explicit concat so GitHub's secret scanner
  // does not regex-match an inline OpenAI-shaped service-account key.
  const infix = "T3" + "BlbkFJ";
  const r = detectProvider(`sk-svcacct-x${infix}y`);
  assert.equal(r.providerId, "openai");
});

// ── OpenRouter / Groq / xAI / Cerebras / Together / Perplexity ──────

test("sk-or-v1-<64hex> → OpenRouter", () => {
  const r = detectProvider(`sk-or-v1-${"a".repeat(64)}`);
  assert.equal(r.providerId, "openrouter");
});

test("gsk_<52 alnum> → Groq", () => {
  const r = detectProvider(`gsk_${"A".repeat(52)}`);
  assert.equal(r.providerId, "groq");
  assert.equal(r.baseUrl, "https://api.groq.com/openai/v1");
});

test("xai- → xAI", () => {
  const r = detectProvider(`xai-${"A".repeat(80)}`);
  assert.equal(r.providerId, "xai");
});

test("csk- → Cerebras", () => {
  const r = detectProvider(`csk-${"a".repeat(48)}`);
  assert.equal(r.providerId, "cerebras");
});

test("tgp_v1_ → Together", () => {
  const r = detectProvider(`tgp_v1_${"A".repeat(43)}`);
  assert.equal(r.providerId, "together");
});

test("pplx- → Perplexity", () => {
  const r = detectProvider(`pplx-${"A".repeat(48)}`);
  assert.equal(r.providerId, "perplexity");
});

// ── Fireworks medium confidence ──────────────────────────────────────

test("fw_ → Fireworks, medium confidence", () => {
  const r = detectProvider("fw_abcdef1234567890");
  assert.equal(r.providerId, "fireworks");
  assert.equal(r.confidence, "medium");
});

// ── DeepSeek vs OpenAI legacy disambiguation ─────────────────────────

test("bare sk-<32 hex> → DeepSeek", () => {
  const r = detectProvider(`sk-${"a".repeat(32)}`);
  assert.equal(r.providerId, "deepseek");
  assert.equal(r.confidence, "high");
});

test("OpenAI legacy with infix matches OpenAI first, not DeepSeek", () => {
  // 51 chars total but contains the infix → must route to OpenAI, not DeepSeek.
  const r = detectProvider(
    `sk-abcdefghijklmnopqrst${OPENAI_INFIX}abcdefghijklmnopqrst`,
  );
  assert.equal(r.providerId, "openai");
});

// ── Mistral fallback (no unique format) ──────────────────────────────

test("Mistral-shaped key (32 uppercase alnum, no marker) → custom", () => {
  // Mistral has no unique format — auto-detection cannot identify it.
  const r = detectProvider("ABCDEFGHIJKLMNOPQRSTUVWXYZ012345");
  assert.equal(r.providerId, "custom");
  assert.equal(r.confidence, "none");
});

// ── Base-URL override ────────────────────────────────────────────────

test("key prefix beats prefilled base URL (sk-ant- with openai base)", () => {
  // Regression: with the form's prefilled default baseUrl, the previous order
  // would route a freshly pasted Anthropic key to OpenAI. Key format wins now.
  const r = detectProvider("sk-ant-api03-AAAA", "https://api.openai.com/v1");
  assert.equal(r.providerId, "anthropic");
});

test("key prefix beats prefilled anthropic baseUrl for openai-format key", () => {
  // Regression for the actual UX bug: opening the panel, default form has
  // baseUrl=https://api.anthropic.com, then user pastes an OpenAI key.
  const r = detectProvider(
    `sk-proj-deadbeef${OPENAI_INFIX}cafebabe`,
    "https://api.anthropic.com",
  );
  assert.equal(r.providerId, "openai");
});

test("base URL is used when key has no recognized prefix", () => {
  // No-confidence key → fall back to base URL host matching.
  const r = detectProvider("totally-custom-token", "https://api.openai.com/v1");
  assert.equal(r.providerId, "openai");
});

test("base URL override picks openrouter.ai", () => {
  const r = detectProvider("", "https://openrouter.ai/api/v1");
  assert.equal(r.providerId, "openrouter");
});

test("base URL override picks anthropic.com", () => {
  const r = detectProvider("", "https://api.anthropic.com");
  assert.equal(r.providerId, "anthropic");
});

test("invalid base URL falls through to key detection", () => {
  const r = detectProvider("sk-ant-api03-zzz", "not-a-url");
  assert.equal(r.providerId, "anthropic");
});

// ── Local providers via base-URL port ────────────────────────────────

test("localhost:11434 → Ollama", () => {
  const r = detectProvider("", "http://localhost:11434/v1");
  assert.equal(r.providerId, "ollama");
});

test("127.0.0.1:8000 → vLLM", () => {
  const r = detectProvider("", "http://127.0.0.1:8000/v1");
  assert.equal(r.providerId, "vllm");
});

test("loopback :8080 → llama.cpp", () => {
  const r = detectProvider("", "http://127.0.0.1:8080");
  assert.equal(r.providerId, "llamacpp");
});

test("loopback non-standard port → custom local, medium confidence", () => {
  const r = detectProvider("", "http://localhost:9999");
  assert.equal(r.providerId, "custom");
  assert.equal(r.confidence, "medium");
});

test("subdomain of api.openai.com still matches openai", () => {
  const r = detectProvider("", "https://eu.api.openai.com/v1");
  assert.equal(r.providerId, "openai");
});

// ── R3-LOW: detection tightening ─────────────────────────────────────

test("sk-ant- with unknown subprefix → custom (does not silently claim anthropic)", () => {
  // A future Anthropic-issued non-inference family (e.g. sk-ant-foobar-…)
  // must not be auto-classified as a regular Anthropic inference key.
  // Only sk-ant-apiNN- counts.
  const r = detectProvider("sk-ant-future-XYZ-not-a-real-prefix");
  assert.notEqual(r.providerId, "anthropic");
  assert.equal(r.confidence, "none");
});

test("sk-ant-api02- → Anthropic (forward-compat for new apiNN-)", () => {
  const r = detectProvider("sk-ant-api02-EXAMPLE");
  assert.equal(r.providerId, "anthropic");
  assert.equal(r.confidence, "high");
});

test("fw_ key + api.openai.com base URL → openai (high URL beats medium key)", () => {
  // Defense-in-depth: a Fireworks-shaped key against an OpenAI host is
  // ambiguous, and shipping it as Fireworks would send under the wrong
  // dialect. High-confidence URL wins over medium-confidence key.
  const r = detectProvider("fw_someToken", "https://api.openai.com/v1");
  assert.equal(r.providerId, "openai");
});

test("fw_ key + no URL → fireworks (medium key still useful)", () => {
  const r = detectProvider("fw_someToken");
  assert.equal(r.providerId, "fireworks");
  assert.equal(r.confidence, "medium");
});
