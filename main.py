"""Bulls and Cows solver — CLI entry point."""

from __future__ import annotations

import argparse
import random
import sys
import time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

from game import SECRET_LENGTH, Score, is_valid_guess, score
from solver import Solver
from display import UI


MAX_TURNS_HARD_LIMIT = 10


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="bulls-and-cows-solver",
        description="A Knuth-minimax Bulls and Cows solver with a pretty terminal UI.",
    )
    sub = parser.add_subparsers(dest="mode", required=True)

    sub.add_parser("solve", help="You pick a secret; the solver guesses it interactively.")

    auto_parser = sub.add_parser(
        "auto", help="The solver picks a random secret and solves it, narrating every move."
    )
    auto_parser.add_argument("--secret", type=str, help="Override the random secret.")
    auto_parser.add_argument(
        "--delay", type=float, default=0.6, help="Delay between turns (seconds)."
    )

    play_parser = sub.add_parser(
        "play", help="You guess a secret the computer picked (classic human vs tool)."
    )
    play_parser.add_argument("--secret", type=str, help="Override the random secret.")

    bench_parser = sub.add_parser(
        "benchmark", help="Run the solver over every possible secret and report stats."
    )
    bench_parser.add_argument(
        "--limit", type=int, default=0, help="Only benchmark the first N secrets (0 = all)."
    )

    return parser.parse_args(argv)


def prompt_score(ui: UI, guess: str) -> Score:
    while True:
        raw = ui.console.input(
            f"  score for [bold cyan]{guess}[/] — enter as "
            f"[green]bulls cows[/] (e.g. [dim]2 1[/]): "
        ).strip()
        parts = raw.replace(",", " ").split()
        if len(parts) != 2 or not all(p.isdigit() for p in parts):
            ui.error("expected two integers, like '2 1'")
            continue
        bulls, cows = int(parts[0]), int(parts[1])
        if bulls + cows > SECRET_LENGTH:
            ui.error(f"bulls + cows cannot exceed {SECRET_LENGTH}")
            continue
        return Score(bulls=bulls, cows=cows)


def run_solve(ui: UI) -> int:
    ui.banner("I'll guess your secret — you give me bulls and cows.")
    ui.info(
        "Pick a secret 4-digit number with unique digits, then answer truthfully. "
        "I'll do the rest."
    )
    solver = Solver()
    history: list[tuple[int, str, Score, int]] = []

    for turn in range(1, MAX_TURNS_HARD_LIMIT + 1):
        ui.section(f"turn {turn}")
        ui.pool_status(len(solver.candidates), turn)
        if len(solver.candidates) <= 8:
            ui.console.print(
                "  [dim]remaining candidates:[/] "
                + ", ".join(f"[cyan]{c}[/]" for c in solver.candidates)
            )
        guess = solver.next_guess()
        ui.console.print(f"\n  my guess -> [bold magenta]{guess}[/]")
        observed = prompt_score(ui, guess)
        solver.record(guess, observed)
        history.append((turn, guess, observed, len(solver.candidates)))
        if observed.is_win:
            ui.history(history)
            ui.victory(guess, turn)
            return 0
        if not solver.candidates:
            ui.error(
                "No candidates remain — a previous score must have been inconsistent. "
                "Double-check your bulls/cows and try again."
            )
            return 1
    ui.warn("Hit hard turn limit without a solution.")
    return 1


def run_auto(ui: UI, secret: str | None, delay: float) -> int:
    secret = secret or random.choice(Solver().all_guesses)
    if not is_valid_guess(secret):
        ui.error(f"invalid secret '{secret}' — must be {SECRET_LENGTH} unique digits.")
        return 1
    ui.banner("Watch the solver crack a random secret step by step.")
    ui.info(f"secret chosen (hidden until the end): [dim]{'*' * SECRET_LENGTH}[/]")

    solver = Solver()
    history: list[tuple[int, str, Score, int]] = []
    for turn in range(1, MAX_TURNS_HARD_LIMIT + 1):
        ui.section(f"turn {turn}")
        ui.pool_status(len(solver.candidates), turn)
        evaluations = solver.top_guesses(limit=5)
        ui.top_guesses(evaluations, total=len(solver.candidates))
        guess = solver.next_guess()
        observed = score(guess, secret)
        ui.console.print(
            f"\n  play -> [bold magenta]{guess}[/]   "
            f"result -> [bold green]{observed.bulls}[/] bulls, "
            f"[bold yellow]{observed.cows}[/] cows"
        )
        solver.record(guess, observed)
        history.append((turn, guess, observed, len(solver.candidates)))
        time.sleep(delay)
        if observed.is_win:
            ui.history(history)
            ui.victory(secret, turn)
            return 0
    ui.error("Failed to solve within the hard limit — this should never happen.")
    return 1


def run_play(ui: UI, secret: str | None) -> int:
    secret = secret or random.choice(Solver().all_guesses)
    if not is_valid_guess(secret):
        ui.error(f"invalid secret '{secret}' — must be {SECRET_LENGTH} unique digits.")
        return 1
    ui.banner("You guess, the computer scores. Unique-digit 4-digit number.")
    history: list[tuple[int, str, Score, int]] = []
    for turn in range(1, 50):
        raw = ui.console.input(f"  turn [dim]{turn}[/] · your guess: ").strip()
        if not is_valid_guess(raw):
            ui.error(f"invalid guess '{raw}' — need {SECRET_LENGTH} unique digits.")
            continue
        observed = score(raw, secret)
        ui.console.print(
            f"    -> [bold green]{observed.bulls}[/] bulls, "
            f"[bold yellow]{observed.cows}[/] cows"
        )
        history.append((turn, raw, observed, 0))
        if observed.is_win:
            ui.history(history)
            ui.victory(secret, turn)
            return 0
    ui.warn("That's a lot of guesses. The secret was: " + secret)
    return 1


def run_benchmark(ui: UI, limit: int) -> int:
    ui.banner("Running the solver over every possible secret.")
    solver = Solver()
    secrets = solver.all_guesses
    if limit > 0:
        secrets = secrets[:limit]
    total = len(secrets)
    ui.info(f"benchmarking {total} secrets — this usually takes a few seconds.")

    guess_counts: list[int] = []
    worst_case_examples: list[tuple[int, str]] = []
    start = time.perf_counter()
    for i, secret in enumerate(secrets, start=1):
        solver.reset()
        for turn in range(1, MAX_TURNS_HARD_LIMIT + 1):
            guess = solver.next_guess()
            observed = score(guess, secret)
            solver.record(guess, observed)
            if observed.is_win:
                guess_counts.append(turn)
                worst_case_examples.append((turn, secret))
                break
        if i % 500 == 0:
            ui.console.print(f"  [dim]progress[/] {i}/{total}")
    elapsed = time.perf_counter() - start

    avg = sum(guess_counts) / total
    worst = max(guess_counts)
    ui.benchmark_summary(total, guess_counts, avg, worst)
    ui.info(f"elapsed: [bold]{elapsed:.2f}s[/]")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    ui = UI()
    if args.mode == "solve":
        return run_solve(ui)
    if args.mode == "auto":
        return run_auto(ui, args.secret, args.delay)
    if args.mode == "play":
        return run_play(ui, args.secret)
    if args.mode == "benchmark":
        return run_benchmark(ui, args.limit)
    ui.error(f"unknown mode: {args.mode}")
    return 2


if __name__ == "__main__":
    sys.exit(main())
