NIP-51 (Sprout scope)
=====================

Lists — what Sprout supports
----------------------------

`draft` `optional`

## Scope

Sprout advertises NIP-51 in its NIP-11 `supported_nips` array, but it accepts
only **one** of the kinds defined by upstream NIP-51:

| Kind   | Name                              | Accepted? |
| ------ | --------------------------------- | --------- |
| 30000  | **Follow set** (named pubkey list)| **yes**   |
| 10000–10005, 30001–30005, 30015–30030, 39089, … | other NIP-51 list kinds | no        |

A follow set is a parameterized-replaceable event (NIP-33) addressed by
`(pubkey, kind, d-tag)`. Its body is `p` tags listing pubkeys; `title`,
`description`, and `image` tags are optional metadata. Sprout treats each set
as personal, user-owned data — authoring one requires the user's `UsersWrite`
scope, the same scope used for kind:3 contact lists, kind:0 profiles, and
kind:30078 read state.

## What this is for in Sprout

Named, reusable rosters of existing pubkeys (e.g. "Backend Team", "On-call
SRE", "AI agents"). A client can apply a set to a channel by iterating the
roster and emitting normal `kind:9000` add-member events for each member —
the relay does not learn that the membership change came from a follow set.
Every membership change remains an individually auditable Nostr event.

## What this is **not**

- **Not a starter pack** (kind:39089). Same shape, different semantics; out of
  scope for v1.
- **Not encrypted.** NIP-51 permits `p` entries in NIP-44-encrypted `content`
  for private lists. Sprout v1 accepts public lists only.
- **Not a group abstraction.** Applying a set is a client-side fan-out into
  existing membership events; the relay has no notion of "team membership".
  No auto-sync — editing a set does not retroactively touch channels it was
  previously applied to.
- **Not a substitute for kind:3** (NIP-02 contact list). Kind:3 is a singleton
  per signer; kind:30000 allows multiple named groupings per signer.

## Reserved d-tags

Upstream NIP-51 lists deprecated legacy d-tag values that have since migrated
to kind:10000–10004:

- `mute` (migrated to kind:10000)
- `pin` (migrated to kind:10001)
- `bookmark` (migrated to kind:10003)
- `communities` (migrated to kind:10004)

The Sprout SDK and CLI **reject** these d-tag values on kind:30000 so clients
cannot accidentally create confusing semi-interoperable events. The relay does
not enforce this; it is purely a client-side guardrail.

## Deletion

A follow set is deleted via NIP-09: a `kind:5` event signed by the set's
author, tagging the address with `["a", "30000:<author>:<d>"]` and the kind
with `["k", "30000"]`. Only the original author's deletion is meaningful; the
CLI refuses to emit a deletion for someone else's set.
