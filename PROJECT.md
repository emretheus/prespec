# prespec — design notes

Why this project is shaped the way it is. The README covers what it does; this
covers the decisions behind it, including the ones that constrain what it will
never do.

---

## 1. Problem

AI agents are good at producing code and bad at interrogating a spec.

Ask one for a login endpoint and you get thirty working lines. What it doesn't
ask:

- What if the token expires while the request is still being processed?
- What if the same user logs in from three devices at once?
- What if a password reset token is used twice?
- Is a rate-limited request idempotent when the client retries it?

None of these require creativity. They're **known, repeating, catalogable**. The
agent's gap isn't knowledge — it's the reflex to recall the right thing at the
right moment.

prespec externalises that reflex into a layer that runs before code is written.

### Why test-case-first

Writing test cases is writing down the limits of the system. Once written:

- Acceptance criteria for the agent's output exist before the output does
- Ambiguities surface while they're cheapest to resolve
- "Done" becomes measurable

This is a **spec practice**, not a QA practice. Tests here are a design tool, not
a verification tool.

### What counts as a spec

Not an edge-case checklist. Edge cases are one section of five:

| Section | Answers |
|---|---|
| What it must do | The feature working, on ordinary input |
| Contract it must honour | Response shape, status codes, ordering, scope |
| Boundaries it must hold at | Empty, one, enormous, past-the-end |
| Conditions it must survive | Races, partial failure, concurrent writes |
| Guarantees it must not break | Security, and what the user is left believing |

A bank recording only where things break produces warning lists. Recording all
five produces specifications. That difference decides whether this is a linter's
cousin or a methodology.

---

## 2. What this is NOT

Stated explicitly, because scope creep here is easy and fatal:

| Not | Why |
|---|---|
| A test runner | We produce cases. Running them is the project's job. |
| A test generator (code → tests) | Deriving tests from existing code is a different problem. We work when no code exists. |
| A linter or static analyzer | We never touch the AST. We work at the intent and domain level. |
| A general-purpose QA assistant | Curated, narrow, deep. Depth over breadth. |
| An LLM-generated catalogue | See §7 — this one is currently violated on purpose, with a plan. |

---

## 3. Architecture — three layers

```
┌─────────────────────────────────────────────────────────┐
│  SKILL      enforces the methodology                    │
│             "spec before code, ask 2-4 questions"       │
└────────────────────────┬────────────────────────────────┘
                         │ calls
┌────────────────────────▼────────────────────────────────┐
│  MCP        deterministic retrieval                     │
│             define_behavior / generate / audit          │
└────────────────────────┬────────────────────────────────┘
                         │ reads
┌────────────────────────▼────────────────────────────────┐
│  BANK       curated knowledge                           │
│             banks/frontend/**  banks/backend/**  (YAML) │
└─────────────────────────────────────────────────────────┘
```

**Why they're separate:**

- **MCP alone** and the agent forgets to call it. A tool existing doesn't make it
  used.
- **Skill alone** and the knowledge is hallucinated. A skill prescribes
  behaviour; it carries no data.
- **Bank separate from MCP** so contributing requires no code, and so the bank
  can be read by other surfaces later — a CLI, a static site, documentation.

---

## 4. The bank — frontend / backend split

This split isn't cosmetic. The two sides have fundamentally different failure
models:

- **Backend** is deterministic and holds its state on the server. Breakage:
  concurrency, partial failure, data integrity, trust boundaries.
- **Frontend** is non-deterministic and holds its state with the user. Breakage:
  user timing, network variability, device diversity, perception.

They share a schema, but their `observable` fields are written completely
differently — a backend assertion is a value comparison, a frontend one often
isn't automatable at all. Hence separate trees.

### Target tree

```
banks/
├── backend/
│   ├── auth/
│   │   ├── token-lifecycle.yaml       # expiry, refresh race, clock skew, revocation
│   │   ├── session.yaml               # concurrent devices, fixation, logout propagation
│   │   └── password-reset.yaml        # token reuse, enumeration, expiry window
│   ├── rest-api/
│   │   ├── pagination.yaml            # cursor drift, past-the-end, mid-scroll mutation
│   │   ├── idempotency.yaml           # retry, duplicate key, partial write
│   │   ├── validation.yaml            # coercion, unicode, null vs absent, size limits
│   │   ├── error-contract.yaml        # status semantics, leakage, partial success
│   │   └── versioning.yaml            # breaking change, deprecation, client skew
│   ├── data/
│   │   ├── transactions.yaml          # isolation, deadlock, rollback side effects
│   │   ├── migrations.yaml            # backward compat, long-running, rollback
│   │   └── constraints.yaml           # unique race, cascade delete, orphan
│   ├── concurrency/
│   │   ├── race-conditions.yaml       # TOCTOU, lost update, double submit
│   │   └── locking.yaml               # timeout, deadlock, lock leak
│   ├── integration/
│   │   ├── external-calls.yaml        # timeout, partial response, retry storm
│   │   ├── webhooks.yaml              # replay, out-of-order, signature, at-least-once
│   │   ├── queues.yaml                # poison message, duplicate, ordering, DLQ
│   │   └── mcp-server.yaml            # protocol contract, stdout purity, tool design
│   ├── files/
│   │   └── upload.yaml                # size, mime spoof, path traversal, interrupted
│   └── cross-cutting/
│       ├── datetime-timezone.yaml     # DST, leap, negative duration, storage tz
│       ├── money.yaml                 # rounding, currency mixing, float, negative
│       └── rate-limiting.yaml         # burst, distributed counter, retry-after
│
└── frontend/
    ├── forms/
    │   ├── validation.yaml            # sync vs async, paste, autofill, error timing
    │   ├── submission.yaml            # double submit, unload mid-submit, slow network
    │   └── state-persistence.yaml     # back button, refresh, draft recovery
    ├── async-ui/
    │   ├── loading-states.yaml        # skeleton vs spinner, flash, min duration
    │   ├── race-conditions.yaml       # stale response, unmount-after-fetch, ordering
    │   └── error-recovery.yaml        # retry affordance, partial failure, offline
    ├── data-display/
    │   ├── lists.yaml                 # empty, one item, 10k items, mid-list mutation
    │   ├── large-datasets.yaml        # downsampling, virtualization, threshold switch
    │   ├── pagination-scroll.yaml     # infinite scroll + back nav, scroll restore
    │   └── text-overflow.yaml         # long words, RTL, i18n growth, emoji
    ├── navigation/
    │   ├── routing.yaml               # deep link, unauth redirect + return, back/forward
    │   └── unsaved-changes.yaml       # nav guard, browser close, tab switch
    ├── input/
    │   ├── interaction.yaml           # double click, rapid toggle, keyboard-only, touch
    │   └── file-picker.yaml           # cancel, huge file, wrong type, drag-drop
    ├── state/
    │   ├── auth-ui.yaml               # expiry mid-session, multi-tab logout
    │   └── optimistic-updates.yaml    # rollback, conflict, offline queue
    └── cross-cutting/
        ├── accessibility.yaml         # focus trap, announcements, contrast, reduced motion
        ├── responsive.yaml            # breakpoint boundary, orientation, zoom 200%
        └── performance-perception.yaml # jank, layout shift, time to interactive
```

This tree is a **target, not a commitment**. Domains get written when they're
needed.

### Case schema

See `schema/case.schema.json` for the authoritative definition. The fields that
carry the design:

| Field | Why it exists |
|---|---|
| `observable` | Without it the catalogue is a blog post, not a tool. Assertions derive from this. |
| `failure_mode` | What going wrong looks like. Makes risk concrete and prioritisable. |
| `applies_when` | Context gates. Keeps retrieval from returning irrelevant cases. |
| `seen_in` | Evidence link. The difference between "good idea" and "actually happened". |
| `category` | Diversifies results so no single kind fills the spec. |
| `risk: foundational` | Behaviour the feature is *defined* by. Always returned, never budgeted away. |
| `automatable` | `partial`/`no` surfaces as a manual note instead of a faked assertion. |
| `related` | Graph structure — one case pulls in another. |

Validated in CI. Non-conforming cases don't merge.

---

## 5. MCP surface

Three tools. More would spread the agent's choice thin and none would be used
well.

### `define_behavior`

Called before code exists. **The important one.**

```
input:
  feature_description: string      # "users can browse their order history"
  side: "frontend" | "backend" | "both"
  domains?: string[]               # optional narrowing
  depth?: "quick" | "standard" | "deep"   # ~5 / ~12 / ~25 cases

output:
  matched_domains: string[]
  spec: [{section, cases}]         # five sections: must do -> must not break
  open_questions: [...]            # for the user; the agent can't answer these
  assumed_defaults: [...]          # decided on their behalf, stated explicitly
  gaps: string[]                   # what the bank doesn't know here
```

Output is a **sectioned spec**, not a flat list. `happy-path` and `contract`
cases come back in full regardless of `depth` — trimming what a feature *does* to
fit more failure modes inverts the priority.

`open_questions` is the heart of it. The agent asks a few; whatever it doesn't
ask is declared in `assumed_defaults`. No silent assumptions.

`gaps` is the honesty field: if the bank holds no defining behaviour for a
domain, it says so rather than implying coverage.

### `generate_test_cases`

Turns a spec into runnable skeletons.

```
input:
  cases: Case[] | case_ids: string[]
  framework: "pytest" | "vitest" | "jest" | "go-test" | "playwright" | "gherkin"
  context?: string                 # existing test style, fixtures

output:
  files: [{path, content}]
  notes: string[]                  # what needs manual verification
```

Assertions derive from `observable` — which is why that field is mandatory.
Cases marked `automatable: no` are listed in `notes`, never silently dropped.

### `audit_coverage`

Diffs existing code against the bank. The one that produces the strongest
reaction, because it proves an absence rather than offering a suggestion.

```
input:
  side, test_files?, source_files?, domains?

output:
  covered: [{case_id, evidence}]
  uncovered: [{case_id, risk, why_matters}]
  coverage_by_domain: {domain: {covered, total}}
```

### Why exactly three

Each maps to a different moment: **before code** (define), **during** (generate),
**after** (audit). A fourth tool should first be checked against those three
moments — it's probably a parameter on an existing one.

---

## 6. Skill surface

MCP supplies knowledge; the skill enforces behaviour. Without it the agent
forgets to call the tool.

```
skills/
├── prespec/      # define behaviour before writing code
└── prespec-audit/     # check existing code against the bank  (not yet built)
```

### `prespec` — the core methodology

1. **Don't write code yet.**
2. Call `define_behavior` with the feature description and side.
3. Ask the user **2–4** questions — only those where a different answer produces
   materially different code.
4. State the assumed defaults for everything not asked.
5. Write the spec: short, sectioned, readable.
6. Then tests, then code.

The documented anti-pattern: dumping twelve findings on the user. The agent
filters and decides; the user decides only what genuinely needs them. The bank is
raw material — the skill turns it into a decision.

### Why probe and audit are separate skills

Their timing and behaviour conflict. Spec-ing asks questions and waits — slow,
conversational. Audit produces a report — fast, one shot. Merged into one skill,
both get blurred.

---

## 7. On letting an LLM fill the bank

The single most important decision here, and currently the one being bent.

**The principle:** the value proposition is "this holds what the LLM doesn't
reliably recall at the right moment." Generate the bank with an LLM and you're
serving a model its own output — the proposition collapses and the project is a
wrapper.

**The current state:** the bank was LLM-drafted to get the structure working end
to end. Every `seen_in` entry carries `verified: false`, and both `validate` and
`stats` report the ratio on every run so it can't quietly become the baseline.

**The rule for `verified: true`:** a human opened the source and confirmed it
says what the case claims. Acceptable sources:

- A spec or RFC clause with a section number
- A published postmortem
- Documented behaviour of a mature API
- A vulnerability class (CWE, OWASP)
- **A bug you personally debugged** — the most valuable kind, because nobody else
  has it

LLM assistance is legitimate for drafting prose, filling schema fields, and
formatting YAML. Not for inventing the case or its citation.

Quality bar: **8 domains × 15 real cases** beats 40 domains of generic filler.

---

## 8. Roadmap

**Phase 0 — skeleton** ✅
Schema, validator with cross-file invariants, CI.

**Phase 1 — first bank** ✅
`backend/rest-api/pagination`, `backend/auth/token-lifecycle`. Chosen because
both are written often, written wrong often, and have abundant citable sources.

**Phase 2 — one tool** ✅
`define_behavior` only. Use it on real work; the bank's gaps surface there.

**Phase 3 — skill** ✅
`prespec`. Enforce the order, observe whether it actually slows the agent
down in a useful way.

**Phase 4 — frontend bank** ← next
`async-ui/race-conditions`, `forms/submission`, `data-display/large-datasets`.
This is where the schema gets tested: what's easy on the backend (write an
assertion) is hard on the frontend.

**Phase 5 — verification pass**
Open the cited RFCs and confirm or correct the existing 30 cases. Turn
`verified: false` into a real number.

**Phase 6 — remaining two tools**
`generate_test_cases`, `audit_coverage`, once the bank is mature enough to
show what they should do.

---

## 9. Success criteria

How to tell whether this works:

1. **Do you use it on your own work?** If, after Phase 3, you reach for it
   reflexively when writing a new endpoint, it works. If not, the skill isn't
   enforcing hard enough or the bank isn't deep enough.
2. **Does the output surprise you?** If every returned case was already in your
   head, the bank adds nothing. A few times a month you should think "I hadn't
   considered that."
3. **Does audit find real gaps?** Run against an existing project it should find
   something concrete and fixable. If it produces generic advice, the
   `observable` fields aren't sharp enough.
