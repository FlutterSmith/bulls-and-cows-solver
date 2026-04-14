"""Knuth-style minimax solver for Bulls and Cows."""

from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass, field

from game import Score, all_candidates, filter_candidates, score


OPENING_GUESS = "0123"


@dataclass
class GuessEvaluation:
    guess: str
    worst_case: int
    expected_remaining: float
    entropy: float
    is_candidate: bool


@dataclass
class Solver:
    all_guesses: tuple[str, ...] = field(default_factory=all_candidates)
    candidates: tuple[str, ...] = field(default_factory=all_candidates)
    turn: int = 0
    _guess_cache: dict[frozenset[str], str] = field(default_factory=dict)

    def reset(self) -> None:
        self.candidates = self.all_guesses
        self.turn = 0

    def record(self, guess: str, observed: Score) -> None:
        """Shrink the candidate pool given a guess and its observed score."""
        self.candidates = filter_candidates(self.candidates, guess, observed)
        self.turn += 1

    def next_guess(self) -> str:
        """Pick the next guess using Knuth minimax with entropy tiebreak."""
        if self.turn == 0:
            return OPENING_GUESS
        if len(self.candidates) <= 2:
            return self.candidates[0]
        key = frozenset(self.candidates)
        cached = self._guess_cache.get(key)
        if cached is not None:
            return cached
        guess = self._minimax_guess()
        self._guess_cache[key] = guess
        return guess

    def _minimax_guess(self) -> str:
        candidate_set = set(self.candidates)
        best: GuessEvaluation | None = None
        for guess in self.all_guesses:
            evaluation = self._evaluate(guess, candidate_set)
            if best is None or self._is_better(evaluation, best):
                best = evaluation
        assert best is not None
        return best.guess

    def _evaluate(self, guess: str, candidate_set: set[str]) -> GuessEvaluation:
        buckets: Counter[Score] = Counter()
        for secret in self.candidates:
            buckets[score(guess, secret)] += 1
        total = len(self.candidates)
        worst_case = max(buckets.values())
        expected = sum(count * count for count in buckets.values()) / total
        entropy = -sum(
            (count / total) * math.log2(count / total) for count in buckets.values()
        )
        return GuessEvaluation(
            guess=guess,
            worst_case=worst_case,
            expected_remaining=expected,
            entropy=entropy,
            is_candidate=guess in candidate_set,
        )

    @staticmethod
    def _is_better(a: GuessEvaluation, b: GuessEvaluation) -> bool:
        """Minimax primary, then entropy, then prefer a guess that could win now."""
        if a.worst_case != b.worst_case:
            return a.worst_case < b.worst_case
        if abs(a.entropy - b.entropy) > 1e-9:
            return a.entropy > b.entropy
        if a.is_candidate != b.is_candidate:
            return a.is_candidate
        return a.guess < b.guess

    def top_guesses(self, limit: int = 5) -> list[GuessEvaluation]:
        """Return the top-N evaluated guesses — used for UI insight."""
        candidate_set = set(self.candidates)
        evaluations = [self._evaluate(g, candidate_set) for g in self.all_guesses]
        evaluations.sort(
            key=lambda e: (e.worst_case, -e.entropy, not e.is_candidate, e.guess)
        )
        return evaluations[:limit]
