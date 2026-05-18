//! Stub for the `huddle` module — compiled when the `huddle` feature is OFF.
//!
//! Mirrors the public surface of `crate::huddle` so that `lib.rs`, `app_state.rs`,
//! and `generate_handler!` keep compiling and the Tauri command set is unchanged.
//! All operations that would start audio, download models, or speak return
//! `Err("voice/huddle is disabled in this build")`; read-only queries return
//! idle/empty values so the frontend renders gracefully.

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::app_state::AppState;

const DISABLED: &str = "voice/huddle is disabled in this build";

// ── Public types (mirror src/huddle/state.rs) ────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum VoiceInputMode {
    #[default]
    PushToTalk,
    VoiceActivity,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum HuddlePhase {
    #[default]
    Idle,
    Creating,
    Connecting,
    Connected,
    Active,
    Leaving,
}

/// Idle huddle state — no audio pipelines, no participants. The `Default` impl
/// is the only state this build ever produces.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct HuddleState {
    pub phase: HuddlePhase,
    pub parent_channel_id: Option<String>,
    pub ephemeral_channel_id: Option<String>,
    pub participants: Vec<String>,
    pub agent_pubkeys: Vec<String>,
    pub is_creator: bool,
    pub tts_enabled: bool,
    pub voice_input_mode: VoiceInputMode,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HuddleJoinInfo {
    pub ephemeral_channel_id: String,
}

// ── Submodule stubs ──────────────────────────────────────────────────────────

pub mod state {
    use super::HuddleState;
    /// No-op in the light build — no UI listeners exist for huddle events.
    /// Kept for API parity with the real module so `app_state` compiles unchanged.
    #[allow(dead_code)]
    pub fn emit_huddle_state(_app: &tauri::AppHandle, _state: &HuddleState) {}
}

pub mod models {
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "snake_case")]
    pub enum ModelStatus {
        NotDownloaded,
        Downloading { progress_percent: u8 },
        Ready,
        Error(String),
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub struct VoiceModelStatus {
        pub stt: ModelStatus,
        pub kokoro: ModelStatus,
    }

    /// Always `None` in the light build. Kept for API parity — the predownload
    /// call site in `setup()` is itself `#[cfg(feature = "huddle")]` so this is
    /// never called, but the symbol must exist so non-gated import paths resolve.
    #[allow(dead_code)]
    pub fn global_model_manager() -> Option<&'static ()> {
        None
    }
}

pub mod audio_output {
    use tauri::State;

    use crate::app_state::AppState;

    #[derive(Debug, serde::Serialize)]
    pub struct AudioOutputDevice {
        pub name: String,
        pub is_default: bool,
    }

    /// Light build has no audio backend — return an empty list so the
    /// frontend renders an empty picker rather than a hard error.
    #[tauri::command]
    pub fn list_audio_output_devices() -> Result<Vec<AudioOutputDevice>, String> {
        Ok(Vec::new())
    }

    #[tauri::command]
    pub fn set_audio_output_device(
        _name: String,
        _state: State<'_, AppState>,
    ) -> Result<(), String> {
        Err(super::DISABLED.to_string())
    }

    #[tauri::command]
    pub fn get_audio_output_device(_state: State<'_, AppState>) -> Result<String, String> {
        Ok(String::new())
    }
}

pub mod agents {
    use serde::Serialize;

    #[derive(Debug, Serialize)]
    pub struct AgentAddResult {
        pub ephemeral_added: bool,
        pub parent_added: bool,
        pub parent_error: Option<String>,
    }
}

// ── Tauri commands (mirror src/huddle/mod.rs) ────────────────────────────────

#[tauri::command]
pub async fn set_voice_input_mode(
    _mode: VoiceInputMode,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    Err(DISABLED.to_string())
}

#[tauri::command]
pub fn get_voice_input_mode(_state: State<'_, AppState>) -> Result<VoiceInputMode, String> {
    Ok(VoiceInputMode::default())
}

#[tauri::command]
pub async fn start_huddle(
    _parent_channel_id: String,
    _member_pubkeys: Vec<String>,
    _state: State<'_, AppState>,
) -> Result<HuddleJoinInfo, String> {
    Err(DISABLED.to_string())
}

#[tauri::command]
pub async fn join_huddle(
    _parent_channel_id: String,
    _ephemeral_channel_id: String,
    _state: State<'_, AppState>,
) -> Result<HuddleJoinInfo, String> {
    Err(DISABLED.to_string())
}

#[tauri::command]
pub async fn leave_huddle(_state: State<'_, AppState>) -> Result<(), String> {
    Err(DISABLED.to_string())
}

#[tauri::command]
pub async fn end_huddle(_force: Option<bool>, _state: State<'_, AppState>) -> Result<(), String> {
    Err(DISABLED.to_string())
}

#[tauri::command]
pub async fn confirm_huddle_active(_state: State<'_, AppState>) -> Result<(), String> {
    Err(DISABLED.to_string())
}

#[tauri::command]
pub fn get_huddle_state(_state: State<'_, AppState>) -> Result<HuddleState, String> {
    Ok(HuddleState::default())
}

#[tauri::command]
pub async fn get_huddle_agent_pubkeys(_state: State<'_, AppState>) -> Result<Vec<String>, String> {
    Ok(Vec::new())
}

#[tauri::command]
pub fn push_audio_pcm(
    _request: tauri::ipc::Request<'_>,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    Err(DISABLED.to_string())
}

#[tauri::command]
pub async fn check_pipeline_hotstart(_state: State<'_, AppState>) -> Result<(), String> {
    // No pipelines to hot-start. Treat as a no-op rather than an error so
    // periodic frontend polling doesn't spam an error toast.
    Ok(())
}

#[tauri::command]
pub async fn start_stt_pipeline(_state: State<'_, AppState>) -> Result<(), String> {
    Err(DISABLED.to_string())
}

#[tauri::command]
pub async fn download_voice_models(_state: State<'_, AppState>) -> Result<(), String> {
    Err(DISABLED.to_string())
}

#[tauri::command]
pub fn get_model_status(_state: State<'_, AppState>) -> Result<models::VoiceModelStatus, String> {
    Ok(models::VoiceModelStatus {
        stt: models::ModelStatus::NotDownloaded,
        kokoro: models::ModelStatus::NotDownloaded,
    })
}

#[tauri::command]
pub async fn set_tts_enabled(_enabled: bool, _state: State<'_, AppState>) -> Result<(), String> {
    Err(DISABLED.to_string())
}

#[tauri::command]
pub async fn speak_agent_message(_text: String, _state: State<'_, AppState>) -> Result<(), String> {
    // Silent no-op: the frontend may call this for every incoming agent
    // message in a huddle context. Returning Err would spam the console
    // with errors the user can't act on.
    Ok(())
}

#[tauri::command]
pub async fn add_agent_to_huddle(
    _agent_pubkey: String,
    _state: State<'_, AppState>,
) -> Result<agents::AgentAddResult, String> {
    Err(DISABLED.to_string())
}
