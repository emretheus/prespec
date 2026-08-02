# Contributing

The bank is the project. Code changes are welcome, but a good case is worth
more.

## What makes a good case

A case earns its place if it names **measurable behaviour** and says **where the
knowledge came from**. Everything else is formatting.

The bar, concretely:

- `observable` describes behaviour someone could write an assertion against.
  "Handle errors properly" is not a case. "A modified cursor is rejected with a
  client error and returns no items" is.
- `seen_in` points at something real — a spec clause with a section number,
  documented vendor behaviour, a vulnerability class, or a bug you personally
  hit. "It's known that..." is not a source.
- The case would not be obvious to a competent developer who had thought about
  the feature for five minutes. Cases that state the obvious make the whole bank
  feel like filler, which is worse than the bank being small.

## A spec is five sections, not one

The most common mistake is contributing only failure modes. A domain needs cases
that state what the feature *does* — `happy-path` and `contract` — or it can
only produce warning lists.

`npm run stats` reports which domains are missing these. If you're adding a new
domain, write those cases first.

## Adding a case

1. Find or create the right file under `banks/<side>/<area>/<topic>.yaml`. The
   `domain` field must match the path.
2. Copy an existing case as a template — `banks/backend/rest-api/pagination.yaml`
   is the reference.
3. Run `npm run validate`. It checks the schema plus cross-file invariants: id
   uniqueness, domain/path agreement, `related` references that actually exist.
4. Run `npm run stats` to see what your addition did to the category spread.

### Field notes

| Field | Gets it right |
|---|---|
| `observable` | Write the assertion in prose. If you can't, the case isn't ready. |
| `why` | The *mechanism* — why this gets missed, not a restatement of the question. |
| `failure_mode` | What the bug report would say. Concrete. |
| `applies_when` | Context gates. These keep retrieval from returning irrelevant cases. |
| `risk: foundational` | Reserved for behaviour the feature is *defined* by. |
| `automatable` | `partial` or `no` is fine and useful — it tells the agent to flag manual verification rather than fake an assertion. |

### On `verified`

Set `verified: true` **only if you opened the source and confirmed it says what
your case claims.** Not if it seems right, and not if a model told you so.

An unverified case with an honest `false` is useful. A `true` that turns out to
be wrong costs the whole bank its credibility, because a reader who finds one
bad citation reasonably assumes there are others.

## Adding a domain

New domains need a retrieval vocabulary or nothing will ever match them. Add the
terms a developer would actually type to `DOMAIN_TERMS` in
`mcp/retrieval.mjs` — including the informal ones. If a probe returns nothing
useful, a missing term there is the usual cause, not a missing case.

## Code changes

Keep retrieval **deterministic**. The same feature description must return the
same cases every time — that property is what makes this a knowledge bank rather
than a second opinion from a model. If you're reaching for embeddings, open an
issue first so we can talk about what it buys.

CI runs `npm run validate` on every PR.
