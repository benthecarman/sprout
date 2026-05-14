//! Tauri command entrypoints — the public IPC surface for the Settings →
//! Agent Provider panel.

use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, State};
use zeroize::Zeroizing;

use super::storage::{
    decrypt_settings, encrypt_settings, normalize_origin, read_envelope, settings_path,
    validate_input, write_envelope,
};
use super::{
    AgentProviderEnvPresence, AgentProviderSettingsInput, AgentProviderSettingsView, LoadStatus,
    SettingsEnvelope, StoredSettings, ENVELOPE_ALG, ENVELOPE_VERSION,
};
use crate::app_state::AppState;

#[tauri::command]
pub fn get_agent_provider_settings(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<LoadStatus, String> {
    let path = settings_path(&app)?;
    let envelope = match read_envelope(&path)? {
        Some(e) => e,
        None => return Ok(LoadStatus::None),
    };

    let keys = state.keys.lock().map_err(|e| e.to_string())?;
    let current_pubkey = keys.public_key().to_hex();
    if envelope.pubkey != current_pubkey {
        return Ok(LoadStatus::IdentityMismatch {
            stored_pubkey: envelope.pubkey,
        });
    }

    let plain = decrypt_settings(&keys, &envelope.ciphertext)?;
    drop(keys);

    let stored: StoredSettings =
        serde_json::from_str(&plain).map_err(|e| format!("parse stored settings: {e}"))?;

    // Defense-in-depth: NIP-44 v2 authenticates the ciphertext to the same
    // identity that encrypted it, but the envelope's `pubkey` field is
    // unauthenticated metadata. If schema_version >= 2, the plaintext
    // contains its own owner_pubkey; cross-check against the envelope.
    // Mismatch means the envelope was tampered with or schema_version was
    // hand-edited; treat like an identity mismatch (no plaintext returned).
    if stored.schema_version >= 2
        && !stored.owner_pubkey.is_empty()
        && stored.owner_pubkey != envelope.pubkey
    {
        return Ok(LoadStatus::IdentityMismatch {
            stored_pubkey: envelope.pubkey,
        });
    }

    let api_key_present = !stored.api_key.is_empty();
    let api_key_preview = compute_preview(&stored.api_key);

    // `StoredSettings` implements `Drop` to zeroize the api_key, which blocks
    // by-value field moves. Clone the non-secret strings out; the api_key
    // itself never leaves this function — the view only carries metadata +
    // last-4 preview. When `stored` is dropped at end-of-scope its api_key
    // is zeroized.
    let view = AgentProviderSettingsView {
        provider: stored.provider.clone(),
        model: stored.model.clone(),
        base_url: stored.base_url.clone(),
        anthropic_api_version: stored.anthropic_api_version.clone(),
        system_prompt: stored.system_prompt.clone(),
        max_rounds: stored.max_rounds,
        max_output_tokens: stored.max_output_tokens,
        llm_timeout_secs: stored.llm_timeout_secs,
        tool_timeout_secs: stored.tool_timeout_secs,
        max_history_bytes: stored.max_history_bytes,
        detected_provider_id: stored.detected_provider_id.clone(),
        detection_overridden: stored.detection_overridden,
        api_key_present,
        api_key_preview,
    };
    Ok(LoadStatus::Ok { view })
}

#[tauri::command]
pub fn save_agent_provider_settings(
    mut input: AgentProviderSettingsInput,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Trim whitespace from secret-bearing and identifier fields before
    // validation/storage. A trailing newline from paste-from-terminal is the
    // common case and would otherwise be persisted and shipped to the
    // provider verbatim (breaking auth). System prompt is intentionally NOT
    // trimmed here — the UI already does that, and trimming long prose is
    // not our call from this layer.
    input.model = input.model.trim().to_owned();
    input.base_url = input.base_url.trim().to_owned();
    input.detected_provider_id = input.detected_provider_id.trim().to_owned();
    if let Some(v) = input.anthropic_api_version.as_mut() {
        *v = v.trim().to_owned();
    }
    // SECURITY: Take the api_key out by value into a Zeroizing wrapper so
    // the un-trimmed plaintext on the heap is wiped when we drop it, rather
    // than left for whoever realloc()s that page next.
    if let Some(raw) = input.api_key.take() {
        let zeroized_raw: Zeroizing<String> = Zeroizing::new(raw);
        let trimmed = zeroized_raw.trim();
        if trimmed.is_empty() {
            // Caller-supplied whitespace-only key. The TS/Rust contract is
            // "empty string is invalid" — silently coercing to `None` would
            // trigger the reuse path and could be surprising (user thinks
            // they typed a new key; we keep the old one). Reject loudly.
            return Err("API key cannot be empty".into());
        }
        input.api_key = Some(trimmed.to_owned());
        // zeroized_raw drops here, wiping the original buffer.
    }

    validate_input(&input)?;

    let path = settings_path(&app)?;
    // Tolerate an unreadable / corrupt existing envelope when the user is
    // providing a fresh api_key — we'll overwrite it cleanly. If api_key is
    // None (key-reuse intent), the corrupt envelope MUST surface as an error
    // because there's no recovering the previously stored key.
    let existing_envelope = match read_envelope(&path) {
        Ok(env) => env,
        Err(e) => {
            if input.api_key.is_some() {
                None
            } else {
                return Err(format!(
                    "Existing settings unreadable ({e}); enter the API key again to overwrite."
                ));
            }
        }
    };

    let keys = state.keys.lock().map_err(|e| e.to_string())?;
    let current_pubkey = keys.public_key().to_hex();

    // If api_key is None, we want to preserve the previously stored key.
    // Requirements: existing settings must exist AND have been encrypted for
    // this identity AND have the same provider AND the same detected_provider_id
    // AND the same normalized base-URL origin. This prevents silent
    // cross-issuer key reuse when switching between OpenAI-compatible
    // providers that share `provider: "openai"`.
    let resolved_api_key: Zeroizing<String> = match input.api_key.take() {
        Some(k) if k.is_empty() => return Err("API key cannot be empty".into()),
        Some(k) => Zeroizing::new(k),
        None => {
            let env = existing_envelope.as_ref().ok_or_else(|| {
                "API key required (no previously saved settings to reuse)".to_owned()
            })?;
            if env.pubkey != current_pubkey {
                return Err(
                    "Saved settings were encrypted for a different identity — re-enter API key"
                        .into(),
                );
            }
            let prev_plain = decrypt_settings(&keys, &env.ciphertext)?;
            let mut prev: StoredSettings = serde_json::from_str(&prev_plain)
                .map_err(|e| format!("parse stored settings: {e}"))?;
            // v2 defense-in-depth: even if the envelope says it was
            // encrypted for the current pubkey, the encrypted plaintext
            // carries its own `owner_pubkey`. Treat a mismatch as identity
            // mismatch — refuse reuse rather than silently lifting a key
            // out of a tampered envelope. v1 settings have `owner_pubkey:
            // ""` (default) and are accepted here for backward compat;
            // they were already gated by the envelope-level pubkey check.
            if !prev.owner_pubkey.is_empty() && prev.owner_pubkey != current_pubkey {
                return Err("Saved settings owner mismatch — re-enter API key".into());
            }
            if prev.provider != input.provider {
                return Err("Provider changed — re-enter API key".into());
            }
            if prev.detected_provider_id != input.detected_provider_id {
                return Err("Issuer changed — re-enter API key".into());
            }
            let prev_origin = normalize_origin(&prev.base_url)?;
            let new_origin = normalize_origin(&input.base_url)?;
            if prev_origin != new_origin {
                return Err("Base URL origin changed — re-enter API key".into());
            }
            if prev.api_key.is_empty() {
                return Err("No previously stored API key to reuse".into());
            }
            // `StoredSettings: Drop` blocks `prev.api_key` move. Swap it out
            // with an empty `String`; the now-empty `prev` will drop and
            // zeroize an empty buffer (harmless), and the lifted key is
            // wrapped in `Zeroizing` immediately.
            Zeroizing::new(std::mem::take(&mut prev.api_key))
        }
    };

    // `AgentProviderSettingsInput: Drop` blocks by-value moves of its
    // fields (Drop wipes the optional api_key). Use `std::mem::take` to
    // lift each owned field out — leaves a `String::new()` / `None` behind,
    // which the eventual Drop wipes harmlessly.
    let to_store = StoredSettings {
        // v2 adds `owner_pubkey` inside the encrypted plaintext for
        // defense-in-depth against envelope tampering. The loader treats
        // a v2 plaintext whose owner_pubkey disagrees with the envelope's
        // pubkey as an identity mismatch.
        schema_version: 2,
        owner_pubkey: current_pubkey.clone(),
        provider: std::mem::take(&mut input.provider),
        api_key: resolved_api_key.to_string(),
        model: std::mem::take(&mut input.model),
        base_url: std::mem::take(&mut input.base_url),
        anthropic_api_version: input.anthropic_api_version.take(),
        system_prompt: input.system_prompt.take(),
        max_rounds: input.max_rounds,
        max_output_tokens: input.max_output_tokens,
        llm_timeout_secs: input.llm_timeout_secs,
        tool_timeout_secs: input.tool_timeout_secs,
        max_history_bytes: input.max_history_bytes,
        detected_provider_id: std::mem::take(&mut input.detected_provider_id),
        detection_overridden: input.detection_overridden,
    };

    let plaintext = Zeroizing::new(
        serde_json::to_string(&to_store)
            .map_err(|e| format!("serialize plaintext settings: {e}"))?,
    );
    let ciphertext = encrypt_settings(&keys, &plaintext)?;
    drop(plaintext);
    drop(keys);

    let envelope = SettingsEnvelope {
        version: ENVELOPE_VERSION,
        alg: ENVELOPE_ALG.into(),
        pubkey: current_pubkey,
        ciphertext,
        updated_at: now_unix(),
    };
    write_envelope(&path, &envelope)?;
    Ok(())
}

#[tauri::command]
pub fn delete_agent_provider_settings(app: AppHandle) -> Result<(), String> {
    let path = settings_path(&app)?;
    match std::fs::remove_file(&path) {
        Ok(_) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("delete settings file: {e}")),
    }
}

#[tauri::command]
pub fn get_agent_provider_env_presence() -> Result<AgentProviderEnvPresence, String> {
    Ok(AgentProviderEnvPresence {
        sprout_agent_provider: std::env::var_os("SPROUT_AGENT_PROVIDER").is_some(),
        anthropic_api_key: std::env::var_os("ANTHROPIC_API_KEY").is_some(),
        openai_compat_api_key: std::env::var_os("OPENAI_COMPAT_API_KEY").is_some(),
    })
}

/// Compute the UI preview for a saved API key. Returns the last 4 chars
/// when the key is long enough to be safely truncated; otherwise `None`.
/// The minimum is `PREVIEW_LEN * 2` so the preview never reveals more than
/// half the key. Real provider keys are >> 8 chars; the short-key branch
/// is defense against test fixtures or pasted garbage.
pub(super) fn compute_preview(api_key: &str) -> Option<String> {
    const PREVIEW_LEN: usize = 4;
    const MIN_KEY_LEN_FOR_PREVIEW: usize = PREVIEW_LEN * 2; // 8
    if api_key.is_empty() {
        return None;
    }
    let len = api_key.chars().count();
    if len < MIN_KEY_LEN_FOR_PREVIEW {
        return None;
    }
    Some(api_key.chars().skip(len - PREVIEW_LEN).collect())
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}
