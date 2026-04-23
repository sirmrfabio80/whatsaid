/**
 * Two-stage validation for translated outputs.
 *
 * Stage A — script-family sanity check:
 *   On a "letters only" view of the text (timestamps/speaker labels/code
 *   fences/URLs/numbers/punctuation stripped), require ≥ 70% of letters
 *   in the expected script for the target language, and ≤ 5% in any
 *   *wrong* non-Latin script. Catches Bengali-when-Italian etc.
 *
 * Stage B — Latin-language fingerprint:
 *   For Latin-script targets only, score the letters-only text against a
 *   small per-language stop-word list and require either ≥ 5 distinct
 *   stop-words present OR the target's score to beat the runner-up by
 *   ≥ 1.3×. Catches Spanish-when-Italian, French-when-Portuguese, etc.
 *
 * Conservative by design — short outputs skip Stage A, and Stage B uses
 * a margin (not absolute) threshold. False positives surface as a
 * "translation failed, please retry" toast; nothing gets cached wrong.
 */

import { LANGUAGE_SCRIPTS, type ScriptFamily } from "./languages.ts";

const MIN_LETTERS_FOR_SCRIPT_CHECK = 40;
const SCRIPT_PASS_RATIO = 0.7;
const WRONG_NON_LATIN_MAX_RATIO = 0.05;
const STOP_WORD_DISTINCT_THRESHOLD = 5;
const STOP_WORD_MARGIN = 1.3;

// Unicode block matchers per script family. Latin includes Latin Extended.
const SCRIPT_REGEX: Record<ScriptFamily, RegExp> = {
  latin: /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/g,
  cyrillic: /[\u0400-\u04FF\u0500-\u052F]/g,
  arabic: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g,
  hebrew: /[\u0590-\u05FF\uFB1D-\uFB4F]/g,
  devanagari: /[\u0900-\u097F]/g,
  greek: /[\u0370-\u03FF\u1F00-\u1FFF]/g,
  cjk: /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g,
  japanese: /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g,
  korean: /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g,
  thai: /[\u0E00-\u0E7F]/g,
};

// Non-Latin scripts that should NEVER appear in a Latin-target translation.
// (Each entry is a regex matching letters from that script.)
const NON_LATIN_SCRIPTS_TO_CHECK: Array<{ name: string; regex: RegExp }> = [
  { name: "cyrillic", regex: SCRIPT_REGEX.cyrillic },
  { name: "arabic", regex: SCRIPT_REGEX.arabic },
  { name: "hebrew", regex: SCRIPT_REGEX.hebrew },
  { name: "devanagari", regex: SCRIPT_REGEX.devanagari },
  { name: "greek", regex: SCRIPT_REGEX.greek },
  { name: "cjk", regex: SCRIPT_REGEX.cjk },
  { name: "korean", regex: SCRIPT_REGEX.korean },
  { name: "thai", regex: SCRIPT_REGEX.thai },
  // Bengali is the smoking-gun case from the bug report.
  { name: "bengali", regex: /[\u0980-\u09FF]/g },
  // Catch-all for other Indic / SE-Asian scripts we don't ship.
  { name: "other-indic", regex: /[\u0A00-\u0DFF]/g },
];

/**
 * Strip everything that is intentionally NOT translated, so we measure
 * the actual translated prose:
 * - timestamps like [00:01:23] or (1:23)
 * - speaker labels like "Speaker A:" / "SPEAKER 1:"
 * - markdown code fences and inline code
 * - URLs
 * - markdown headings/bullets/punctuation
 * - digits
 */
export function stripBallast(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/\bhttps?:\/\/\S+/gi, " ")
    .replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]/g, " ")
    .replace(/\(\d{1,2}:\d{2}(?::\d{2})?\)/g, " ")
    .replace(/^\s*Speaker\s+[A-Z0-9]+\s*:/gim, " ")
    .replace(/^\s*SPEAKER\s+[A-Z0-9]+\s*:/gim, " ")
    .replace(/[#*_>\-•]/g, " ")
    .replace(/\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns the count of characters matching `regex`. Resets `lastIndex`
 * because we share regex instances across calls (g flag).
 */
function countMatches(text: string, regex: RegExp): number {
  regex.lastIndex = 0;
  const m = text.match(regex);
  return m ? m.length : 0;
}

export interface ValidationResult {
  ok: boolean;
  stage?: "A" | "B";
  reason?: string;
  detectedScript?: string;
}

/** Stage A — script ratio check. */
export function checkScript(text: string, code: string): ValidationResult {
  const expectedScript = LANGUAGE_SCRIPTS[code];
  if (!expectedScript) {
    // Unknown target: cannot validate, treat as pass to avoid blocking.
    return { ok: true };
  }

  const letters = stripBallast(text);
  const totalLetters = countMatches(letters, /[\p{L}]/gu);

  // Too short to be statistically meaningful.
  if (totalLetters < MIN_LETTERS_FOR_SCRIPT_CHECK) {
    return { ok: true };
  }

  const expectedRegex = SCRIPT_REGEX[expectedScript];
  const expectedCount = countMatches(letters, expectedRegex);
  const expectedRatio = expectedCount / totalLetters;

  if (expectedRatio < SCRIPT_PASS_RATIO) {
    return {
      ok: false,
      stage: "A",
      reason: `expected ${expectedScript} ratio ${(expectedRatio * 100).toFixed(1)}% < ${SCRIPT_PASS_RATIO * 100}%`,
      detectedScript: detectDominantScript(letters),
    };
  }

  // Wrong-script gate (Latin-targets must contain ~no non-Latin letters).
  if (expectedScript === "latin") {
    for (const { name, regex } of NON_LATIN_SCRIPTS_TO_CHECK) {
      const count = countMatches(letters, regex);
      const ratio = count / totalLetters;
      if (ratio > WRONG_NON_LATIN_MAX_RATIO) {
        return {
          ok: false,
          stage: "A",
          reason: `wrong-script ${name} ratio ${(ratio * 100).toFixed(1)}% > ${WRONG_NON_LATIN_MAX_RATIO * 100}%`,
          detectedScript: name,
        };
      }
    }
  }

  return { ok: true, stage: "A", detectedScript: expectedScript };
}

function detectDominantScript(letters: string): string {
  let best = "unknown";
  let bestCount = 0;
  for (const [name, regex] of Object.entries(SCRIPT_REGEX)) {
    const count = countMatches(letters, regex);
    if (count > bestCount) {
      bestCount = count;
      best = name;
    }
  }
  return best;
}

// ── Stage B: Latin-script stop-word fingerprints ──────────────────────────────
// Short, high-frequency function words. Tuned to be discriminative between
// closely-related Romance/Germanic languages. Lowercase; whole-word match.

const STOP_WORDS: Record<string, string[]> = {
  en: ["the","and","of","to","in","is","you","that","it","he","was","for","on","are","as","with","his","they","at","be","this","have","from","or","one","had","by","but","not","what","all","were","we","when","your","can","said","there","an","each","which","she","do","how","their","if","will"],
  es: ["el","la","de","que","y","a","en","un","ser","se","no","haber","por","con","su","para","como","estar","tener","le","lo","todo","pero","más","hacer","o","poder","decir","este","ir","otro","ese","la","si","me","ya","ver","porque","dar","cuando","él","muy","sin","vez","mucho","saber","qué","sobre","mi"],
  fr: ["le","de","un","être","et","à","il","avoir","ne","je","son","que","se","qui","ce","dans","en","du","elle","au","de","ce","le","pour","pas","que","vous","par","sur","faire","plus","dire","me","on","mon","lui","nous","comme","mais","pouvoir","avec","tout","y","aller","voir","bien","où","sans","tu"],
  de: ["der","die","und","in","den","von","zu","das","mit","sich","des","auf","für","ist","im","dem","nicht","ein","eine","als","auch","es","an","werden","aus","er","hat","dass","sie","nach","wird","bei","einer","um","am","sind","noch","wie","einem","über","einen","so","zum","war","haben","nur","oder","aber","vor"],
  it: ["il","di","che","è","e","la","per","in","un","sono","non","con","una","da","si","del","le","ma","ha","mi","ho","se","lo","gli","alla","come","più","anche","quando","essere","fare","o","ci","tu","io","lei","lui","loro","questo","quello","molto","cosa","casa","tempo","modo","vita"],
  pt: ["o","de","a","e","do","da","em","um","para","é","com","não","uma","os","no","se","na","por","mais","as","dos","como","mas","foi","ao","ele","das","tem","à","seu","sua","ou","ser","quando","muito","há","nos","já","está","eu","também","só","pelo","pela","até","isso"],
  nl: ["de","en","van","ik","te","dat","die","in","een","hij","het","niet","zijn","is","was","op","aan","met","als","voor","had","er","maar","om","hem","dan","zou","of","wat","mijn","men","dit","zo","door","over","ze","zich","bij","ook","tot","je","mij","uit","der","daar","haar"],
  tr: ["bir","bu","da","de","ne","ile","için","çok","ben","sen","biz","siz","onlar","ama","veya","gibi","kadar","sonra","önce","şey","var","yok","olmak","etmek","gelmek","gitmek","yapmak","demek","görmek","bilmek","istemek"],
  pl: ["i","w","na","z","do","że","się","jest","nie","to","ale","jak","co","czy","już","tylko","bardzo","może","tak","gdy","jeśli","który","która","które","oraz","także","również"],
  sv: ["och","i","att","det","som","en","på","är","av","för","med","till","den","har","de","inte","om","så","var","sig","men","ett","vi","han","hon"],
  da: ["og","i","at","det","en","den","til","er","som","på","de","med","han","af","for","ikke","der","var","mig","sig","men","et","har","jeg"],
  fi: ["ja","on","ei","että","se","ole","oli","mutta","kuin","tai","kun","jos","tämä","tuo","mikä","ovat","myös","vain","sitten","koska"],
  no: ["og","i","det","at","en","til","er","som","på","de","med","han","av","for","ikke","der","var","meg","seg","men","et","har","jeg"],
  cs: ["a","v","na","se","je","že","s","z","do","o","ale","ne","jak","tak","co","kde","když","jen","také","nebo","ani","už","jako","aby"],
  ro: ["și","de","la","în","cu","un","o","să","nu","este","sunt","pe","din","ca","mai","pentru","care","dar","când","dacă","ce","sau","fi"],
  hu: ["a","az","és","is","nem","hogy","de","csak","már","még","vagy","mert","ha","mint","ezt","azt","így","úgy","ott","itt"],
  vi: ["và","của","là","có","được","trong","cho","này","để","với","khi","như","một","các","những","đã","sẽ","không","mà","thì"],
  id: ["dan","yang","di","ini","itu","dari","dengan","untuk","pada","tidak","akan","atau","juga","sudah","ada","saya","kita","kami","mereka","dia"],
  ms: ["dan","yang","di","ini","itu","dari","dengan","untuk","pada","tidak","akan","atau","juga","sudah","ada","saya","kita","kami","mereka","dia"],
};

const STOP_WORD_SETS: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(STOP_WORDS).map(([k, v]) => [k, new Set(v)]),
);

/** Stage B — Latin-target stop-word fingerprint. */
export function checkLatinFingerprint(text: string, code: string): ValidationResult {
  if (LANGUAGE_SCRIPTS[code] !== "latin") return { ok: true };
  if (!STOP_WORD_SETS[code]) return { ok: true };

  const letters = stripBallast(text).toLowerCase();
  const tokens = letters.split(/\s+/).filter((t) => t.length > 0 && /^[a-z\u00C0-\u024F]+$/.test(t));
  if (tokens.length < 30) return { ok: true };

  // Score every Latin language we have a fingerprint for.
  const scores: Record<string, { count: number; distinct: Set<string> }> = {};
  for (const lang of Object.keys(STOP_WORD_SETS)) {
    scores[lang] = { count: 0, distinct: new Set() };
  }
  for (const tok of tokens) {
    for (const lang of Object.keys(STOP_WORD_SETS)) {
      if (STOP_WORD_SETS[lang].has(tok)) {
        scores[lang].count += 1;
        scores[lang].distinct.add(tok);
      }
    }
  }

  const targetScore = scores[code];
  const targetDistinct = targetScore.distinct.size;
  const targetCount = targetScore.count;

  // Strong evidence: ≥ 5 distinct target stop-words present.
  if (targetDistinct >= STOP_WORD_DISTINCT_THRESHOLD) {
    return { ok: true, stage: "B" };
  }

  // Else require target to beat runner-up by margin.
  let runnerUp = 0;
  let runnerLang = "?";
  for (const [lang, s] of Object.entries(scores)) {
    if (lang === code) continue;
    if (s.count > runnerUp) {
      runnerUp = s.count;
      runnerLang = lang;
    }
  }

  if (targetCount === 0 && runnerUp === 0) {
    // No fingerprint signal at all (e.g. very technical text). Don't block.
    return { ok: true, stage: "B" };
  }

  if (targetCount >= runnerUp * STOP_WORD_MARGIN && targetCount > 0) {
    return { ok: true, stage: "B" };
  }

  return {
    ok: false,
    stage: "B",
    reason: `fingerprint target=${code}(${targetCount}/${targetDistinct}) runnerUp=${runnerLang}(${runnerUp})`,
    detectedScript: runnerLang,
  };
}

/** Run both stages in order. Returns first failure, else `{ok: true}`. */
export function validateTranslation(text: string, code: string): ValidationResult {
  const a = checkScript(text, code);
  if (!a.ok) return a;
  const b = checkLatinFingerprint(text, code);
  if (!b.ok) return b;
  return { ok: true };
}
