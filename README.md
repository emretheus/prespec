# edgewit

**Test-case-first behaviour specifications for AI coding agents.**

AI agents are good at producing code and bad at interrogating a spec. Ask one
for an order history endpoint and you get thirty working lines — written against
an understanding of the feature that nobody wrote down, agreed to, or checked.

edgewit puts the specification first. Before the agent writes code, it gets the
behaviour the feature has to have — as test cases, because a test case is the
only spec format that is both unambiguous and checkable.

## What a spec is here

Not an edge-case checklist. Edge cases are one section of five:

| Section | Answers |
|---|---|
| What it must do | The feature working, on ordinary input |
| Contract it must honour | Response shape, status codes, ordering, scope |
| Boundaries it must hold at | Empty, one, enormous, past-the-end |
| Conditions it must survive | Races, partial failure, concurrent writes |
| Guarantees it must not break | Security, and what the user is left believing |

A bank recording only where things break produces warning lists. Recording all
five produces specifications.

## Why test-case-first

Writing test cases is writing the limits of the system down. Do it first and:

- the acceptance criteria for the agent's output exist before the output does
- ambiguities surface while they are still cheap to resolve
- "done" becomes measurable

Tests here are a **design tool**, not a verification tool.

## Layout

```
banks/          curated behaviour cases, YAML, one file per domain
schema/         JSON Schema every bank file is validated against
mcp/            MCP server exposing define_behavior
skills/         the methodology that makes agents actually call it
scripts/        validation and bank stats
```

## Try it

```bash
npm install
npm run validate     # schema + cross-file invariants
npm run stats        # coverage, category spread, evidence health
```

Register the MCP server:

```bash
claude mcp add edgewit -- node /absolute/path/to/edgewit/mcp/server.mjs
```

Then ask your agent to build something the bank covers — a paginated list
endpoint, anything touching sessions or tokens — and it will produce the spec
before it writes.

## Current coverage

| Domain | Cases |
|---|---|
| `backend/rest-api/pagination` | 15 |
| `backend/auth/token-lifecycle` | 15 |

Deliberately narrow. Eight domains of real cases beat forty of generic filler.
The target tree is in [PROJECT.md](PROJECT.md).

## Evidence

Every case carries `seen_in`, pointing at a spec clause, documented vendor
behaviour, vulnerability class, or first-hand bug — plus a `verified` flag.

The current bank was **LLM-drafted**, so every entry is `verified: false`: the
claims are sound but the citations have not been opened and confirmed by a
human. `npm run validate` reports these and `npm run stats` tracks the ratio.
Verifying them is ongoing.

This distinction matters. A bank that echoes what an LLM already knows is a
wrapper, not a knowledge base — see [PROJECT.md](PROJECT.md) §7.

## Status

Early. `define_behavior` works end to end. `generate_test_cases` and
`audit_coverage` are specified in PROJECT.md and deliberately unbuilt until real
use shows what the bank is missing.
