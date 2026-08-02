---
name: prespec
description: >
  Write the behaviour specification for a feature BEFORE implementing it, as
  test cases. Use whenever you are about to build a new endpoint, screen, flow,
  or behaviour — especially anything touching auth, sessions, tokens, lists, or
  pagination. Also use when asked "how should I test this", "what should this
  actually do", "what am I missing", or when a request is underspecified.
  Trigger BEFORE writing implementation code, not after.
---

# prespec

Writing the test cases first is writing the specification first. A test case is
the only spec format that is unambiguous and checkable, which is why the spec
is expressed as cases rather than prose.

This is not an edge-case checklist. A feature's spec has five parts, and edge
cases are one of them:

| Section | Answers |
|---|---|
| What it must do | The feature working, on ordinary input |
| Contract it must honour | Response shape, status, ordering, scope |
| Boundaries it must hold at | Empty, one, enormous, past-the-end |
| Conditions it must survive | Races, partial failure, concurrent writes |
| Guarantees it must not break | Security, and what the user is left believing |

An agent that skips straight to section three has written a warning list, not a
spec.

## The order

**1. Do not write implementation code yet.**

Not a scaffold, not a "rough version". Changing your mind is free right now and
expensive in twenty minutes.

**2. Call `define_behavior`.**

```
feature_description: what is being built, in the user's own words
side: backend | frontend | both
depth: quick (~5) | standard (~12) | deep (~25)
```

Use `deep` when the feature handles money, credentials, permissions, or
anything irreversible. Happy-path and contract cases come back in full at every
depth — depth only controls how far into the failure modes you go.

Read `gaps` in the response. If it says the domain has no defining behaviour,
the bank only knows how this breaks, not what it should do — write that part
yourself and say you did.

If `matched_domains` is empty the bank does not cover this. Say so in one line,
proceed on your own judgement, and do not imply the bank backed you.

**3. Ask 2–4 questions. Not more.**

`open_questions` is raw material, not a script. Ask only where a different
answer produces genuinely different code. Where one answer is obviously right,
decide it yourself and put it in step 4.

Ask in the user's vocabulary:

> When a user changes their password, should their other devices be logged out?

not:

> Regarding case token.revocation.password-change-scope...

The most common failure of this skill is dumping twelve findings on the user.
That is not diligence, it is offloading. You filter; they decide only what
genuinely needs deciding.

**4. State the defaults you are assuming.**

Everything you did not ask about still got decided — by you. One line:

> Assuming: cursor-based paging, page size capped at 100, past-the-end returns
> 200 with an empty list.

An assumption stated in one line can be corrected in one line. A silent one
becomes a bug report.

**5. Write the spec.**

Short enough that the user actually reads it. This is the deliverable:

```
Order history listing

Must do
- A client walking every page receives all their orders, once each, newest first.

Contract
- Every page has the same shape; items is always an array; the cursor field is
  present on the last page too.
- A page contains only the caller's orders.

Boundaries
- No orders: 200 with an empty list, distinguishable from "filtered to nothing".
- Page size above 100 returns 100.
- Past the end: 200 with an empty list, not 404.

Must survive
- Orders arriving mid-walk: no duplicates, no skips.

Must not break
- Sort field validated against an allowlist.
```

Each line comes from a case's `observable`, phrased for this feature. Order the
sections as above — what it does first. A spec that opens with failure modes
buries the thing being built.

**6. Now write tests, then code.**

Tests encode the spec. Code satisfies the tests. If a line turns out to be
impractical while implementing, say which and why — do not quietly drop it.

## Reading a case

- `observable` — the measurable behaviour. Spec lines and assertions come from
  here.
- `failure_mode` — what going wrong looks like. Use it to explain why a
  question matters. Absent on happy-path and contract cases.
- `why` — the mechanism. Use it when the user calls a case unrealistic.
- `risk: foundational` — belongs in every spec for this domain, regardless of
  how much time there is.
- `seen_in` with `verified: false` — LLM-drafted, citation not yet confirmed.
  Do not present it to the user as established fact.

## When not to use this

- A specific, self-contained fix was requested. Speccing a one-line change is
  noise.
- The user already stated the behaviour they want. Use theirs; do not re-derive
  it.
- You are debugging existing behaviour rather than defining new behaviour.
