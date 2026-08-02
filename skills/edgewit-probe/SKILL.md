---
name: edgewit-probe
description: >
  Establish the limits of a feature BEFORE writing it. Use whenever you are
  about to implement a new endpoint, screen, flow, or behaviour — especially
  anything touching auth, sessions, tokens, list/pagination, or any covered
  edgewit domain. Also use when asked "what edge cases am I missing", "how
  should I test this", "what could go wrong here", or when a feature spec looks
  underspecified. Trigger BEFORE writing implementation code, not after.
---

# edgewit-probe

Writing test cases first is how you find the limits of a thing before you build
it. This skill enforces that order.

The bank knows where a given kind of feature tends to break. It does not know
what *this* product should do about it. Your job is to bring the two together
and get a decision out of the user cheaply — before code exists to argue with.

## The order

**1. Do not write implementation code yet.**

Not a scaffold, not a "rough version". The point of probing is that changing
your mind is free right now and expensive in twenty minutes.

**2. Call `probe_limits`.**

```
feature_description: what is being built, in the user's own words
side: backend | frontend | both
depth: quick (~5) | standard (~12) | deep (~25)
```

Use `deep` when the feature handles money, credentials, permissions, or
anything irreversible. Use `quick` for a small addition to something that
already exists.

If `matched_domains` is empty, the bank does not cover this yet. Say so in one
line, proceed on your own judgement, and do not pretend the probe returned
something.

**3. Pick 2–4 questions for the user. Not more.**

`open_questions` is raw material, not a script. Ask only the ones where a
different answer produces genuinely different code. Skip anything where one
answer is obviously right — decide it yourself and put it in step 4.

Ask in the user's own vocabulary. This:

> When a user changes their password, should their other devices be logged out?

not this:

> Regarding case token.revocation.password-change-scope...

The single most common failure of this skill is dumping twelve findings on the
user. That is not diligence, it is offloading. You filter; the user decides
what only they can decide.

**4. State the defaults you are assuming.**

Everything you did not ask about still got decided — by you. Say so, briefly:

> Assuming: page size capped at 100, cursor-based paging, empty result returns
> 200 with an empty list.

Silent assumptions are the thing this whole project exists to prevent. An
assumption stated in one line can be corrected in one line.

**5. Write the limit spec.**

A short list the user can actually read — the acceptance criteria for the thing
you are about to build:

```
Limits for order history listing:
- Paging is cursor-based; a client walking pages never sees a duplicate or
  skips a row, even while new orders arrive.
- Page size is capped at 100; a larger request returns 100.
- Offset past the end returns 200 with an empty list, not 404.
- Sort field is validated against an allowlist.
- Empty-because-filtered is distinguishable from empty-because-new.
```

Each line comes from a case's `observable` field, phrased for this feature.
This is the deliverable of probing — the artefact everything downstream checks
against.

**6. Now write tests, then code.**

Tests encode the limit spec. Code satisfies the tests. If a limit turned out to
be impractical while implementing, say which one and why — do not quietly drop
it.

## Reading a case

- `observable` — the measurable behaviour. Assertions come from here.
- `failure_mode` — what going wrong looks like. Use this to explain *why* a
  question matters when the user asks.
- `why` — the mechanism. Use it when the user pushes back on a case as
  unrealistic.
- `seen_in` with `verified: false` — LLM-drafted, source not yet confirmed. Do
  not cite it to the user as established fact.

## When not to use this

- The user asked for a specific, self-contained fix. Probing a one-line change
  is noise.
- The user has already stated the limits themselves. Use theirs; do not
  re-derive them.
- You are debugging existing behaviour rather than building new behaviour —
  that is `edgewit-audit` territory.
