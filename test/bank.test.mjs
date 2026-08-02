import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { loadBanks, allCases, domainFromPath } from "../scripts/lib/load.mjs";

/**
 * The validator enforces the schema. These tests enforce the things that make a
 * bank worth reading — properties no JSON Schema can express, and that degrade
 * quietly as cases get added.
 */
let banks, cases;
before(async () => {
  ({ banks } = await loadBanks());
  cases = allCases(banks);
  assert.ok(cases.length > 0);
});

describe("bank integrity", () => {
  test("every bank file parses and declares a matching domain", async () => {
    const { parseErrors } = await loadBanks();
    assert.deepEqual(parseErrors, [], "some bank files failed to parse");

    for (const { file, doc } of banks) {
      assert.equal(doc.domain, domainFromPath(file), `${file}: domain/path mismatch`);
      assert.equal(doc.side, doc.domain.split("/")[0], `${file}: side/domain mismatch`);
    }
  });

  test("case ids are globally unique", () => {
    const seen = new Map();
    for (const c of cases) {
      assert.ok(!seen.has(c.id), `duplicate id ${c.id} in ${c._file} and ${seen.get(c.id)}`);
      seen.set(c.id, c._file);
    }
  });

  test("related references resolve", () => {
    const ids = new Set(cases.map((c) => c.id));
    for (const c of cases) {
      for (const ref of c.related ?? []) {
        assert.ok(ids.has(ref), `${c.id} relates to nonexistent ${ref}`);
        assert.notEqual(ref, c.id, `${c.id} relates to itself`);
      }
    }
  });
});

describe("case quality", () => {
  test("observable states behaviour, not intent", () => {
    // Assertions are generated from this field. Vague wording here becomes a
    // useless test later, so the failure has to surface at bank-write time.
    //
    // Only flags these words where they describe how the system *behaves* —
    // "handled properly", "correctly rejects". As adjectives describing the
    // input ("a correctly signed token whose audience is wrong") they are
    // precise, and that construction is common and legitimate.
    const vague =
      /\b(properly|correctly|appropriately|gracefully|sensibly)\b(?!\s+(signed|formed|encoded|configured|issued|scoped))|\bas expected\b/i;

    for (const c of cases) {
      assert.ok(
        !vague.test(c.observable),
        `${c.id}: observable hedges ("${c.observable.match(vague)?.[0]}") instead of stating behaviour`,
      );
      assert.ok(
        c.observable.length >= 60,
        `${c.id}: observable too thin to assert against`,
      );
    }
  });

  test("why explains the mechanism rather than restating the question", () => {
    for (const c of cases) {
      if (!c.question) continue;
      assert.notEqual(
        c.why.trim().toLowerCase(),
        c.question.trim().toLowerCase(),
        `${c.id}: why is a restatement of question`,
      );
      assert.ok(c.why.length >= 80, `${c.id}: why too thin to be a mechanism`);
    }
  });

  test("failure-mode cases carry a question and a concrete consequence", () => {
    const needsBoth = [
      "boundary", "state-transition", "race",
      "failure", "security", "data-integrity", "ux",
    ];
    for (const c of cases.filter((c) => needsBoth.includes(c.category))) {
      assert.ok(c.question, `${c.id}: no question to put to the user`);
      assert.ok(c.failure_mode, `${c.id}: no failure_mode`);
    }
  });

  test("given_when_then is concrete enough to implement", () => {
    for (const c of cases) {
      const { given, when, then } = c.given_when_then;
      for (const [k, v] of Object.entries({ given, when, then })) {
        assert.ok(v.length >= 15, `${c.id}: ${k} too vague — "${v}"`);
      }
    }
  });

  test("every case cites something", () => {
    for (const c of cases) {
      assert.ok(c.seen_in.length > 0, `${c.id}: no evidence`);
      for (const s of c.seen_in) {
        assert.ok(s.source.length >= 20, `${c.id}: citation too vague — "${s.source}"`);
        assert.equal(typeof s.verified, "boolean", `${c.id}: verified must be explicit`);
      }
    }
  });

  test("titles state the situation, not the remedy", () => {
    // "Validate the sort parameter" is a fix. "Sort field reaches the query
    // unchecked" is a case. Titles that prescribe collapse the spec into advice.
    const prescriptive = /^(always|never|ensure|make sure|use|add|validate|check|handle|implement)\b/i;
    for (const c of cases) {
      assert.ok(
        !prescriptive.test(c.title),
        `${c.id}: title prescribes a fix — "${c.title}"`,
      );
    }
  });
});

describe("spec completeness", () => {
  test("every domain defines what the feature does", () => {
    // A domain holding only failure modes can only produce a warning list.
    for (const { doc } of banks) {
      const kinds = new Set(doc.cases.map((c) => c.category));
      for (const required of ["happy-path", "contract"]) {
        assert.ok(
          kinds.has(required),
          `${doc.domain} has no ${required} case — it cannot produce a spec`,
        );
      }
    }
  });

  test("foundational risk is reserved for defining behaviour", () => {
    for (const c of cases.filter((c) => c.risk === "foundational")) {
      assert.ok(
        ["happy-path", "contract"].includes(c.category),
        `${c.id} is foundational but categorised ${c.category}`,
      );
    }
  });

  test("no domain is dominated by a single category", () => {
    for (const { doc } of banks) {
      const counts = new Map();
      for (const c of doc.cases) counts.set(c.category, (counts.get(c.category) ?? 0) + 1);
      const [top, n] = [...counts].sort((a, b) => b[1] - a[1])[0];
      assert.ok(
        n <= Math.ceil(doc.cases.length * 0.6),
        `${doc.domain}: ${n}/${doc.cases.length} cases are ${top}`,
      );
    }
  });

  test("cases that cannot be automated say so", () => {
    // Silence here means generate_test_cases will fake an assertion instead of
    // flagging it for a human.
    for (const c of cases) {
      if (c.automatable === undefined) continue;
      assert.ok(["yes", "partial", "no"].includes(c.automatable), `${c.id}: bad automatable`);
    }
  });
});
