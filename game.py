"""Bulls and Cows — scoring, validation, and candidate generation."""

from __future__ import annotations

from dataclasses import dataclass
from itertools import permutations
from typing import Iterable


SECRET_LENGTH = 4
DIGITS = "0123456789"


@dataclass(frozen=True)
class Score:
    bulls: int
    cows: int

    def __repr__(self) -> str:
        return f"{self.bulls}B{self.cows}C"

    @property
    def is_win(self) -> bool:
        return self.bulls == SECRET_LENGTH


def all_candidates(length: int = SECRET_LENGTH) -> tuple[str, ...]:
    """All unique-digit secrets of the given length (leading zeros allowed)."""
    return tuple("".join(p) for p in permutations(DIGITS, length))


def score(guess: str, secret: str) -> Score:
    """Score a guess against a secret. Both must have the same length."""
    bulls = sum(g == s for g, s in zip(guess, secret))
    cows = sum(1 for g in guess if g in secret) - bulls
    return Score(bulls=bulls, cows=cows)


def is_valid_guess(value: str, length: int = SECRET_LENGTH) -> bool:
    """A guess is valid if it is `length` unique digits."""
    return (
        len(value) == length
        and value.isdigit()
        and len(set(value)) == length
    )


def filter_candidates(
    candidates: Iterable[str],
    guess: str,
    observed: Score,
) -> tuple[str, ...]:
    """Keep only candidates that would have produced the observed score."""
    return tuple(c for c in candidates if score(guess, c) == observed)
