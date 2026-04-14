// Number Cracker solver with dual feedback.
// ------------------------------------------------------------------
// Game: your friend picks a 3- or 4-digit secret (repeats and leading
// zeros allowed). Every guess returns two numbers:
//   - inOrder: digits in the right position (classic "bulls")
//   - correct: total digits in the secret counting multiplicity,
//              including inOrder (classic bulls + cows)
// You win when inOrder === length.
//
// With repeats, each secret digit matches at most one guess digit —
// that's the standard scoring rule (no double-counting).

const OPENERS = { 3: "012", 4: "0123" };

const _candidateCache = new Map();
export function allCandidates(length) {
  if (!_candidateCache.has(length)) {
    const total = Math.pow(10, length);
    const list = [];
    for (let n = 0; n < total; n++) list.push(String(n).padStart(length, "0"));
    _candidateCache.set(length, Object.freeze(list));
  }
  return _candidateCache.get(length);
}

export function score(guess, secret) {
  let inOrder = 0;
  const guessCounts = new Array(10).fill(0);
  const secretCounts = new Array(10).fill(0);
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === secret[i]) {
      inOrder++;
    } else {
      guessCounts[Number(guess[i])]++;
      secretCounts[Number(secret[i])]++;
    }
  }
  let misplaced = 0;
  for (let d = 0; d < 10; d++) {
    misplaced += Math.min(guessCounts[d], secretCounts[d]);
  }
  return { correct: inOrder + misplaced, inOrder };
}

export function scoreKey(s) {
  return s.correct * 10 + s.inOrder;
}

export function isWin(s, length) {
  return s.inOrder === length;
}

export function isValidGuess(value, length) {
  return value.length === length && /^\d+$/.test(value);
}

export function filterCandidates(candidates, guess, observed) {
  const target = scoreKey(observed);
  return candidates.filter((c) => scoreKey(score(guess, c)) === target);
}

export class Solver {
  constructor(length = 3) {
    this.length = length;
    this.allGuesses = allCandidates(length);
    this.candidates = this.allGuesses;
    this.turn = 0;
    this.cache = new Map();
  }

  reset() {
    this.candidates = this.allGuesses;
    this.turn = 0;
  }

  setLength(length) {
    if (length === this.length) return;
    this.length = length;
    this.allGuesses = allCandidates(length);
    this.candidates = this.allGuesses;
    this.turn = 0;
    this.cache = new Map();
  }

  record(guess, observed) {
    this.candidates = filterCandidates(this.candidates, guess, observed);
    this.turn += 1;
  }

  nextGuess() {
    if (this.turn === 0) return OPENERS[this.length] || this.allGuesses[0];
    if (this.candidates.length === 0) return null;
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
