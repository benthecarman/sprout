//! On-disk envelope I/O + encrypt/decrypt + URL normalization + save-time
//! validation. All items are crate-internal — the public surface lives in
//! `mod.rs` (constants/types) and `commands.rs` (Tauri entrypoints).

use std::path::{Path, PathBuf};

use atomic_write_file::AtomicWriteFile;
use nostr::{nips::nip44, Keys};
use tauri::{AppHandle, Manager};
use zeroize::Zeroizing;

use super::{
    AgentProviderSettingsInput, SettingsEnvelope, ENVELOPE_ALG, ENVELOPE_VERSION,
    MAX_ENVELOPE_BYTES, MAX_PLAINTEXT_BYTES, MAX_SYSTEM_PROMPT_BYTES, MIN_HISTORY_BYTES,
    PROVIDER_ANTHROPIC, PROVIDER_OPENAI, SETTINGS_FILENAME,
};

// ─── Path helpers ───────────────────────────────────────────────────────────

pub(super) fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?;
    std::fs::create_dir_all(&data_dir).map_err(|e| format!("create app data dir: {e}"))?;
    Ok(data_dir.join(SETTINGS_FILENAME))
}

// ─── Origin normalization (for key-reuse check, codex review #4 + #5) ──────

/// Hosts treated as loopback for the `http://` allow-list. IPv6 `::1` is
/// also accepted via the `url::Host::Ipv6` arm in `validate_base_url`.
const LOOPBACK_HOSTS: &[&str] = &["localhost", "127.0.0.1", "::1"];

/// Hard parse + safety validation of a base URL. Rejects:
/// - schemes other than http/https
/// - missing host
/// - userinfo (username/password)
/// - any query or fragment
/// - non-loopback `http://` (would leak the API key in cleartext on the wire)
///
/// On success returns the parsed URL for downstream use.
pub(super) fn validate_base_url(raw: &str) -> Result<url::Url, String> {
    let url = url::Url::parse(raw).map_err(|e| format!("invalid base_url: {e}"))?;
    let scheme = url.scheme().to_ascii_lowercase();
    if scheme != "http" && scheme != "https" {
        return Err("base_url must use http or https".into());
    }
    if url.username() != "" || url.password().is_some() {
        return Err("base_url must not contain a username or password".into());
    }
    if url.query().is_some() {
        return Err("base_url must not contain a query string".into());
    }
    if url.fragment().is_some() {
        return Err("base_url must not contain a fragment".into());
    }
    let host_str = url
        .host_str()
        .ok_or_else(|| "base_url missing host".to_owned())?
        .to_ascii_lowercase();
    if scheme == "http" {
        let is_loopback = match url.host() {
            Some(url::Host::Ipv4(ip)) => ip.is_loopback(),
            Some(url::Host::Ipv6(ip)) => ip.is_loopback(),
            Some(url::Host::Domain(_)) => LOOPBACK_HOSTS.contains(&host_str.as_str()),
            None => false,
        };
        if !is_loopback {
            return Err(
                "base_url must use https:// (http:// is only allowed for loopback hosts)".into(),
            );
        }
    }
    Ok(url)
}

/// Normalize a URL string to its scheme+host+effective-port origin. Used to
/// decide whether a key-reuse request (api_key=None) is permissible: the
/// previously stored origin must equal the new origin under this normalization
/// (lowercase host, scheme-default port, no path/query).
///
/// Returns `Err(...)` if the URL doesn't parse, fails safety validation,
/// or has no host. Both inputs to the comparison are normalized; equality
/// on the returned `String` is the comparison.
pub(super) fn normalize_origin(raw: &str) -> Result<String, String> {
    let url = validate_base_url(raw)?;
    let scheme = url.scheme().to_ascii_lowercase();
    let host = url
        .host_str()
        .ok_or_else(|| "base_url missing host".to_owned())?
        .to_ascii_lowercase();
    let port = url
        .port_or_known_default()
        .ok_or_else(|| "base_url missing port".to_owned())?;
    Ok(format!("{scheme}://{host}:{port}"))
}

// ─── Envelope read/write ────────────────────────────────────────────────────

pub(super) fn read_envelope(path: &Path) -> Result<Option<SettingsEnvelope>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let meta = std::fs::metadata(path).map_err(|e| format!("stat settings file: {e}"))?;
    if meta.len() > MAX_ENVELOPE_BYTES {
        return Err(format!(
            "settings file too large ({} bytes > {} cap) — refusing to load",
            meta.len(),
            MAX_ENVELOPE_BYTES,
        ));
    }
    let raw = std::fs::read_to_string(path).map_err(|e| format!("read settings file: {e}"))?;
    let env: SettingsEnvelope =
        serde_json::from_str(&raw).map_err(|e| format!("parse settings envelope: {e}"))?;
    if env.version != ENVELOPE_VERSION {
        return Err(format!(
            "unsupported settings envelope version {}",
            env.version,
        ));
    }
    if env.alg != ENVELOPE_ALG {
        return Err(format!("unsupported settings envelope alg {}", env.alg));
    }
    if env.pubkey.len() != 64 || !env.pubkey.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("settings envelope pubkey malformed".into());
    }
    Ok(Some(env))
}

pub(super) fn write_envelope(path: &Path, env: &SettingsEnvelope) -> Result<(), String> {
    let payload =
        serde_json::to_vec_pretty(env).map_err(|e| format!("serialize settings envelope: {e}"))?;
    if (payload.len() as u64) > MAX_ENVELOPE_BYTES {
        return Err(format!(
            "encrypted envelope too large ({} bytes > {} cap)",
            payload.len(),
            MAX_ENVELOPE_BYTES,
        ));
    }

    let mut file = AtomicWriteFile::open(path)
        .map_err(|e| format!("open settings file for atomic write: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(std::fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("set settings file permissions: {e}"))?;
    }
    use std::io::Write;
    file.write_all(&payload)
        .map_err(|e| format!("write settings file: {e}"))?;
    file.commit()
        .map_err(|e| format!("commit settings file: {e}"))?;
    Ok(())
}

// ─── Encrypt / decrypt with the user's nsec ─────────────────────────────────

pub(super) fn encrypt_settings(keys: &Keys, plaintext: &str) -> Result<String, String> {
    if plaintext.as_bytes().len() > MAX_PLAINTEXT_BYTES {
        return Err(format!(
            "settings plaintext too large ({} bytes > {} cap)",
            plaintext.as_bytes().len(),
            MAX_PLAINTEXT_BYTES,
        ));
    }
    nip44::encrypt(
        keys.secret_key(),
        &keys.public_key(),
        plaintext,
        nip44::Version::V2,
    )
    .map_err(|e| format!("nip44 encrypt failed: {e}"))
}

pub(super) fn decrypt_settings(keys: &Keys, ciphertext: &str) -> Result<Zeroizing<String>, String> {
    let plain = nip44::decrypt(keys.secret_key(), &keys.public_key(), ciphertext)
        .map_err(|e| format!("nip44 decrypt failed: {e}"))?;
    Ok(Zeroizing::new(plain))
}

// ─── Validation (mirrors sprout-agent's config.rs::validate) ────────────────

/// Per-field length caps. All are env-var values that end up in the child
/// process env block, so we cap each conservatively and reject control chars
/// (which break naive env parsers and can sneak past simple log redaction).
pub(super) const MAX_API_KEY_BYTES: usize = 4 * 1024;
pub(super) const MAX_MODEL_BYTES: usize = 256;
pub(super) const MAX_BASE_URL_BYTES: usize = 2 * 1024;
pub(super) const MAX_VERSION_BYTES: usize = 64;
pub(super) const MAX_PROVIDER_ID_BYTES: usize = 64;

/// True for any C0 control char (0x00–0x1F) or DEL (0x7F). NUL is the
/// classic env-injection vector; CR/LF break log lines and some env parsers.
fn contains_control_char(s: &str) -> bool {
    s.chars().any(|c| c.is_control())
}

fn reject_control_chars(field: &str, value: &str) -> Result<(), String> {
    if contains_control_char(value) {
        return Err(format!(
            "{field} must not contain control characters (NUL, CR, LF, …)"
        ));
    }
    Ok(())
}

fn check_len(field: &str, value: &str, cap: usize) -> Result<(), String> {
    if value.as_bytes().len() > cap {
        return Err(format!(
            "{field} too large ({} bytes > {cap} cap)",
            value.as_bytes().len()
        ));
    }
    Ok(())
}

/// Validation for a free-form ASCII identifier: no whitespace, no control,
/// nonempty, length-capped. Used for `provider`, `detected_provider_id`,
/// `anthropic_api_version`.
fn validate_identifier(field: &str, value: &str, cap: usize) -> Result<(), String> {
    if value.is_empty() {
        return Err(format!("{field} must not be empty"));
    }
    if value.chars().any(|c| c.is_whitespace()) {
        return Err(format!("{field} must not contain whitespace"));
    }
    reject_control_chars(field, value)?;
    check_len(field, value, cap)
}

pub(super) fn validate_input(input: &AgentProviderSettingsInput) -> Result<(), String> {
    if input.provider != PROVIDER_ANTHROPIC && input.provider != PROVIDER_OPENAI {
        return Err(format!(
            "provider must be `{PROVIDER_ANTHROPIC}` or `{PROVIDER_OPENAI}`"
        ));
    }

    // `model` cannot be empty or all-whitespace, and must not contain control
    // chars (they'd break the env var the child reads). Trailing whitespace
    // is trimmed on the IPC boundary in `save_agent_provider_settings`.
    let model_trimmed = input.model.trim();
    if model_trimmed.is_empty() {
        return Err("model must not be empty".into());
    }
    reject_control_chars("model", &input.model)?;
    check_len("model", &input.model, MAX_MODEL_BYTES)?;

    if input.base_url.trim().is_empty() {
        return Err("base_url must not be empty".into());
    }
    reject_control_chars("base_url", &input.base_url)?;
    check_len("base_url", &input.base_url, MAX_BASE_URL_BYTES)?;
    // Validates scheme+host (rejects http://non-loopback, userinfo,
    // query, fragment) and locks origin for the reuse check.
    let _ = normalize_origin(&input.base_url)?;

    // detected_provider_id is an identifier (anthropic, openai, openrouter,
    // groq, custom, …) — no whitespace, no control chars.
    validate_identifier(
        "detected_provider_id",
        &input.detected_provider_id,
        MAX_PROVIDER_ID_BYTES,
    )?;

    if let Some(v) = &input.anthropic_api_version {
        if !v.is_empty() {
            validate_identifier("anthropic_api_version", v, MAX_VERSION_BYTES)?;
        }
    }

    if let Some(k) = &input.api_key {
        if !k.is_empty() {
            reject_control_chars("api_key", k)?;
            check_len("api_key", k, MAX_API_KEY_BYTES)?;
        }
    }

    if let Some(s) = &input.system_prompt {
        if s.as_bytes().len() > MAX_SYSTEM_PROMPT_BYTES {
            return Err(format!(
                "system_prompt too large ({} bytes > {} cap)",
                s.as_bytes().len(),
                MAX_SYSTEM_PROMPT_BYTES,
            ));
        }
        // NUL in a system prompt would terminate the env var early in the
        // child. Other controls (newlines, tabs) are intentionally allowed
        // because prompts contain prose.
        if s.contains('\0') {
            return Err("system_prompt must not contain NUL".into());
        }
    }
    if let Some(n) = input.max_output_tokens {
        if n < 1 {
            return Err("max_output_tokens must be >= 1".into());
        }
    }
    if let Some(n) = input.llm_timeout_secs {
        if n < 1 {
            return Err("llm_timeout_secs must be >= 1".into());
        }
    }
    if let Some(n) = input.tool_timeout_secs {
        if n < 1 {
            return Err("tool_timeout_secs must be >= 1".into());
        }
    }
    if let Some(n) = input.max_history_bytes {
        if n < MIN_HISTORY_BYTES {
            return Err(format!("max_history_bytes must be >= {MIN_HISTORY_BYTES}"));
        }
    }
    Ok(())
}

/// Same shape of checks as `validate_input`, but on a `StoredSettings`
/// (the decrypted on-disk plaintext). Spawn path uses this to fail closed
/// when an envelope written by an older / rolled-back build escapes the
/// save-time validation — e.g. a `base_url` of `http://api.example.com/v1`
/// (non-loopback HTTP) or a control char that would break the child's env
/// block. Anything `validate_input` would reject on save we also reject
/// here on load. Note: api_key emptiness is allowed for local providers
/// (the placeholder is a real string), so we only check control-chars/len
/// on the key itself rather than emptiness.
pub(super) fn validate_stored(s: &super::StoredSettings) -> Result<(), String> {
    if s.provider != super::PROVIDER_ANTHROPIC && s.provider != super::PROVIDER_OPENAI {
        return Err(format!(
            "provider must be `{}` or `{}`",
            super::PROVIDER_ANTHROPIC,
            super::PROVIDER_OPENAI,
        ));
    }
    if s.model.trim().is_empty() {
        return Err("model must not be empty".into());
    }
    reject_control_chars("model", &s.model)?;
    check_len("model", &s.model, MAX_MODEL_BYTES)?;

    if s.base_url.trim().is_empty() {
        return Err("base_url must not be empty".into());
    }
    reject_control_chars("base_url", &s.base_url)?;
    check_len("base_url", &s.base_url, MAX_BASE_URL_BYTES)?;
    let _ = normalize_origin(&s.base_url)?;

    validate_identifier(
        "detected_provider_id",
        &s.detected_provider_id,
        MAX_PROVIDER_ID_BYTES,
    )?;

    if let Some(v) = &s.anthropic_api_version {
        if !v.is_empty() {
            validate_identifier("anthropic_api_version", v, MAX_VERSION_BYTES)?;
        }
    }

    // The stored `api_key` is a required String (not Option) — local-provider
    // saves use a fixed placeholder, remote saves carry the real key. Both
    // must be free of control chars and within the size cap. Emptiness is
    // not a load-time failure: an older envelope might have stored "" if a
    // future flow allowed key-less providers; we'd rather inject empty than
    // refuse to spawn. The control-char/length checks are the security-
    // relevant ones (NUL terminates env vars, CR/LF break log redaction).
    if !s.api_key.is_empty() {
        reject_control_chars("api_key", &s.api_key)?;
        check_len("api_key", &s.api_key, MAX_API_KEY_BYTES)?;
    }

    if let Some(p) = &s.system_prompt {
        if p.as_bytes().len() > MAX_SYSTEM_PROMPT_BYTES {
            return Err(format!(
                "system_prompt too large ({} bytes > {} cap)",
                p.as_bytes().len(),
                MAX_SYSTEM_PROMPT_BYTES,
            ));
        }
        if p.contains('\0') {
            return Err("system_prompt must not contain NUL".into());
        }
    }
    if let Some(n) = s.max_output_tokens {
        if n < 1 {
            return Err("max_output_tokens must be >= 1".into());
        }
    }
    if let Some(n) = s.llm_timeout_secs {
        if n < 1 {
            return Err("llm_timeout_secs must be >= 1".into());
        }
    }
    if let Some(n) = s.tool_timeout_secs {
        if n < 1 {
            return Err("tool_timeout_secs must be >= 1".into());
        }
    }
    if let Some(n) = s.max_history_bytes {
        if n < MIN_HISTORY_BYTES {
            return Err(format!("max_history_bytes must be >= {MIN_HISTORY_BYTES}"));
        }
    }
    Ok(())
}
