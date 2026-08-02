import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const BANKS_DIR = join(ROOT, "banks");

/** Recursively collect every .yaml file under dir. */
async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }

  const found = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(full)));
    else if (entry.name.endsWith(".yaml")) found.push(full);
  }
  return found.sort();
}

/**
 * Load every bank file. Parse errors are returned rather than thrown so the
 * validator can report all of them in one run instead of dying on the first.
 */
export async function loadBanks() {
  const files = await walk(BANKS_DIR);
  const banks = [];
  const parseErrors = [];

  for (const file of files) {
    const relPath = relative(ROOT, file).split(sep).join("/");
    try {
      const doc = parse(await readFile(file, "utf8"));
      banks.push({ file: relPath, doc });
    } catch (err) {
      parseErrors.push({ file: relPath, message: err.message });
    }
  }

  return { banks, parseErrors };
}

/** banks/backend/auth/token-lifecycle.yaml -> backend/auth/token-lifecycle */
export function domainFromPath(relPath) {
  return relPath.replace(/^banks\//, "").replace(/\.yaml$/, "");
}

/** Flatten loaded banks into a single case list, each tagged with its origin. */
export function allCases(banks) {
  return banks.flatMap(({ file, doc }) =>
    (doc?.cases ?? []).map((c) => ({ ...c, _file: file, _domain: doc.domain })),
  );
}
