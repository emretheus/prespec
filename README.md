# prespec

**An MCP server that gives your coding agent the spec before it writes the code.**

prespec holds a curated bank of behaviour cases — the things a paginated
endpoint, or anything touching auth tokens, has to get right. You install it
once. From then on, when you ask your agent to build a feature, it looks up what
that kind of feature must do *before* implementing it, asks you the two or three
decisions only you can make, and writes code against the spec instead of against
a guess.

Concretely: a YAML knowledge bank + an MCP server that serves it + a skill that
makes the agent actually use it. Node, no external services, works with Claude
Code and any MCP client.

---

## The problem it solves

Ask an AI agent for an order history endpoint and you get thirty working lines
in about four seconds. They're written against an understanding of the feature
that nobody wrote down, nobody agreed to, and nobody checked.

Then you review it, and the questions start. What happens on an empty account?
Is page size capped? What if an order arrives while someone's paging through?
Can they sort by a column you didn't mean to expose?

None of those are hard questions. They're just late ones — and by the time you
ask them, there's code with opinions to argue with. prespec asks them first.

Here's the same request with prespec installed:

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

Four seconds of code became two questions and five stated assumptions, each
correctable in one line. Nothing was decided silently. When the code does arrive,
you already know what it's supposed to do — and so does the agent.

---

## Why test cases first

Writing test cases is writing down the limits of the thing. Where it starts,
where it stops, what it refuses. Do that before the code and you've written the
specification — you just wrote it in a format that can be checked.

That's the part prose specs never manage. A document saying "the endpoint should
handle pagination gracefully" survives any implementation, including the wrong
one. `A client walking every page receives each order exactly once, even while
new orders arrive` either holds or doesn't.

Three things follow from doing it first:

- **The acceptance criteria exist before the output does.** You're not judging
  code against your memory of what you wanted.
- **Ambiguity surfaces while it's still a sentence.** "Should page size be
  capped?" costs one line now and a migration later.
- **"Done" becomes something you can point at** instead of something you feel.

Tests here are a **design tool**, not a verification tool. You're not checking
work afterwards — you're deciding what the work is.

### Why this matters more now

Three things changed when agents started writing the code.

**Writing code stopped being the bottleneck; deciding what it should do became
one.** When an implementation costs four seconds, the expensive step is no longer
typing it — it's discovering, after review, that it was built against the wrong
assumption. The scarce resource moved upstream, and most tooling hasn't followed
it there.

**Agents fill silence with plausible defaults.** Ask a person to build something
underspecified and you get questions. Ask an agent and you get a confident
implementation — page size uncapped, sort field trusted, empty state returning
404 — with every gap quietly resolved and none of them surfaced. The result looks
finished, which is exactly what makes it expensive. A spec removes the silence
that gets filled.

**Specs got cheap to write, so the old excuse expired.** Test-case-first has
always been good practice and has always lost to deadlines, because writing forty
cases by hand before any code exists is real work. That cost is what's collapsing:
the cases for a paginated endpoint are largely the same everywhere, so they can be
looked up rather than reinvented. prespec is that lookup — curated cases, retrieved
by feature description, so the spec takes a minute instead of an afternoon.

The reflex this encodes isn't new. It's what a careful engineer does before
touching the keyboard: establish the limits, then build inside them. What's new
is that it can be handed to the agent doing the typing.

### "Doesn't the model already know this?"

Mostly, yes — and that's the point. The gap isn't knowledge, it's **recall at the
right moment**. Ask any decent model about cursor pagination and it will explain
the mid-scroll duplicate problem correctly. Ask it to build an order history
endpoint and it usually won't mention it, because nothing in the request pointed
that way.

A bank turns a maybe into a reliably. The same feature description returns the
same cases every time, in the same order, whichever model is driving — no
temperature, no phrasing luck, no "it caught it last week." That determinism is
what makes it a spec rather than a second opinion.

It also holds things worth keeping that no model will produce on demand: cited
sources, and the failure a specific team actually hit at 3am.

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

For that order history endpoint, the spec comes back looking like this:

```
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

Every line is a test you can write and an assertion the agent has to satisfy.
That's the deliverable — not advice, not a checklist, but the definition of done
for this specific feature, available before a single line is written.

*(Shortened for reading. The real response carries the full measurable behaviour
for each line, plus why it matters and what breaks without it.)*

## The three pieces

Each does one job, and each is useless without the other two:

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
git clone https://github.com/emretheus/prespec
cd prespec
npm install
npm test         # retrieval, MCP protocol, and bank quality
npm run stats    # what's in the bank and how healthy it is
```

Register the MCP server with Claude Code:

```bash
claude mcp add prespec -- node "$PWD/mcp/server.mjs"
```

Then ask for something the bank covers — a paginated list endpoint, anything
touching sessions or tokens — and watch it spec before it writes.

Install the skill by copying `skills/prespec/` into `~/.claude/skills/`.

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
