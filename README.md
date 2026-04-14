# Bulls and Cows Solver

A **Knuth-minimax** Bulls and Cows solver shipped two ways — a Python CLI with a rich terminal UI, and a polished single-page web app with glass-morphism panels, animated candidate-pool counters, and confetti on win. Think of it as a tiny chess-style engine for the 4-unique-digit number game — it evaluates every possible guess, picks the one that maximally shrinks the candidate pool in the worst case, and usually cracks any secret in **4–5 guesses**.

**[▸ Live web demo](https://fluttersmith.github.io/bulls-and-cows-solver/)**

```
 ____        _ _         ___     ____
| __ ) _   _| | |___    ( _ )   / ___|_____      _____
|  _ \| | | | | / __|   / _ \/\| |   / _ \ \ /\ / / __|
| |_) | |_| | | \__ \  | (_>  <| |__| (_) \ V  V /\__ \
|____/ \__,_|_|_|___/   \___/\/ \____\___/ \_/\_/ |___/

                  S  O  L  V  E  R
```

---

## What is Bulls and Cows?

You pick a secret 4-digit number with **unique digits** (e.g. `7392`). I guess, you tell me:

- **bulls** — digits that are in the right place
- **cows** — digits that are in the number but the wrong place

I use that feedback to whittle the candidate pool down and make the next guess. Repeat until you're staring at your own secret number on the screen.

---

## Features

- **Knuth minimax solver** — for every candidate guess, groups the remaining pool by the score each would yield, then picks the guess whose worst-case bucket is smallest. Tiebreaks by information entropy and prefers guesses that could win outright.
- **Four modes:**
  - `solve` — you pick the secret, the tool guesses it interactively
  - `auto` — the tool picks a random secret, then solves it in front of you with a narrated top-5 move table every turn
  - `play` — classic mode: you guess a secret the tool picked, it scores you
  - `benchmark` — run the solver against every possible secret and print the turn distribution
- **Candidate-set cache** — identical candidate sets reuse the last minimax result, so benchmark runs of 5k+ secrets finish in under a minute instead of hours.
- **Gorgeous terminal UI** — powered by [rich](https://github.com/Textualize/rich): panels, colored tables, banners, candidate-pool status with color-coded urgency.
- **Zero external deps beyond `rich`.** Pure standard library underneath.

---

## Install

```bash
git clone https://github.com/FlutterSmith/bulls-and-cows-solver.git
cd bulls-and-cows-solver
pip install -r requirements.txt
```

Requires Python 3.10+.

---

## Usage

### Watch the solver crack a random secret

```bash
python main.py auto
```

Or hand it a specific secret:

```bash
python main.py auto --secret 7392 --delay 0.3
```

### Let the solver guess your secret

```bash
python main.py solve
```

Pick a 4-digit secret with unique digits, then type the bulls/cows after each of my guesses (`2 1`, `1 0`, etc.).

### You play against the solver

```bash
python main.py play
```

### Benchmark

```bash
python main.py benchmark --limit 500
```

Run `--limit 0` to benchmark all 5040 secrets. Takes a minute or two on the first run; subsequent runs in the same process are instant thanks to the cache.

---

## Algorithm

The solver keeps track of the **candidate pool** — every secret still consistent with every scored guess so far. On each turn it does this:

1. **For every possible guess** `g` (all 5040 unique-digit strings), simulate scoring `g` against every remaining candidate, and group them by the resulting `(bulls, cows)` score.
2. Each group represents the candidates that would remain if that score came back. The **largest** group is the worst-case outcome for that guess.
3. Pick the guess whose worst-case group is **smallest**. That's minimax.
4. Tiebreak: prefer the guess with higher information entropy across the groups; among equal-entropy guesses, prefer one still in the candidate pool (so it could win outright).

The very first guess is hardcoded to `0123` because turn 1 always sees the full 5040-secret pool, and `0123` is a proven strong opener for 4-unique-digit Bulls and Cows. Turn 1 minimax would give the same answer but cost ~5 seconds — skipping the computation is purely an optimization.

### Why a cache?

Minimax is `O(|guesses| × |candidates|)` per turn. Without the cache, the full 5040-secret benchmark would re-run minimax on every single game, even though many games share the same mid-game candidate sets. Keying the cache on the `frozenset` of remaining candidates means the solver computes each distinct pool exactly once — typical benchmark runs populate ~100 cache entries total.

---

## Project layout

```
bulls-and-cows-solver/
├── main.py         # CLI entry point, argparse, mode dispatch
├── game.py         # scoring, validation, candidate generation
├── solver.py       # Knuth minimax with cache and entropy tiebreak
├── display.py      # rich terminal UI — banner, tables, panels
├── docs/           # web app (deployed to GitHub Pages)
│   ├── index.html
│   ├── styles.css
│   ├── solver.js   # JS port of the Python solver
│   └── app.js      # UI state machine, animations, confetti
├── requirements.txt
├── LICENSE
└── README.md
```

Each module has a single responsibility and none is over ~300 lines.

## Web app

The `docs/` folder is a zero-build, single-page web app. Animations include:

- Animated aurora gradient background with floating blobs
- Glass-morphism cards with backdrop blur
- Candidate pool counter that animates down as the solver eliminates possibilities
- Guess history timeline with slide-in cards and colored bull/cow chips
- Top-5 moves panel with entropy bars
- Flip animation on each new guess
- Confetti burst + gradient victory panel on solve

To run locally:

```bash
cd docs && python -m http.server 8765
```

Then open `http://localhost:8765`.

---

## Terminal preview

```
─────────────────────────────────── turn 3 ────────────────────────────────────
turn 3 · candidate pool: 64 possibilities remaining
                     Top candidate moves
┌──────┬───────┬────────────┬────────────────┬───────────────┐
│ rank │ guess │ worst case │ entropy (bits) │ still viable? │
├──────┼───────┼────────────┼────────────────┼───────────────┤
│    1 │ 6730  │      12/64 │           3.14 │      yes      │
│    2 │ 6830  │      12/64 │           3.14 │      yes      │
│    3 │ 7630  │      12/64 │           3.14 │      yes      │
│    4 │ 7830  │      12/64 │           3.14 │      yes      │
│    5 │ 2390  │      14/64 │           3.00 │      yes      │
└──────┴───────┴────────────┴────────────────┴───────────────┘

  play -> 6730   result -> 0 bulls, 2 cows
```

---

## License

MIT. See [LICENSE](LICENSE).
