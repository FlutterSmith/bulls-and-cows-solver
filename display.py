"""Rich terminal UI for the Bulls and Cows solver."""

from __future__ import annotations

from rich import box
from rich.align import Align
from rich.console import Console, Group
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from game import Score
from solver import GuessEvaluation


BANNER = r"""
 ____        _ _         ___     ____
| __ ) _   _| | |___    ( _ )   / ___|_____      _____
|  _ \| | | | | / __|   / _ \/\| |   / _ \ \ /\ / / __|
| |_) | |_| | | \__ \  | (_>  <| |__| (_) \ V  V /\__ \
|____/ \__,_|_|_|___/   \___/\/ \____\___/ \_/\_/ |___/

                  S  O  L  V  E  R
"""


class UI:
    def __init__(self) -> None:
        self.console = Console()

    def banner(self, subtitle: str) -> None:
        header = Text(BANNER, style="bold cyan")
        sub = Text(subtitle, style="italic magenta", justify="center")
        self.console.print(Panel(Group(header, sub), border_style="bright_blue", box=box.DOUBLE))

    def section(self, title: str) -> None:
        self.console.rule(f"[bold yellow]{title}[/]", style="yellow")

    def info(self, message: str) -> None:
        self.console.print(f"[cyan][i][/] {message}")

    def success(self, message: str) -> None:
        self.console.print(f"[bold green][ok][/] {message}")

    def warn(self, message: str) -> None:
        self.console.print(f"[yellow][!][/] {message}")

    def error(self, message: str) -> None:
        self.console.print(f"[bold red][x][/] {message}")

    def pool_status(self, size: int, turn: int) -> None:
        color = "green" if size <= 10 else "yellow" if size <= 100 else "red"
        self.console.print(
            f"[dim]turn {turn}[/] · candidate pool: "
            f"[bold {color}]{size}[/] possibilities remaining"
        )

    def top_guesses(self, evaluations: list[GuessEvaluation], total: int) -> None:
        table = Table(
            title="[bold]Top candidate moves[/]",
            box=box.ROUNDED,
            border_style="bright_blue",
            title_style="bright_blue",
        )
        table.add_column("rank", justify="right", style="dim")
        table.add_column("guess", style="bold cyan", justify="center")
        table.add_column("worst case", justify="right", style="magenta")
        table.add_column("entropy (bits)", justify="right", style="green")
        table.add_column("still viable?", justify="center")
        for rank, ev in enumerate(evaluations, start=1):
            viable = "[green]yes[/]" if ev.is_candidate else "[dim]no[/]"
            table.add_row(
                str(rank),
                ev.guess,
                f"{ev.worst_case}/{total}",
                f"{ev.entropy:.2f}",
                viable,
            )
        self.console.print(table)

    def history(self, entries: list[tuple[int, str, Score, int]]) -> None:
        table = Table(
            title="[bold]Guess history[/]",
            box=box.SIMPLE_HEAVY,
            border_style="bright_magenta",
            title_style="bright_magenta",
        )
        table.add_column("#", justify="right", style="dim")
        table.add_column("guess", justify="center", style="bold cyan")
        table.add_column("bulls", justify="center", style="bold green")
        table.add_column("cows", justify="center", style="bold yellow")
        table.add_column("pool after", justify="right", style="magenta")
        for turn, guess, s, pool in entries:
            table.add_row(str(turn), guess, str(s.bulls), str(s.cows), str(pool))
        self.console.print(table)

    def victory(self, secret: str, turns: int) -> None:
        panel = Panel(
            Align.center(
                Text.assemble(
                    ("SOLVED\n\n", "bold green"),
                    ("secret: ", "dim"),
                    (secret, "bold cyan"),
                    ("\nturns:  ", "dim"),
                    (str(turns), "bold magenta"),
                ),
                vertical="middle",
            ),
            border_style="green",
            box=box.DOUBLE,
            padding=(1, 4),
        )
        self.console.print(panel)

    def benchmark_summary(
        self,
        total: int,
        guess_counts: list[int],
        avg: float,
        max_turns: int,
    ) -> None:
        distribution = Table(
            title="[bold]Benchmark distribution[/]",
            box=box.ROUNDED,
            border_style="bright_blue",
            title_style="bright_blue",
        )
        distribution.add_column("turns", justify="center", style="bold cyan")
        distribution.add_column("secrets", justify="right", style="magenta")
        distribution.add_column("share", justify="right", style="green")
        distribution.add_column("bar", style="cyan")
        counter: dict[int, int] = {}
        for count in guess_counts:
            counter[count] = counter.get(count, 0) + 1
        largest = max(counter.values())
        for turns in sorted(counter):
            count = counter[turns]
            share = count / total * 100
            bar_width = int(count / largest * 30)
            distribution.add_row(
                str(turns),
                str(count),
                f"{share:5.1f}%",
                "#" * bar_width,
            )
        summary = Text.assemble(
            ("secrets solved: ", "dim"),
            (f"{total}", "bold cyan"),
            ("   ·   average: ", "dim"),
            (f"{avg:.3f}", "bold green"),
            ("   ·   worst case: ", "dim"),
            (f"{max_turns}", "bold magenta"),
        )
        self.console.print(distribution)
        self.console.print(Panel(Align.center(summary), border_style="green", box=box.ROUNDED))
