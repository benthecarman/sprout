use uuid::Uuid;

use crate::client::SproutClient;
use crate::error::CliError;
use crate::validate::{parse_uuid, read_or_stdin, validate_hex64, validate_uuid};

// ---------------------------------------------------------------------------
// Read commands — POST /query
// ---------------------------------------------------------------------------

pub async fn cmd_list_channels(
    client: &SproutClient,
    _visibility: Option<&str>,
    _member: Option<bool>,
) -> Result<(), CliError> {
    // Query kind:39002 channel metadata events.
    // If member=true, filter by #p tag containing our pubkey.
    let my_pk = client.keys().public_key().to_hex();
    let mut filter = serde_json::json!({
        "kinds": [39002]
    });
    // When member filter is requested, query channels where we're a participant
    if _member == Some(true) {
        filter["#p"] = serde_json::json!([my_pk]);
    }
    // Visibility filtering is done client-side from the returned events
    let resp = client.query(&filter).await?;
    println!("{resp}");
    Ok(())
}

pub async fn cmd_get_channel(client: &SproutClient, channel_id: &str) -> Result<(), CliError> {
    validate_uuid(channel_id)?;
    // Query kind:39002 with #h tag matching the channel UUID
    let filter = serde_json::json!({
        "kinds": [39002],
        "#h": [channel_id]
    });
    let resp = client.query(&filter).await?;
    println!("{resp}");
    Ok(())
}

pub async fn cmd_list_channel_members(
    client: &SproutClient,
    channel_id: &str,
) -> Result<(), CliError> {
    validate_uuid(channel_id)?;
    // Query kind:39002 channel metadata — members are in the p-tags
    let filter = serde_json::json!({
        "kinds": [39002],
        "#h": [channel_id]
    });
    let resp = client.query(&filter).await?;
    println!("{resp}");
    Ok(())
}

pub async fn cmd_get_canvas(client: &SproutClient, channel_id: &str) -> Result<(), CliError> {
    validate_uuid(channel_id)?;
    // Canvas is kind:40100 with #h tag
    let filter = serde_json::json!({
        "kinds": [40100],
        "#h": [channel_id]
    });
    let resp = client.query(&filter).await?;
    println!("{resp}");
    Ok(())
}

// ---------------------------------------------------------------------------
// Write commands — signed events via POST /events
// ---------------------------------------------------------------------------

pub async fn cmd_create_channel(
    client: &SproutClient,
    name: &str,
    channel_type: &str,
    visibility: &str,
    description: Option<&str>,
) -> Result<(), CliError> {
    match channel_type {
        "stream" | "forum" => {}
        _ => {
            return Err(CliError::Usage(format!(
                "--type must be 'stream' or 'forum' (got: {channel_type})"
            )))
        }
    }
    match visibility {
        "open" | "private" => {}
        _ => {
            return Err(CliError::Usage(format!(
                "--visibility must be 'open' or 'private' (got: {visibility})"
            )))
        }
    }

    let channel_uuid = Uuid::new_v4();

    let vis = match visibility {
        "open" => sprout_sdk::Visibility::Open,
        "private" => sprout_sdk::Visibility::Private,
        _ => unreachable!(),
    };
    let ct = match channel_type {
        "stream" => sprout_sdk::ChannelKind::Stream,
        "forum" => sprout_sdk::ChannelKind::Forum,
        _ => unreachable!(),
    };
    let builder =
        sprout_sdk::build_create_channel(channel_uuid, name, Some(vis), Some(ct), description)
            .map_err(|e| CliError::Other(format!("build_create_channel failed: {e}")))?;

    let event = client.sign_event(builder)?;
    let resp = client.submit_event(event).await?;
    println!("{resp}");
    Ok(())
}

pub async fn cmd_update_channel(
    client: &SproutClient,
    channel_id: &str,
    name: Option<&str>,
    description: Option<&str>,
) -> Result<(), CliError> {
    if name.is_none() && description.is_none() {
        return Err(CliError::Usage(
            "at least one field required (--name, --description)".into(),
        ));
    }
    let channel_uuid = parse_uuid(channel_id)?;

    let builder = sprout_sdk::build_update_channel(channel_uuid, name, description)
        .map_err(|e| CliError::Other(format!("build_update_channel failed: {e}")))?;

    let event = client.sign_event(builder)?;
    let resp = client.submit_event(event).await?;
    println!("{resp}");
    Ok(())
}

pub async fn cmd_set_channel_topic(
    client: &SproutClient,
    channel_id: &str,
    topic: &str,
) -> Result<(), CliError> {
    let channel_uuid = parse_uuid(channel_id)?;

    let builder = sprout_sdk::build_set_topic(channel_uuid, topic)
        .map_err(|e| CliError::Other(format!("build_set_topic failed: {e}")))?;

    let event = client.sign_event(builder)?;
    let resp = client.submit_event(event).await?;
    println!("{resp}");
    Ok(())
}

pub async fn cmd_set_channel_purpose(
    client: &SproutClient,
    channel_id: &str,
    purpose: &str,
) -> Result<(), CliError> {
    let channel_uuid = parse_uuid(channel_id)?;

    let builder = sprout_sdk::build_set_purpose(channel_uuid, purpose)
        .map_err(|e| CliError::Other(format!("build_set_purpose failed: {e}")))?;

    let event = client.sign_event(builder)?;
    let resp = client.submit_event(event).await?;
    println!("{resp}");
    Ok(())
}

pub async fn cmd_join_channel(client: &SproutClient, channel_id: &str) -> Result<(), CliError> {
    let channel_uuid = parse_uuid(channel_id)?;

    let builder = sprout_sdk::build_join(channel_uuid)
        .map_err(|e| CliError::Other(format!("build_join failed: {e}")))?;

    let event = client.sign_event(builder)?;
    let resp = client.submit_event(event).await?;
    println!("{resp}");
    Ok(())
}

pub async fn cmd_leave_channel(client: &SproutClient, channel_id: &str) -> Result<(), CliError> {
    let channel_uuid = parse_uuid(channel_id)?;

    let builder = sprout_sdk::build_leave(channel_uuid)
        .map_err(|e| CliError::Other(format!("build_leave failed: {e}")))?;

    let event = client.sign_event(builder)?;
    let resp = client.submit_event(event).await?;
    println!("{resp}");
    Ok(())
}

pub async fn cmd_archive_channel(client: &SproutClient, channel_id: &str) -> Result<(), CliError> {
    let channel_uuid = parse_uuid(channel_id)?;

    let builder = sprout_sdk::build_archive(channel_uuid)
        .map_err(|e| CliError::Other(format!("build_archive failed: {e}")))?;

    let event = client.sign_event(builder)?;
    let resp = client.submit_event(event).await?;
    println!("{resp}");
    Ok(())
}

pub async fn cmd_unarchive_channel(
    client: &SproutClient,
    channel_id: &str,
) -> Result<(), CliError> {
    let channel_uuid = parse_uuid(channel_id)?;

    let builder = sprout_sdk::build_unarchive(channel_uuid)
        .map_err(|e| CliError::Other(format!("build_unarchive failed: {e}")))?;

    let event = client.sign_event(builder)?;
    let resp = client.submit_event(event).await?;
    println!("{resp}");
    Ok(())
}

pub async fn cmd_delete_channel(client: &SproutClient, channel_id: &str) -> Result<(), CliError> {
    let channel_uuid = parse_uuid(channel_id)?;

    let builder = sprout_sdk::build_delete_channel(channel_uuid)
        .map_err(|e| CliError::Other(format!("build_delete_channel failed: {e}")))?;

    let event = client.sign_event(builder)?;
    let resp = client.submit_event(event).await?;
    println!("{resp}");
    Ok(())
}

fn parse_role(role: Option<&str>) -> Result<Option<sprout_sdk::MemberRole>, CliError> {
    match role {
        None => Ok(None),
        Some("owner") => Ok(Some(sprout_sdk::MemberRole::Owner)),
        Some("admin") => Ok(Some(sprout_sdk::MemberRole::Admin)),
        Some("member") => Ok(Some(sprout_sdk::MemberRole::Member)),
        Some("guest") => Ok(Some(sprout_sdk::MemberRole::Guest)),
        Some("bot") => Ok(Some(sprout_sdk::MemberRole::Bot)),
        Some(other) => Err(CliError::Usage(format!(
            "--role must be owner/admin/member/guest/bot (got: {other})"
        ))),
    }
}

pub async fn cmd_add_channel_member(
    client: &SproutClient,
    channel_id: &str,
    pubkey: Option<&str>,
    follow_set: Option<&str>,
    follow_set_author: Option<&str>,
    role: Option<&str>,
) -> Result<(), CliError> {
    let channel_uuid = parse_uuid(channel_id)?;
    let typed_role = parse_role(role)?;

    match (pubkey, follow_set) {
        (Some(pk), None) => {
            validate_hex64(pk)?;
            let builder = sprout_sdk::build_add_member(channel_uuid, pk, typed_role)
                .map_err(|e| CliError::Other(format!("build_add_member failed: {e}")))?;
            let event = client.sign_event(builder)?;
            let resp = client.submit_event(event).await?;
            println!("{resp}");
            Ok(())
        }
        (None, Some(d)) => {
            let author = match follow_set_author {
                Some(a) => {
                    validate_hex64(a)?;
                    a.to_ascii_lowercase()
                }
                None => client.keys().public_key().to_hex(),
            };
            let set = super::follow_sets::fetch_follow_set(client, d, &author)
                .await?
                .ok_or_else(|| {
                    CliError::Usage(format!("no follow set found for d=`{d}` author=`{author}`"))
                })?;
            if set.members.is_empty() {
                return Err(CliError::Usage(format!(
                    "follow set `{}` has zero members; nothing to add",
                    set.title.unwrap_or_else(|| d.to_string())
                )));
            }
            fan_out_membership(
                client,
                channel_uuid,
                &set.members,
                |ch, pk| -> Result<nostr::EventBuilder, sprout_sdk::SdkError> {
                    sprout_sdk::build_add_member(ch, pk, typed_role)
                },
                "add",
            )
            .await
        }
        // clap's `required_unless_present` guarantees we don't see (None, None).
        _ => Err(CliError::Usage(
            "--pubkey and --follow-set are mutually exclusive".into(),
        )),
    }
}

pub async fn cmd_remove_channel_member(
    client: &SproutClient,
    channel_id: &str,
    pubkey: Option<&str>,
    follow_set: Option<&str>,
    follow_set_author: Option<&str>,
) -> Result<(), CliError> {
    let channel_uuid = parse_uuid(channel_id)?;

    match (pubkey, follow_set) {
        (Some(pk), None) => {
            validate_hex64(pk)?;
            let builder = sprout_sdk::build_remove_member(channel_uuid, pk)
                .map_err(|e| CliError::Other(format!("build_remove_member failed: {e}")))?;
            let event = client.sign_event(builder)?;
            let resp = client.submit_event(event).await?;
            println!("{resp}");
            Ok(())
        }
        (None, Some(d)) => {
            let author = match follow_set_author {
                Some(a) => {
                    validate_hex64(a)?;
                    a.to_ascii_lowercase()
                }
                None => client.keys().public_key().to_hex(),
            };
            let set = super::follow_sets::fetch_follow_set(client, d, &author)
                .await?
                .ok_or_else(|| {
                    CliError::Usage(format!("no follow set found for d=`{d}` author=`{author}`"))
                })?;
            if set.members.is_empty() {
                return Err(CliError::Usage(format!(
                    "follow set `{}` has zero members; nothing to remove",
                    set.title.unwrap_or_else(|| d.to_string())
                )));
            }
            fan_out_membership(
                client,
                channel_uuid,
                &set.members,
                |ch, pk| -> Result<nostr::EventBuilder, sprout_sdk::SdkError> {
                    sprout_sdk::build_remove_member(ch, pk)
                },
                "remove",
            )
            .await
        }
        _ => Err(CliError::Usage(
            "--pubkey and --follow-set are mutually exclusive".into(),
        )),
    }
}

/// Iterate `members`, sign + submit one event per pubkey, and print a JSON
/// summary `{ok, failed, results}`. Failures don't abort the loop — every
/// member gets a result row, so a partial outage is visible.
async fn fan_out_membership<F>(
    client: &SproutClient,
    channel_uuid: uuid::Uuid,
    members: &[String],
    builder_fn: F,
    verb: &str,
) -> Result<(), CliError>
where
    F: Fn(uuid::Uuid, &str) -> Result<nostr::EventBuilder, sprout_sdk::SdkError>,
{
    let mut results = Vec::with_capacity(members.len());
    let mut ok_count = 0usize;
    let mut failed_count = 0usize;
    for pk in members {
        let builder = match builder_fn(channel_uuid, pk) {
            Ok(b) => b,
            Err(e) => {
                failed_count += 1;
                results.push(serde_json::json!({
                    "pubkey": pk,
                    "ok": false,
                    "error": format!("build error: {e}"),
                }));
                continue;
            }
        };
        let event = match client.sign_event(builder) {
            Ok(ev) => ev,
            Err(e) => {
                failed_count += 1;
                results.push(serde_json::json!({
                    "pubkey": pk,
                    "ok": false,
                    "error": format!("sign error: {e}"),
                }));
                continue;
            }
        };
        match client.submit_event(event).await {
            Ok(resp) => {
                ok_count += 1;
                results.push(serde_json::json!({
                    "pubkey": pk,
                    "ok": true,
                    "response": serde_json::from_str::<serde_json::Value>(&resp)
                        .unwrap_or(serde_json::Value::String(resp)),
                }));
            }
            Err(e) => {
                failed_count += 1;
                results.push(serde_json::json!({
                    "pubkey": pk,
                    "ok": false,
                    "error": e.to_string(),
                }));
            }
        }
    }
    let summary = serde_json::json!({
        "verb": verb,
        "channel": channel_uuid.to_string(),
        "ok": ok_count,
        "failed": failed_count,
        "results": results,
    });
    println!("{}", serde_json::to_string_pretty(&summary).unwrap());
    if failed_count > 0 {
        Err(CliError::Other(format!(
            "{failed_count} of {} {verb}-member operations failed",
            members.len()
        )))
    } else {
        Ok(())
    }
}

pub async fn cmd_set_canvas(
    client: &SproutClient,
    channel_id: &str,
    content: &str,
) -> Result<(), CliError> {
    let content = read_or_stdin(content)?;
    let channel_uuid = parse_uuid(channel_id)?;

    let builder = sprout_sdk::build_set_canvas(channel_uuid, &content)
        .map_err(|e| CliError::Other(format!("build_set_canvas failed: {e}")))?;

    let event = client.sign_event(builder)?;
    let resp = client.submit_event(event).await?;
    println!("{resp}");
    Ok(())
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

pub async fn dispatch(cmd: crate::ChannelsCmd, client: &SproutClient) -> Result<(), CliError> {
    use crate::ChannelsCmd;
    match cmd {
        ChannelsCmd::List { visibility, member } => {
            let vis_str = visibility.as_ref().map(|v| v.to_string());
            cmd_list_channels(client, vis_str.as_deref(), Some(member)).await
        }
        ChannelsCmd::Get { channel } => cmd_get_channel(client, &channel).await,
        ChannelsCmd::Create {
            name,
            channel_type,
            visibility,
            description,
        } => {
            cmd_create_channel(
                client,
                &name,
                &channel_type.to_string(),
                &visibility.to_string(),
                description.as_deref(),
            )
            .await
        }
        ChannelsCmd::Update {
            channel,
            name,
            description,
        } => cmd_update_channel(client, &channel, name.as_deref(), description.as_deref()).await,
        ChannelsCmd::Topic { channel, topic } => {
            cmd_set_channel_topic(client, &channel, &topic).await
        }
        ChannelsCmd::Purpose { channel, purpose } => {
            cmd_set_channel_purpose(client, &channel, &purpose).await
        }
        ChannelsCmd::Join { channel } => cmd_join_channel(client, &channel).await,
        ChannelsCmd::Leave { channel } => cmd_leave_channel(client, &channel).await,
        ChannelsCmd::Archive { channel } => cmd_archive_channel(client, &channel).await,
        ChannelsCmd::Unarchive { channel } => cmd_unarchive_channel(client, &channel).await,
        ChannelsCmd::Delete { channel } => cmd_delete_channel(client, &channel).await,
        ChannelsCmd::Members { channel } => cmd_list_channel_members(client, &channel).await,
        ChannelsCmd::AddMember {
            channel,
            pubkey,
            follow_set,
            author,
            role,
        } => {
            cmd_add_channel_member(
                client,
                &channel,
                pubkey.as_deref(),
                follow_set.as_deref(),
                author.as_deref(),
                role.as_deref(),
            )
            .await
        }
        ChannelsCmd::RemoveMember {
            channel,
            pubkey,
            follow_set,
            author,
        } => {
            cmd_remove_channel_member(
                client,
                &channel,
                pubkey.as_deref(),
                follow_set.as_deref(),
                author.as_deref(),
            )
            .await
        }
    }
}

pub async fn dispatch_canvas(cmd: crate::CanvasCmd, client: &SproutClient) -> Result<(), CliError> {
    use crate::CanvasCmd;
    match cmd {
        CanvasCmd::Get { channel } => cmd_get_canvas(client, &channel).await,
        CanvasCmd::Set { channel, content } => cmd_set_canvas(client, &channel, &content).await,
    }
}
