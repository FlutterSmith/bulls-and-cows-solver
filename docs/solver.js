// Knuth-style minimax Bulls and Cows solver — JS port of solver.py
// ------------------------------------------------------------------
// All candidates, scoring, and the minimax decision function live here.
// The UI layer in app.js only interacts with the exported Solver class.

export const SECRET_LENGTH = 4;
const DIGITS = "0123456789";
const OPENING_GUESS = "0123";

function permutations(chars, length) {
  if (length === 1) return chars.map((c) => [c]);
  const out = [];
  for (let i = 0; i < chars.length; i++) {
    const rest = chars.slice(0, i).concat(chars.slice(i + 1));
    for (const tail of permutations(rest, length - 1)) {
      out.push([chars[i], ...tail]);
    }
  }
  return out;
}

export const ALL_CANDIDATES = Object.freeze(
  permutations(DIGITS.split(""), SECRET_LENGTH).map((p) => p.join(""))
);

export function score(guess, secret) {
  let bulls = 0;
  let shared = 0;
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === secret[i]) bulls++;
    if (secret.includes(guess[i])) shared++;
  }
  return { bulls, cows: shared - bulls };
}

export function scoreKey(s) {
  return s.bulls * 10 + s.cows;
}

export function isWin(s) {
  return s.bulls === SECRET_LENGTH;
}

export function isValidGuess(value) {
  if (value.length !== SECRET_LENGTH) return false;
  if (!/^\d+$/.test(value)) return false;
  return new Set(value).size === SECRET_LENGTH;
}

export function filterCandidates(candidates, guess, observed) {
  const target = scoreKey(observed);
  return candidates.filter((c) => scoreKey(score(guess, c)) === target);
}

export class Solver {
  constructor() {
    this.allGuesses = ALL_CANDIDATES;
    this.candidates = ALL_CANDIDATES;
    this.turn = 0;
    this.cache = new Map();
  }

  reset() {
    this.candidates = ALL_CANDIDATES;
    this.turn = 0;
  }

  record(guess, observed) {
    this.candidates = filterCandidates(this.candidates, guess, observed);
    this.turn += 1;
  }

  nextGuess() {
    if (this.turn === 0) return OPENING_GUESS;
    if (this.candidates.length <= 2) return this.candidates[0];
    const key = [...this.candidates].sort().join(",");
    const cached = this.cache.get(key);
    if (cached) return cached;
    const guess = this._minimaxGuess();
    this.cache.set(key, guess);
    return guess;
  }

  _minimaxGuess() {
    const candidateSet = new Set(this.candidates);
    let best = null;
    for (const guess of this.allGuesses) {
      const evaluation = this._evaluate(guess, candidateSet);
      if (best === null || this._isBetter(evaluation, best)) {
        best = evaluation;
      }
    }
    return best.guess;
  }

  _evaluate(guess, candidateSet) {
    const buckets = new Map();
    for (const secret of this.candidates) {
      const k = scoreKey(score(guess, secret));
      buckets.set(k, (buckets.get(k) || 0) + 1);
    }
    const total = this.candidates.length;
    let worstCase = 0;
    let entropy = 0;
    for (const count of buckets.values()) {
      if (count > worstCase) worstCase = count;
      const p = count / total;
      entropy -= p * Math.log2(p);
    }
    return {
      guess,
      worstCase,
      entropy,
      isCandidate: candidateSet.has(guess),
    };
  }

  _isBetter(a, b) {
    if (a.worstCase !== b.worstCase) return a.worstCase < b.worstCase;
    if (Math.abs(a.entropy - b.entropy) > 1e-9) return a.entropy > b.entropy;
    if (a.isCandidate !== b.isCandidate) return a.isCandidate;
    return a.guess < b.guess;
  }

  topGuesses(limit = 5) {
    const candidateSet = new Set(this.candidates);
    const evaluations = this.allGuesses.map((g) =>
      this._evaluate(g, candidateSet)
    );
    evaluations.sort((a, b) => {
      if (a.worstCase !== b.worstCase) return a.worstCase - b.worstCase;
      if (Math.abs(a.entropy - b.entropy) > 1e-9) return b.entropy - a.entropy;
      if (a.isCandidate !== b.isCandidate) return a.isCandidate ? -1 : 1;
      return a.guess < b.guess ? -1 : 1;
    });
    return evaluations.slice(0, limit);
  }
}
