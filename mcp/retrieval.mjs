/**
 * Retrieval for probe_limits.
 *
 * Deliberately lexical, not embedding-based. The bank is small enough that
 * scoring is not the bottleneck, and a deterministic scorer means the same
 * feature description always returns the same cases — which is what makes this
 * a knowledge bank rather than a second opinion from a model.
 */

const DEPTH_LIMITS = { quick: 5, standard: 12, deep: 25 };
const RISK_WEIGHT = { high: 3, medium: 2, low: 1 };

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "for", "to", "of", "in",
  "on", "at", "by", "with", "from", "as", "is", "are", "be", "can", "should",
  "will", "that", "this", "it", "its", "was", "were", "has", "have", "when",
  "user", "users", "system", "add", "build", "make", "create", "implement",
  "write", "new", "want", "need", "let", "lets", "allow", "able",
]);

/**
 * Domain vocabulary. Maps terms a developer would actually type onto bank
 * domains. Hand-maintained: when a probe returns nothing useful, the fix is
 * usually a missing term here rather than a missing case.
 */
const DOMAIN_TERMS = {
  "backend/rest-api/pagination": [
    "pagination", "paginate", "page", "pages", "paging", "list", "listing",
    "cursor", "offset", "limit", "sort", "sorting", "order", "filter",
    "infinite", "scroll", "feed", "index", "browse", "search results",
    "collection", "table", "grid", "export", "batch",
  ],
  "backend/auth/token-lifecycle": [
    "auth", "authentication", "authorization", "token", "tokens", "jwt",
    "bearer", "session", "sessions", "login", "logout", "signin", "signout",
    "refresh", "expiry", "expire", "expires", "revoke", "revocation",
    "permission", "permissions", "role", "roles", "credential", "credentials",
    "password", "oauth", "sso", "access control", "protected", "secure",
  ],
};

/** Split free text into meaningful lowercase terms. */
function tokenize(text) {
  return (text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/**
 * Crude suffix stripping so "logged", "logging" and "logs" all reach "log".
 * A real stemmer would be more accurate, but this is matched against a
 * hand-written vocabulary — over-stemming a term nobody typed costs nothing,
 * while missing "logged" against "login" costs a whole domain.
 */
function stem(term) {
  return term
    .replace(/(ing|ed|es|s)$/, "")
    .replace(/([a-z])\1$/, "$1"); // "logg" -> "log"
}

/**
 * Does the description mention this vocabulary term? Matches the term itself,
 * its stem, and — for terms written as one word like "login" — the spaced form
 * a user is equally likely to type.
 */
function mentions(term, terms, stems, phrase) {
  if (terms.has(term) || stems.has(stem(term))) return true;

  // "login" should also be found in "log in", "signup" in "sign up".
  const spaced = term.replace(/^(log|sign|check)(in|out|up)$/, "$1 $2");
  return spaced !== term && phrase.includes(spaced);
}

/**
 * Score how strongly a feature description points at each domain.
 * Returns domains sorted by descending score, weakest matches dropped.
 */
export function matchDomains(featureDescription, banks, { side, domains } = {}) {
  const terms = new Set(tokenize(featureDescription));
  const stems = new Set([...terms].map(stem));
  const phrase = (featureDescription ?? "").toLowerCase();

  const scored = banks
    .filter((b) => !side || side === "both" || b.doc.side === side)
    .filter((b) => !domains?.length || domains.includes(b.doc.domain))
    .map((b) => {
      const vocab = DOMAIN_TERMS[b.doc.domain] ?? [];
      let score = 0;
      for (const term of vocab) {
        // Multi-word vocabulary entries are matched against the raw phrase.
        if (term.includes(" ")) {
          if (phrase.includes(term)) score += 2;
        } else if (mentions(term, terms, stems, phrase)) {
          score += 1;
        }
      }
      return { domain: b.doc.domain, side: b.doc.side, score };
    })
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score);

  // An explicit domain filter is an instruction, not a hint: honour it even
  // when the wording scores nothing.
  if (scored.length === 0 && domains?.length) {
    return banks
      .filter((b) => domains.includes(b.doc.domain))
      .map((b) => ({ domain: b.doc.domain, side: b.doc.side, score: 0 }));
  }

  return scored;
}

/**
 * Rank cases within the matched domains.
 *
 * Ordering is by risk first, because a probe that buries a high-risk case below
 * a well-worded low-risk one has failed at its only job.
 */
function rankCases(cases, featureDescription) {
  const stems = new Set(tokenize(featureDescription).map(stem));

  return cases
    .map((c) => {
      const haystack = tokenize(
        `${c.title} ${c.question} ${c.applies_when.join(" ")}`,
      );
      const overlap = haystack.filter((t) => stems.has(stem(t))).length;
      return { ...c, _score: RISK_WEIGHT[c.risk] * 10 + Math.min(overlap, 5) };
    })
    .sort((a, b) => b._score - a._score);
}

/**
 * Interleave by category so one category cannot fill the result set.
 * A probe returning nine security cases and nothing else is not a probe.
 */
function diversify(ranked, limit) {
  const buckets = new Map();
  for (const c of ranked) {
    if (!buckets.has(c.category)) buckets.set(c.category, []);
    buckets.get(c.category).push(c);
  }

  const picked = [];
  const queues = [...buckets.values()];
  while (picked.length < limit && queues.some((q) => q.length)) {
    for (const q of queues) {
      if (picked.length >= limit) break;
      if (q.length) picked.push(q.shift());
    }
  }
  return picked;
}

/**
 * Questions the agent must put to the user because the bank cannot answer them.
 * Derived from the selected cases: each high-risk case whose handling is a
 * product decision rather than a correctness rule contributes one.
 */
function openQuestions(cases) {
  const questions = [];
  const seen = new Set();

  for (const c of cases) {
    if (c.risk !== "high") continue;
    const key = c.id.split(".").slice(0, 2).join(".");
    if (seen.has(key)) continue;
    seen.add(key);
    questions.push({
      case_id: c.id,
      question: c.question.trim(),
      why_it_matters: c.failure_mode.trim(),
    });
  }

  return questions.slice(0, 6);
}

/** Defaults applied for anything the user is not asked about. */
function assumedDefaults(cases, asked) {
  const askedIds = new Set(asked.map((q) => q.case_id));
  return cases
    .filter((c) => !askedIds.has(c.id))
    .map((c) => ({ case_id: c.id, assumption: c.observable.trim() }));
}

/** Strip internal fields before handing a case to the model. */
function present(c) {
  const { _score, _file, _domain, ...rest } = c;
  return { ...rest, domain: _domain };
}

export function probe(banks, { feature_description, side, domains, depth }) {
  const limit = DEPTH_LIMITS[depth ?? "standard"] ?? DEPTH_LIMITS.standard;

  const matched = matchDomains(feature_description, banks, { side, domains });
  const matchedNames = new Set(matched.map((m) => m.domain));

  const pool = banks
    .filter((b) => matchedNames.has(b.doc.domain))
    .flatMap(({ file, doc }) =>
      doc.cases.map((c) => ({ ...c, _file: file, _domain: doc.domain })),
    );

  const selected = diversify(rankCases(pool, feature_description), limit);
  const asked = openQuestions(selected);

  return {
    matched_domains: matched.map((m) => m.domain),
    unmatched_note:
      matched.length === 0
        ? "No bank domain matched this description. The bank currently covers: " +
          Object.keys(DOMAIN_TERMS).join(", ") +
          ". Proceed without bank support and note the gap."
        : undefined,
    cases: selected.map(present),
    open_questions: asked,
    assumed_defaults: assumedDefaults(selected, asked),
    coverage_note:
      selected.length < pool.length
        ? `Showing ${selected.length} of ${pool.length} matched cases at depth "${depth ?? "standard"}". Use depth "deep" for the rest.`
        : undefined,
  };
}
