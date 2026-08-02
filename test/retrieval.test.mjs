import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { loadBanks } from "../scripts/lib/load.mjs";
import { probe, matchDomains } from "../mcp/retrieval.mjs";

let banks;
before(async () => {
  ({ banks } = await loadBanks());
  assert.ok(banks.length > 0, "no bank files loaded — the rest is meaningless");
});

const spec = (opts) => probe(banks, { depth: "standard", ...opts });
const allCases = (r) => r.spec.flatMap((s) => s.cases);
const sections = (r) => r.spec.map((s) => s.section);

describe("domain matching", () => {
  test("matches on informal wording, not just canonical terms", () => {
    // These are the phrasings a developer actually types. "log in" as two words
    // regressed once already: the vocabulary has "login" and nothing stemmed.
    const phrasings = [
      ["let users log in and stay logged in", "backend/auth/token-lifecycle"],
      ["signing users in", "backend/auth/token-lifecycle"],
      ["users can browse their order history", "backend/rest-api/pagination"],
      ["paginated list of invoices", "backend/rest-api/pagination"],
    ];

    for (const [phrase, expected] of phrasings) {
      const r = spec({ feature_description: phrase, side: "backend" });
      assert.ok(
        r.matched_domains.includes(expected),
        `"${phrase}" should match ${expected}, got [${r.matched_domains}]`,
      );
    }
  });

  test("reports a gap instead of inventing coverage", () => {
    const r = spec({
      feature_description: "render a 3D globe with orbital camera controls",
      side: "backend",
    });
    assert.equal(r.matched_domains.length, 0);
    assert.equal(allCases(r).length, 0);
    assert.match(r.unmatched_note, /No bank domain matched/);
  });

  test("side filter excludes the other side", () => {
    const r = matchDomains("token expiry and sessions", banks, {
      side: "frontend",
    });
    assert.ok(
      r.every((d) => d.side === "frontend"),
      "backend domains leaked into a frontend-only request",
    );
  });

  test("explicit domains are honoured even when wording does not match", () => {
    const r = spec({
      feature_description: "completely unrelated wording here",
      domains: ["backend/rest-api/pagination"],
    });
    assert.deepEqual(r.matched_domains, ["backend/rest-api/pagination"]);
    assert.ok(allCases(r).length > 0);
  });

  test("retrieval is deterministic", () => {
    // The property that makes this a knowledge bank rather than a second
    // opinion from a model. If it ever stops holding, the project changed.
    const run = () =>
      allCases(
        spec({ feature_description: "order history list", side: "backend" }),
      ).map((c) => c.id);

    assert.deepEqual(run(), run());
    assert.deepEqual(run(), run());
  });
});

describe("spec shape", () => {
  test("leads with what the feature must do", () => {
    const r = spec({
      feature_description: "users can browse their order history",
      side: "backend",
    });
    assert.equal(
      sections(r)[0],
      "What it must do",
      "a spec that opens with failure modes buries the thing being built",
    );
  });

  test("sections stay in spec order", () => {
    const r = spec({
      feature_description: "order history with login",
      side: "backend",
      depth: "deep",
    });
    const canonical = [
      "What it must do",
      "Contract it must honour",
      "Boundaries it must hold at",
      "Conditions it must survive",
      "Guarantees it must not break",
    ];
    const got = sections(r);
    assert.deepEqual(
      got,
      canonical.filter((s) => got.includes(s)),
      "sections came back out of order",
    );
  });

  test("defining behaviour survives the tightest depth budget", () => {
    // quick returns ~5 cases. happy-path and contract must not be the ones
    // trimmed to make room for failure modes.
    const r = spec({
      feature_description: "users can browse their order history",
      side: "backend",
      depth: "quick",
    });
    const categories = allCases(r).map((c) => c.category);
    assert.ok(
      categories.includes("happy-path"),
      "happy-path was budgeted away at depth=quick",
    );
    assert.ok(
      categories.includes("contract"),
      "contract was budgeted away at depth=quick",
    );
  });

  test("deeper depth returns more, and is a superset", () => {
    const args = {
      feature_description: "users can browse their order history",
      side: "backend",
    };
    const quick = allCases(spec({ ...args, depth: "quick" })).map((c) => c.id);
    const deep = allCases(spec({ ...args, depth: "deep" })).map((c) => c.id);

    assert.ok(deep.length > quick.length, "deep returned no more than quick");
    for (const id of quick) {
      assert.ok(deep.includes(id), `${id} appeared at quick but not at deep`);
    }
  });

  test("no single category floods the spec", () => {
    const r = spec({
      feature_description: "users can browse their order history",
      side: "backend",
      depth: "standard",
    });
    const cases = allCases(r);
    const counts = new Map();
    for (const c of cases) counts.set(c.category, (counts.get(c.category) ?? 0) + 1);

    const [top, n] = [...counts].sort((a, b) => b[1] - a[1])[0];
    assert.ok(
      n <= Math.ceil(cases.length / 2),
      `${top} filled ${n}/${cases.length} of the spec`,
    );
  });

  test("no case appears in two sections", () => {
    const ids = allCases(
      spec({
        feature_description: "order history with login",
        side: "backend",
        depth: "deep",
      }),
    ).map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length, "a case was placed twice");
  });

  test("internal scoring fields are not exposed", () => {
    const cases = allCases(
      spec({ feature_description: "order history", side: "backend" }),
    );
    for (const c of cases) {
      for (const leaked of ["_score", "_file", "_domain"]) {
        assert.ok(!(leaked in c), `${leaked} leaked into tool output`);
      }
    }
    assert.ok(cases[0].domain, "cases should carry a public domain field");
  });
});

describe("questions and assumptions", () => {
  test("every selected case is either asked about or assumed", () => {
    // The core promise: nothing gets silently decided.
    const r = spec({
      feature_description: "users can browse their order history",
      side: "backend",
      depth: "standard",
    });
    const accounted = new Set([
      ...r.open_questions.map((q) => q.case_id),
      ...r.assumed_defaults.map((d) => d.case_id),
    ]);

    for (const c of allCases(r)) {
      assert.ok(accounted.has(c.id), `${c.id} was neither asked nor assumed`);
    }
  });

  test("questions stay within what a human can answer in one sitting", () => {
    const r = spec({
      feature_description: "order history with login and sessions",
      side: "backend",
      depth: "deep",
    });
    assert.ok(
      r.open_questions.length <= 6,
      `${r.open_questions.length} questions is an interrogation, not a check-in`,
    );
  });

  test("foundational behaviour is asserted, never asked", () => {
    const r = spec({
      feature_description: "users can browse their order history",
      side: "backend",
      depth: "deep",
    });
    const foundationalIds = allCases(r)
      .filter((c) => c.risk === "foundational")
      .map((c) => c.id);

    for (const q of r.open_questions) {
      assert.ok(
        !foundationalIds.includes(q.case_id),
        `${q.case_id} is foundational — it is the baseline, not a decision`,
      );
    }
  });

  test("questions carry the stakes with them", () => {
    const r = spec({
      feature_description: "users can browse their order history",
      side: "backend",
    });
    for (const q of r.open_questions) {
      assert.ok(q.question?.length > 20, `question too thin: ${q.case_id}`);
      assert.ok(
        q.why_it_matters?.length > 20,
        `${q.case_id} asks without saying why it matters`,
      );
    }
  });
});

describe("input tolerance", () => {
  test("survives empty and junk descriptions without throwing", () => {
    for (const input of ["", "   ", "!!!", "a", "the and or"]) {
      assert.doesNotThrow(
        () => spec({ feature_description: input, side: "backend" }),
        `threw on ${JSON.stringify(input)}`,
      );
    }
  });

  test("unknown depth falls back to standard rather than returning nothing", () => {
    const r = spec({
      feature_description: "order history",
      side: "backend",
      depth: "exhaustive",
    });
    assert.ok(allCases(r).length > 0);
  });

  test("side omitted searches everything", () => {
    const r = spec({ feature_description: "order history pagination" });
    assert.ok(r.matched_domains.length > 0);
  });
});
