#!/usr/bin/env node
/**
 * Validates every bank file against schema/case.schema.json, plus the
 * cross-file invariants a JSON Schema cannot express on its own:
 *
 *   - `domain` agrees with the file's location on disk
 *   - `side` agrees with `domain`
 *   - case ids are globally unique
 *   - `related` points at case ids that exist
 *   - case id prefix is consistent within a file (keeps ids greppable)
 *
 * Exits non-zero on any error. Warnings never fail the build.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { ROOT, loadBanks, domainFromPath, allCases } from "./lib/load.mjs";

const errors = [];
const warnings = [];

const err = (file, message) => errors.push({ file, message });
const warn = (file, message) => warnings.push({ file, message });

const schema = JSON.parse(
  await readFile(join(ROOT, "schema/case.schema.json"), "utf8"),
);
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

const { banks, parseErrors } = await loadBanks();

for (const { file, message } of parseErrors) {
  err(file, `YAML parse failed: ${message}`);
}

if (banks.length === 0 && parseErrors.length === 0) {
  warn("banks/", "No bank files found.");
}

// --- per-file checks ---------------------------------------------------------

for (const { file, doc } of banks) {
  if (!validate(doc)) {
    for (const issue of validate.errors) {
      const path = issue.instancePath || "(root)";
      err(file, `${path} ${issue.message}`);
    }
    // Shape is wrong; the checks below would produce noise on top of it.
    continue;
  }

  const expectedDomain = domainFromPath(file);
  if (doc.domain !== expectedDomain) {
    err(file, `domain is "${doc.domain}" but path implies "${expectedDomain}"`);
  }

  const expectedSide = doc.domain.split("/")[0];
  if (doc.side !== expectedSide) {
    err(file, `side is "${doc.side}" but domain implies "${expectedSide}"`);
  }

  // Ids inside one file should share a prefix, so `grep pagination.` finds them all.
  const prefixes = new Set(doc.cases.map((c) => c.id.split(".")[0]));
  if (prefixes.size > 1) {
    warn(
      file,
      `mixed id prefixes: ${[...prefixes].sort().join(", ")} — pick one per file`,
    );
  }

  for (const c of doc.cases) {
    if (c.automatable === "no" && !c.given_when_then) continue;

    // `observable` is what assertions are generated from; a vague one is a silent
    // failure at generate_test_cases time, so nudge early.
    if (c.observable.length < 60) {
      warn(file, `${c.id}: observable is thin — assertions derive from it`);
    }

    const unverified = c.seen_in.filter((s) => !s.verified).length;
    if (unverified === c.seen_in.length) {
      warn(file, `${c.id}: no verified evidence yet`);
    }
  }
}

// --- cross-file checks -------------------------------------------------------

const cases = allCases(banks);
const byId = new Map();

for (const c of cases) {
  const seen = byId.get(c.id);
  if (seen) err(c._file, `duplicate case id "${c.id}" (also in ${seen._file})`);
  else byId.set(c.id, c);
}

for (const c of cases) {
  for (const ref of c.related ?? []) {
    if (ref === c.id) {
      err(c._file, `${c.id}: related points at itself`);
    } else if (!byId.has(ref)) {
      // Forward references are normal while the bank is being filled in.
      warn(c._file, `${c.id}: related "${ref}" does not exist yet`);
    }
  }
}

// --- report ------------------------------------------------------------------

const group = (items) => {
  const out = new Map();
  for (const item of items) {
    if (!out.has(item.file)) out.set(item.file, []);
    out.get(item.file).push(item.message);
  }
  return out;
};

if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const [file, msgs] of group(warnings)) {
    console.log(`  ${file}`);
    for (const m of msgs) console.log(`    - ${m}`);
  }
}

if (errors.length) {
  console.error(`\n${errors.length} error(s):`);
  for (const [file, msgs] of group(errors)) {
    console.error(`  ${file}`);
    for (const m of msgs) console.error(`    - ${m}`);
  }
  console.error("");
  process.exit(1);
}

const verified = cases.filter((c) =>
  c.seen_in.some((s) => s.verified),
).length;

console.log(
  `\nOK — ${banks.length} bank file(s), ${cases.length} case(s), ` +
    `${verified} with verified evidence.\n`,
);
