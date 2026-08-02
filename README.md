# edgewit

**Give your coding agent the spec before it writes the code.**

Ask an AI agent for an order history endpoint and you get thirty working lines
in about four seconds. They're written against an understanding of the feature
that nobody wrote down, nobody agreed to, and nobody checked.

Then you review it, and the questions start. What happens on an empty account?
Is page size capped? What if an order arrives while someone's paging through?
Can they sort by a column you didn't mean to expose?

None of those are hard questions. They're just late ones. edgewit asks them
first — before the code exists to argue with — and hands the agent a
specification to build against.

```
You: add an endpoint for users to browse their order history

Agent: [calls define_behavior]

      Before I write this, two things worth deciding:

      1. Orders arriving while someone's paging — should they see the new
         one mid-scroll, or a stable snapshot from when they started?
      2. Can they sort by any column, or a fixed set?

      Assuming unless you say otherwise: cursor-based paging, page size
      capped at 100, empty account returns 200 with an empty list, and
      every page carries the same response shape.
```

*(Those questions aren't illustrative — they're what the bank actually returns
for that sentence, phrased for a human.)*

Four seconds of code becomes two questions and five assumptions you can correct
in one line each. That's the whole idea.

---

## Why test cases

Because a test case is the only specification format that's both unambiguous and
checkable. Prose specs drift from the code. Test cases either pass or don't.

Write them first and three things follow:

- The acceptance criteria for the agent's output exist **before the output does**
- Ambiguities surface while they're still cheap — a sentence, not a refactor
- "Done" becomes something you can point at

Tests here are a **design tool**, not a verification tool. You're not checking
work afterwards; you're deciding what the work is.

## What counts as a spec

Not an edge-case checklist. Edge cases are one section of five:

| Section | Answers |
|---|---|
| **What it must do** | The feature working, on ordinary input |
| **Contract it must honour** | Response shape, status codes, ordering, scope |
| **Boundaries it must hold at** | Empty, one, enormous, past-the-end |
| **Conditions it must survive** | Races, partial failure, concurrent writes |
| **Guarantees it must not break** | Security, and what the user is left believing |

Skip the first two and you've written a warning list. That distinction is the
whole reason this project exists — an agent that only hears about failure modes
still doesn't know what it's building.

## How it works

Three layers, each doing one job:

**A bank** of curated behaviour cases — YAML, one file per domain, every case
carrying the measurable behaviour it asserts and a citation for where the
knowledge came from.

**An MCP server** exposing `define_behavior`, which takes a plain-English
feature description and returns the sectioned spec, the questions worth asking a
human, and the defaults being assumed on their behalf.

**A skill** that makes the agent actually call it — before writing code, and
without dumping twelve findings on you. Tools don't get used just because they
exist; the skill is what turns availability into habit.

## Try it

```bash
git clone https://github.com/emretheus/edgewit
cd edgewit
npm install
npm test         # retrieval, MCP protocol, and bank quality
npm run stats    # what's in the bank and how healthy it is
```

Register the MCP server with Claude Code:

```bash
claude mcp add edgewit -- node "$PWD/mcp/server.mjs"
```

Then ask for something the bank covers — a paginated list endpoint, anything
touching sessions or tokens — and watch it spec before it writes.

Install the skill by copying `skills/edgewit-spec/` into `~/.claude/skills/`.

## What's in the bank

| Domain | Cases |
|---|---|
| `backend/rest-api/pagination` | 15 |
| `backend/auth/token-lifecycle` | 15 |

Deliberately narrow. Two domains of real cases are worth more than forty of
generic filler, and a bank that pads itself to look comprehensive is one you
stop trusting the first time it returns something obvious.

The target tree — REST, data, concurrency, integration, and the frontend side
where the failure modes are completely different — is in
[PROJECT.md](PROJECT.md).

## On evidence

Every case cites where its knowledge came from: a spec clause, documented vendor
behaviour, a vulnerability class, or a first-hand bug. Each citation carries a
`verified` flag.

**Right now every flag is `false.`** This bank was LLM-drafted to get the
structure working end to end. The claims are sound and the citations point at
real specs — RFC 6749, RFC 7519, RFC 9110 — but nobody has opened them and
confirmed they say what the case claims. `npm run validate` reports this on
every run and `npm run stats` tracks the ratio, so it stays visible instead of
quietly becoming the baseline.

This matters more than it looks. A bank that just echoes what an LLM already
knows is a wrapper, not a knowledge base — if the model could generate it on
demand, storing it bought you nothing. The value is in the part a model *can't*
reliably produce: verified sources, and the failure someone actually hit at 3am.

Verifying the existing set is the next real work.

## Status

Early, and honest about it.

`define_behavior` works end to end. `generate_test_cases` (spec → runnable test
skeletons) and `audit_coverage` (existing code → what it never handled) are
designed in PROJECT.md and deliberately unbuilt — until the bank has been used
in anger, building them would be guessing at what it's missing.

## Structure

```
banks/       curated behaviour cases, YAML, one file per domain
schema/      JSON Schema every bank file is validated against
mcp/         MCP server exposing define_behavior
skills/      the methodology that makes agents call it
scripts/     validation and bank health
```

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). The bar for a
new case is that it names measurable behaviour and cites where the knowledge
came from.

MIT licensed.
