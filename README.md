# edgewit

**Test-case-first edge case knowledge bank for AI coding agents.**

AI agents are good at producing code and bad at interrogating a spec. Ask one for
a login endpoint and you get thirty working lines — and no question about what
happens when the token expires mid-request, when two devices refresh at once, or
when a password change leaves the attacker's session alive.

Those aren't creative problems. They're known, repeating, catalogable ones. The
agent's gap isn't knowledge, it's *recalling the right thing at the right moment*.

edgewit externalises that reflex: a curated bank of edge cases, an MCP server
that serves them, and a skill that stops the agent writing code until it has
established the limits of what it's building.

## Why test-case-first

Writing test cases is writing down the limits of the system. Do it first and:

- the acceptance criteria for the agent's output exist before the output does
- ambiguities surface while they're still cheap to resolve
- "done" becomes something you can measure

Tests here are a **design tool**, not a verification tool.

## Layout

```
banks/          curated edge cases, YAML, one file per domain
schema/         JSON Schema every bank file is validated against
mcp/            MCP server exposing probe_limits
skills/         the methodology that makes agents actually call it
scripts/        validation and bank stats
```

## Try it

```bash
npm install
npm run validate     # schema + cross-file invariants
npm run stats        # coverage, risk spread, evidence health
```

Register the MCP server:

```bash
claude mcp add edgewit -- node /absolute/path/to/edgewit/mcp/server.mjs
```

Then ask your agent to build something the bank covers — a paginated list
endpoint, anything touching sessions or tokens — and it will probe before it
writes.

## Current coverage

| Domain | Cases |
|---|---|
| `backend/rest-api/pagination` | 12 |
| `backend/auth/token-lifecycle` | 13 |

Deliberately narrow. Eight domains of real cases beat forty of generic filler.
The target tree is in [PROJECT.md](PROJECT.md).

## Evidence

Every case carries a `seen_in` field pointing at a spec clause, documented
vendor behaviour, vulnerability class, or a first-hand bug — plus a `verified`
flag.

The current bank was **LLM-drafted**, so every entry is `verified: false`: the
claims are sound but the citations have not been opened and confirmed by a
human. `npm run validate` reports these, and `npm run stats` tracks the ratio.
Verifying them is ongoing work.

This distinction matters. A bank that merely echoes what an LLM already knows is
a wrapper, not a knowledge base — see [PROJECT.md](PROJECT.md) §7.

## Status

Early. `probe_limits` works end to end; `generate_test_cases` and
`audit_coverage` are specified in PROJECT.md and not yet built — deliberately,
until real use shows what the bank is missing.
