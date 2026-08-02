#!/usr/bin/env node
/**
 * Bank health at a glance. The numbers that matter are evidence coverage and
 * category spread — a bank that is all `security` cases, or all unverified,
 * is not yet doing its job.
 */
import { loadBanks, allCases } from "./lib/load.mjs";

const { banks } = await loadBanks();
const cases = allCases(banks);

if (cases.length === 0) {
  console.log("No cases found.");
  process.exit(0);
}

const tally = (items, key) =>
  items.reduce((m, x) => m.set(key(x), (m.get(key(x)) ?? 0) + 1), new Map());

const pad = (s, n) => String(s).padEnd(n);
const row = (label, count) =>
  `  ${pad(label, 34)} ${String(count).padStart(4)}  ${"█".repeat(Math.round((count / cases.length) * 30))}`;

console.log(`\nedgewit bank — ${cases.length} cases in ${banks.length} file(s)\n`);

console.log("By domain");
for (const [d, n] of [...tally(cases, (c) => c._domain)].sort())
  console.log(row(d, n));

console.log("\nBy risk");
for (const r of ["high", "medium", "low"])
  console.log(row(r, tally(cases, (c) => c.risk).get(r) ?? 0));

console.log("\nBy category");
for (const [c, n] of [...tally(cases, (x) => x.category)].sort((a, b) => b[1] - a[1]))
  console.log(row(c, n));

const verified = cases.filter((c) => c.seen_in.some((s) => s.verified));
const pct = Math.round((verified.length / cases.length) * 100);
console.log(`\nEvidence verified: ${verified.length}/${cases.length} (${pct}%)`);

const byKind = tally(
  cases.flatMap((c) => c.seen_in),
  (s) => s.kind ?? "folklore",
);
console.log("Evidence kinds: " +
  [...byKind].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", "));

const notAutomatable = cases.filter((c) => c.automatable && c.automatable !== "yes");
if (notAutomatable.length)
  console.log(`Needs manual verification: ${notAutomatable.length} case(s)`);

console.log("");
