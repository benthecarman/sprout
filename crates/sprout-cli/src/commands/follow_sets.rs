//! `sprout follow-sets` — NIP-51 follow set CRUD (kind:30000).
//!
//! Four subcommands: `list`, `get`, `put`, `delete`. The CLI is a thin wrapper
//! around `sprout_sdk::build_follow_set` / `build_delete_follow_set`; query
//! commands hit the relay's `POST /query` HTTP bridge with explicit
//! `{kinds: [30000], authors: [...], #d: [...]}` filters.

use crate::client::SproutClient;
use crate::error::CliError;
use crate::validate::validate_hex64;

/// Resolve `author` to a 64-char hex pubkey, defaulting to the CLI's own.
fn resolve_author(client: &SproutClient, author: Option<&str>) -> Result<String, CliError> {
    match author {
        Some(a) => {
            validate_hex64(a)?;
            Ok(a.to_ascii_lowercase())
        }
        None => Ok(client.keys().public_key().to_hex()),
    }
}

/// `sprout follow-sets list` — return the caller's kind:30000 events.
pub async fn cmd_list(client: &SproutClient) -> Result<(), CliError> {
    let author = client.keys().public_key().to_hex();
    let filter = serde_json::json!({
        "kinds": [30000],
        "authors": [author],
    });
    let resp = client.query(&filter).await?;
    println!("{resp}");
    Ok(())
}

/// `sprout follow-sets get` — fetch a single set by `(author, d)`.
pub async fn cmd_get(client: &SproutClient, d: &str, author: Option<&str>) -> Result<(), CliError> {
    if d.is_empty() {
        return Err(CliError::Usage("--d must not be empty".into()));
    }
    let author = resolve_author(client, author)?;
    let filter = serde_json::json!({
        "kinds": [30000],
        "authors": [author],
        "#d": [d],
        "limit": 1,
    });
    let resp = client.query(&filter).await?;
    println!("{resp}");
    Ok(())
}

/// `sprout follow-sets put` — create or replace the set at `d`.
pub async fn cmd_put(
    client: &SproutClient,
    d: &str,
    title: Option<&str>,
    description: Option<&str>,
    members: &[String],
) -> Result<(), CliError> {
    let members_ref: Vec<&str> = members.iter().map(String::as_str).collect();
    let builder = sprout_sdk::build_follow_set(d, &members_ref, title, description)
        .map_err(|e| CliError::Other(format!("build_follow_set failed: {e}")))?;
    let event = client.sign_event(builder)?;
    let resp = client.submit_event(event).await?;
    println!("{resp}");
    Ok(())
}

/// `sprout follow-sets delete` — emit a NIP-09 deletion against the caller's
/// own kind:30000 at `d`. Deleting someone else's set is meaningless and the
/// CLI refuses by always signing as the caller.
pub async fn cmd_delete(client: &SproutClient, d: &str) -> Result<(), CliError> {
    let author = client.keys().public_key().to_hex();
    let builder = sprout_sdk::build_delete_follow_set(d, &author)
        .map_err(|e| CliError::Other(format!("build_delete_follow_set failed: {e}")))?;
    let event = client.sign_event(builder)?;
    let resp = client.submit_event(event).await?;
    println!("{resp}");
    Ok(())
}

// ── Helpers shared with `channels add-member --follow-set` ───────────────────

/// Fetched follow set: title + member pubkeys (64-char hex, lowercase).
#[derive(Debug)]
pub struct FollowSetView {
    pub title: Option<String>,
    pub members: Vec<String>,
}

/// Fetch a follow set from the relay and parse out its title + members.
/// Returns `None` if no set exists for `(author, d)`.
pub async fn fetch_follow_set(
    client: &SproutClient,
    d: &str,
    author: &str,
) -> Result<Option<FollowSetView>, CliError> {
    let filter = serde_json::json!({
        "kinds": [30000],
        "authors": [author],
        "#d": [d],
        "limit": 1,
    });
    let raw = client.query(&filter).await?;
    let events: serde_json::Value = serde_json::from_str(&raw).map_err(|e| {
        CliError::Other(format!("relay returned non-JSON for follow-set query: {e}"))
    })?;
    let arr = events
        .as_array()
        .ok_or_else(|| CliError::Other("relay /query did not return an array".into()))?;
    let Some(event) = arr.first() else {
        return Ok(None);
    };
    let mut title: Option<String> = None;
    let mut members: Vec<String> = Vec::new();
    if let Some(tags) = event.get("tags").and_then(|t| t.as_array()) {
        for tag in tags {
            let parts = match tag.as_array() {
                Some(a) => a,
                None => continue,
            };
            let name = parts.first().and_then(|v| v.as_str()).unwrap_or("");
            let value = parts.get(1).and_then(|v| v.as_str()).unwrap_or("");
            match name {
                "title" if !value.is_empty() => title = Some(value.to_string()),
                "p" if value.len() == 64 && value.chars().all(|c| c.is_ascii_hexdigit()) => {
                    members.push(value.to_ascii_lowercase());
                }
                _ => {}
            }
        }
    }
    Ok(Some(FollowSetView { title, members }))
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

pub async fn dispatch(cmd: crate::FollowSetsCmd, client: &SproutClient) -> Result<(), CliError> {
    use crate::FollowSetsCmd;
    match cmd {
        FollowSetsCmd::List => cmd_list(client).await,
        FollowSetsCmd::Get { d, author } => cmd_get(client, &d, author.as_deref()).await,
        FollowSetsCmd::Put {
            d,
            title,
            description,
            members,
        } => {
            cmd_put(
                client,
                &d,
                title.as_deref(),
                description.as_deref(),
                &members,
            )
            .await
        }
        FollowSetsCmd::Delete { d } => cmd_delete(client, &d).await,
    }
}
