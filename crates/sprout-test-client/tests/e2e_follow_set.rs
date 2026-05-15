//! End-to-end tests for NIP-51 follow sets (kind:30000).
//!
//! These tests require a running relay instance. By default they are marked
//! `#[ignore]` so that `cargo test` does not fail in CI when the relay is not
//! available.
//!
//! # Running
//!
//! Start the relay, then run:
//!
//! ```text
//! cargo test --test e2e_follow_set -- --ignored
//! ```
//!
//! Override the relay URL with the `RELAY_URL` environment variable:
//!
//! ```text
//! RELAY_URL=ws://relay.example.com cargo test --test e2e_follow_set -- --ignored
//! ```

use std::time::Duration;

use nostr::{Alphabet, EventBuilder, Filter, Keys, Kind, SingleLetterTag, Tag, Timestamp};
use sprout_test_client::SproutTestClient;

const KIND_FOLLOW_SET: u16 = 30000;
const KIND_DELETION: u16 = 5;

fn relay_url() -> String {
    std::env::var("RELAY_URL").unwrap_or_else(|_| "ws://localhost:3000".to_string())
}

fn sub_id(name: &str) -> String {
    format!("e2e-fs-{name}-{}", uuid::Uuid::new_v4())
}

/// Build a kind:30000 follow-set event tagging `members` as `p` entries.
fn build_follow_set(
    keys: &Keys,
    d_tag: &str,
    title: &str,
    members: &[nostr::PublicKey],
    extra_tags: Vec<Tag>,
) -> nostr::Event {
    let mut tags = vec![
        Tag::parse(&["d", d_tag]).unwrap(),
        Tag::parse(&["title", title]).unwrap(),
    ];
    for pk in members {
        tags.push(Tag::parse(&["p", &pk.to_hex()]).unwrap());
    }
    tags.extend(extra_tags);
    EventBuilder::new(Kind::Custom(KIND_FOLLOW_SET), "", tags)
        .sign_with_keys(keys)
        .unwrap()
}

// ── Tests ─────────────────────────────────────────────────────────────────────

/// kind:30000 events are accepted by the relay.
#[tokio::test]
#[ignore]
async fn test_follow_set_accepted() {
    let url = relay_url();
    let keys = Keys::generate();
    let mut client = SproutTestClient::connect(&url, &keys)
        .await
        .expect("connect");

    let member = Keys::generate();
    let event = build_follow_set(
        &keys,
        "backend-team-accept",
        "Backend Team",
        &[member.public_key()],
        vec![],
    );

    let ok = client.send_event(event).await.expect("send event");
    assert!(
        ok.accepted,
        "relay should accept kind:30000: {}",
        ok.message
    );

    client.disconnect().await.expect("disconnect");
}

/// kind:30000 events are retrievable via REQ with (kind, author, #d) filter —
/// the canonical NIP-33 addressing.
#[tokio::test]
#[ignore]
async fn test_follow_set_retrievable_by_d_tag() {
    let url = relay_url();
    let keys = Keys::generate();
    let mut client = SproutTestClient::connect(&url, &keys)
        .await
        .expect("connect");

    let d_tag = format!("retrieve-{}", uuid::Uuid::new_v4().simple());
    let m1 = Keys::generate();
    let m2 = Keys::generate();
    let event = build_follow_set(
        &keys,
        &d_tag,
        "Retrievable Set",
        &[m1.public_key(), m2.public_key()],
        vec![],
    );
    let event_id = event.id;

    let ok = client.send_event(event).await.expect("send event");
    assert!(ok.accepted, "relay should accept: {}", ok.message);

    let sid = sub_id("retrieve");
    let filter = Filter::new()
        .kind(Kind::Custom(KIND_FOLLOW_SET))
        .author(keys.public_key())
        .custom_tag(SingleLetterTag::lowercase(Alphabet::D), [d_tag.as_str()]);
    client
        .subscribe(&sid, vec![filter])
        .await
        .expect("subscribe");

    let events = client
        .collect_until_eose(&sid, Duration::from_secs(5))
        .await
        .expect("collect");

    let found = events
        .iter()
        .find(|e| e.id == event_id)
        .expect("set should be retrievable by (kind, author, #d)");
    let p_count = found
        .tags
        .iter()
        .filter(|t| t.kind().to_string() == "p")
        .count();
    assert_eq!(p_count, 2, "should carry both `p` members");

    client.disconnect().await.expect("disconnect");
}

/// kind:30000 is stored globally (channel_id = NULL) — stray h-tags are ignored.
#[tokio::test]
#[ignore]
async fn test_follow_set_stray_h_tag_ignored() {
    let url = relay_url();
    let keys = Keys::generate();
    let mut client = SproutTestClient::connect(&url, &keys)
        .await
        .expect("connect");

    let fake_channel = uuid::Uuid::new_v4().to_string();
    let d_tag = format!("stray-h-{}", uuid::Uuid::new_v4().simple());
    let member = Keys::generate();
    let event = build_follow_set(
        &keys,
        &d_tag,
        "Stray H-Tag Set",
        &[member.public_key()],
        vec![Tag::parse(&["h", &fake_channel]).unwrap()],
    );
    let event_id = event.id;

    let ok = client.send_event(event).await.expect("send event");
    assert!(ok.accepted, "relay should accept: {}", ok.message);

    // Query globally (no h-tag filter) — should still find the set.
    let sid = sub_id("stray-h");
    let filter = Filter::new()
        .kind(Kind::Custom(KIND_FOLLOW_SET))
        .author(keys.public_key());
    client
        .subscribe(&sid, vec![filter])
        .await
        .expect("subscribe");

    let events = client
        .collect_until_eose(&sid, Duration::from_secs(5))
        .await
        .expect("collect");

    assert!(
        events.iter().any(|e| e.id == event_id),
        "follow set with stray h-tag should be retrievable via global query"
    );

    // NOTE: the raw `h` tag remains on the stored event (Nostr events are
    // signed — tags cannot be stripped without breaking the signature). The
    // read-path filter matching in filter.rs treats explicit `h` tags as
    // authoritative — a pre-existing limitation of all global-only kinds.

    client.disconnect().await.expect("disconnect");
}

/// NIP-33 replacement: publishing a newer kind:30000 with the same d-tag
/// replaces the older one. Members in the new version are exactly what's stored.
#[tokio::test]
#[ignore]
async fn test_follow_set_nip33_replacement() {
    let url = relay_url();
    let keys = Keys::generate();
    let mut client = SproutTestClient::connect(&url, &keys)
        .await
        .expect("connect");

    let d_tag = format!("replace-{}", uuid::Uuid::new_v4().simple());

    // v1: two members
    let v1_a = Keys::generate();
    let v1_b = Keys::generate();
    let v1 = build_follow_set(
        &keys,
        &d_tag,
        "Team v1",
        &[v1_a.public_key(), v1_b.public_key()],
        vec![],
    );
    let ok1 = client.send_event(v1).await.expect("send v1");
    assert!(ok1.accepted, "v1 should be accepted: {}", ok1.message);

    tokio::time::sleep(Duration::from_secs(1)).await;

    // v2: one different member (full replace by spec).
    let v2_a = Keys::generate();
    let v2 = build_follow_set(&keys, &d_tag, "Team v2", &[v2_a.public_key()], vec![]);
    let v2_id = v2.id;
    let ok2 = client.send_event(v2).await.expect("send v2");
    assert!(ok2.accepted, "v2 should be accepted: {}", ok2.message);

    let sid = sub_id("replace");
    let filter = Filter::new()
        .kind(Kind::Custom(KIND_FOLLOW_SET))
        .author(keys.public_key())
        .custom_tag(SingleLetterTag::lowercase(Alphabet::D), [d_tag.as_str()]);
    client
        .subscribe(&sid, vec![filter])
        .await
        .expect("subscribe");

    let events = client
        .collect_until_eose(&sid, Duration::from_secs(5))
        .await
        .expect("collect");

    assert_eq!(events.len(), 1, "exactly one event after replacement");
    assert_eq!(events[0].id, v2_id, "surviving event should be v2");
    let p_members: Vec<_> = events[0]
        .tags
        .iter()
        .filter(|t| t.kind().to_string() == "p")
        .filter_map(|t| t.content().map(|s| s.to_string()))
        .collect();
    assert_eq!(p_members.len(), 1, "v2 should carry exactly one member");
    assert_eq!(
        p_members[0],
        v2_a.public_key().to_hex(),
        "v2 member should be the new one"
    );

    client.disconnect().await.expect("disconnect");
}

/// NIP-33 stale-write protection: an older event cannot replace a newer one.
#[tokio::test]
#[ignore]
async fn test_follow_set_stale_write_rejected() {
    let url = relay_url();
    let keys = Keys::generate();
    let mut client = SproutTestClient::connect(&url, &keys)
        .await
        .expect("connect");

    let d_tag = format!("stale-{}", uuid::Uuid::new_v4().simple());
    let newer_member = Keys::generate();
    let older_member = Keys::generate();

    let newer = {
        let tags = vec![
            Tag::parse(&["d", &d_tag]).unwrap(),
            Tag::parse(&["title", "Newer"]).unwrap(),
            Tag::parse(&["p", &newer_member.public_key().to_hex()]).unwrap(),
        ];
        EventBuilder::new(Kind::Custom(KIND_FOLLOW_SET), "", tags)
            .custom_created_at(Timestamp::from(nostr::Timestamp::now().as_u64() + 100))
            .sign_with_keys(&keys)
            .unwrap()
    };
    let newer_id = newer.id;
    let ok1 = client.send_event(newer).await.expect("send newer");
    assert!(ok1.accepted, "newer should be accepted: {}", ok1.message);

    let older = {
        let tags = vec![
            Tag::parse(&["d", &d_tag]).unwrap(),
            Tag::parse(&["title", "Older"]).unwrap(),
            Tag::parse(&["p", &older_member.public_key().to_hex()]).unwrap(),
        ];
        EventBuilder::new(Kind::Custom(KIND_FOLLOW_SET), "", tags)
            .custom_created_at(Timestamp::from(nostr::Timestamp::now().as_u64() - 100))
            .sign_with_keys(&keys)
            .unwrap()
    };
    let _ok2 = client.send_event(older).await.expect("send older");
    // Stale write may be rejected or accepted-as-duplicate — either way, the
    // older event must NOT replace the newer one.

    let sid = sub_id("stale");
    let filter = Filter::new()
        .kind(Kind::Custom(KIND_FOLLOW_SET))
        .author(keys.public_key())
        .custom_tag(SingleLetterTag::lowercase(Alphabet::D), [d_tag.as_str()]);
    client
        .subscribe(&sid, vec![filter])
        .await
        .expect("subscribe");

    let events = client
        .collect_until_eose(&sid, Duration::from_secs(5))
        .await
        .expect("collect");

    assert_eq!(events.len(), 1, "exactly one event after stale write");
    assert_eq!(events[0].id, newer_id, "surviving event is the newer one");

    client.disconnect().await.expect("disconnect");
}

/// NIP-09 deletion of a follow set: a kind:5 event with `a`+`k` tags addressing
/// the (30000, author, d) tuple removes the set from query results.
#[tokio::test]
#[ignore]
async fn test_follow_set_deletion_via_nip09() {
    let url = relay_url();
    let keys = Keys::generate();
    let mut client = SproutTestClient::connect(&url, &keys)
        .await
        .expect("connect");

    let d_tag = format!("delete-{}", uuid::Uuid::new_v4().simple());
    let member = Keys::generate();
    let event = build_follow_set(
        &keys,
        &d_tag,
        "To Be Deleted",
        &[member.public_key()],
        vec![],
    );

    let ok = client.send_event(event).await.expect("send event");
    assert!(ok.accepted, "set should be accepted: {}", ok.message);

    // Emit kind:5 deletion addressed to (30000, author, d).
    let address = format!("30000:{}:{}", keys.public_key().to_hex(), d_tag);
    let deletion = EventBuilder::new(
        Kind::Custom(KIND_DELETION),
        "",
        vec![
            Tag::parse(&["a", &address]).unwrap(),
            Tag::parse(&["k", "30000"]).unwrap(),
        ],
    )
    .sign_with_keys(&keys)
    .unwrap();

    let ok_del = client.send_event(deletion).await.expect("send deletion");
    assert!(
        ok_del.accepted,
        "deletion should be accepted: {}",
        ok_del.message
    );

    // Verify the set is no longer returned by (kind, author, #d).
    let sid = sub_id("delete");
    let filter = Filter::new()
        .kind(Kind::Custom(KIND_FOLLOW_SET))
        .author(keys.public_key())
        .custom_tag(SingleLetterTag::lowercase(Alphabet::D), [d_tag.as_str()]);
    client
        .subscribe(&sid, vec![filter])
        .await
        .expect("subscribe");

    let events = client
        .collect_until_eose(&sid, Duration::from_secs(5))
        .await
        .expect("collect");

    assert!(
        events.is_empty(),
        "deleted follow set should not be returned by REQ"
    );

    client.disconnect().await.expect("disconnect");
}
