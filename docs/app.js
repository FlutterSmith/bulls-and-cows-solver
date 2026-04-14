// App logic for the Bulls and Cows web UI.
// Wires the Solver engine into a visual state machine with three modes.

import {
  ALL_CANDIDATES,
  Solver,
  SECRET_LENGTH,
  isValidGuess,
  isWin,
  score,
} from "./solver.js";

// --- DOM lookups ---------------------------------------------------------
const $ = (id) => document.getElementById(id);
const modeButtons = document.querySelectorAll(".mode-btn");
const poolCounter = $("pool-counter");
const poolBarFill = $("pool-bar-fill");
const poolFoot = $("pool-foot-message");
const turnIndicator = $("turn-indicator");
const currentTitle = $("current-title");
const guessDisplay = $("guess-display");
const promptHint = $("prompt-hint");
const scoreInput = $("score-input");
const playInput = $("play-input");
const bullsValue = $("bulls-value");
const cowsValue = $("cows-value");
const submitScore = $("submit-score");
const submitGuess = $("submit-guess");
const startBtn = $("start-btn");
const resetBtn = $("reset-btn");
const topList = $("top-list");
const historyList = $("history-list");
const historySub = $("history-sub");
const victoryOverlay = $("victory-overlay");
const victorySecret = $("victory-secret");
const victoryTurns = $("victory-turns");
const victoryMode = $("victory-mode");
const victoryAgain = $("victory-again");
const digitInputs = document.querySelectorAll(".digit-input");
const steppers = document.querySelectorAll("[data-step]");
const confettiCanvas = $("confetti");

// --- State ---------------------------------------------------------------
const TOTAL = ALL_CANDIDATES.length;
const state = {
  mode: "solve", // "solve" | "auto" | "play"
  solver: new Solver(),
  secret: null, // only set in auto/play modes
  turn: 0,
  history: [], // {turn, guess, score, pool}
  lastPool: TOTAL,
  active: false,
  currentGuess: null,
  pendingBulls: 0,
  pendingCows: 0,
  autoTimer: null,
};

// --- Animated counter ----------------------------------------------------
function animatePoolCounter(target) {
  const from = Number(poolCounter.textContent.replace(/\D/g, "")) || 0;
  const duration = 650;
  const startTime = performance.now();
  poolCounter.classList.remove("pulse");
  void poolCounter.offsetWidth;
  poolCounter.classList.add("pulse");

  function frame(now) {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const value = Math.round(from + (target - from) * eased);
    poolCounter.textContent = value;
    if (t < 1) requestAnimationFrame(frame);
    else poolCounter.textContent = target;
  }
  requestAnimationFrame(frame);
}

function updatePool(size) {
  animatePoolCounter(size);
  const pct = Math.max(3, (size / TOTAL) * 100);
  poolBarFill.style.width = `${pct}%`;
  if (size === TOTAL) poolFoot.textContent = "ready when you are";
  else if (size === 1) poolFoot.textContent = "locked on — one possibility";
  else if (size <= 6)
    poolFoot.textContent =
      "finalists: " + state.solver.candidates.slice(0, 6).join(" · ");
  else poolFoot.textContent = `${size} possibilities remain`;
  state.lastPool = size;
}

// --- Guess display -------------------------------------------------------
function renderGuessDisplay(guess) {
  const digits = guessDisplay.querySelectorAll(".digit");
  digits.forEach((node, i) => {
    node.classList.remove("flip");
    void node.offsetWidth;
    node.textContent = guess ? guess[i] : "–";
    if (guess) node.classList.add("flip");
  });
}

// --- Top picks -----------------------------------------------------------
function renderTopPicks() {
  const total = state.solver.candidates.length;
  if (total === 0 || state.turn === 0) {
    topList.innerHTML =
      '<li class="top-placeholder">Play a turn to see the engine\'s top picks.</li>';
    return;
  }
  const picks = state.solver.topGuesses(5);
  const maxEntropy = Math.max(...picks.map((p) => p.entropy), 0.0001);
  topList.innerHTML = "";
  picks.forEach((pick, i) => {
    const li = document.createElement("li");
    li.className = "top-item" + (i === 0 ? " best" : "");
    const entropyPct = Math.max(6, (pick.entropy / maxEntropy) * 100);
    li.innerHTML = `
      <span class="top-rank">#${i + 1}</span>
      <span class="top-guess">${pick.guess}</span>
      <span class="top-meta">
        <span class="worst">worst ${pick.worstCase}/${total}</span>
        <span class="entropy-bar"><span class="entropy-fill" style="width:${entropyPct}%"></span></span>
      </span>
    `;
    topList.appendChild(li);
  });
}

// --- History -------------------------------------------------------------
function renderHistory() {
  if (state.history.length === 0) {
    historyList.innerHTML =
      '<li class="history-placeholder">No moves yet.</li>';
    historySub.textContent = "your session timeline";
    return;
  }
  historyList.innerHTML = "";
  state.history.forEach((entry) => {
    const li = document.createElement("li");
    li.className = "history-row" + (isWin(entry.score) ? " win" : "");
    li.innerHTML = `
      <span class="history-turn">#${entry.turn}</span>
      <span class="history-guess">${entry.guess}</span>
      <span class="chip-group">
        <span class="chip bulls">${entry.score.bulls} bulls</span>
        <span class="chip cows">${entry.score.cows} cows</span>
      </span>
      <span class="history-pool">${entry.pool}</span>
    `;
    historyList.appendChild(li);
  });
  historySub.textContent = `${state.history.length} move${
    state.history.length === 1 ? "" : "s"
  } so far`;
}

// --- Modes ---------------------------------------------------------------
function setMode(mode) {
  if (state.active) softReset(false);
  state.mode = mode;
  modeButtons.forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.mode === mode)
  );
  currentTitle.textContent = {
    solve: "I'll guess your secret",
    auto: "Watch me solve a random secret",
    play: "Guess the secret I picked",
  }[mode];
  const hintText = {
    solve:
      "Pick a secret 4-digit number with unique digits, keep it in your head, then press <strong>start</strong>.",
    auto:
      "Press <strong>start</strong> and I'll pick a random secret, then solve it in front of you.",
    play:
      "I'll pick a secret for you. Press <strong>start</strong> when you're ready to begin guessing.",
  }[mode];
  promptHint.innerHTML = hintText;
  promptHint.classList.remove("hidden");
  scoreInput.classList.add("hidden");
  playInput.classList.add("hidden");
  startBtn.textContent = "start round";
  startBtn.disabled = false;
}

function softReset(clearMode) {
  clearTimeout(state.autoTimer);
  state.solver.reset();
  state.turn = 0;
  state.history = [];
  state.secret = null;
  state.active = false;
  state.currentGuess = null;
  state.pendingBulls = 0;
  state.pendingCows = 0;
  bullsValue.textContent = "0";
  cowsValue.textContent = "0";
  renderGuessDisplay(null);
  renderTopPicks();
  renderHistory();
  updatePool(TOTAL);
  turnIndicator.textContent = "turn 0";
  promptHint.classList.remove("hidden");
  scoreInput.classList.add("hidden");
  playInput.classList.add("hidden");
  startBtn.disabled = false;
  startBtn.textContent = "start round";
  hideVictory();
  if (clearMode === undefined || clearMode) setMode(state.mode);
}

function startRound() {
  state.active = true;
  state.solver.reset();
  state.turn = 0;
  state.history = [];
  renderHistory();
  updatePool(TOTAL);
  hideVictory();
  promptHint.classList.add("hidden");
  startBtn.disabled = true;
  startBtn.textContent = "round in progress";

  if (state.mode === "solve") {
    startSolveRound();
  } else if (state.mode === "auto") {
    startAutoRound();
  } else {
    startPlayRound();
  }
}

// --- Solve mode ----------------------------------------------------------
function startSolveRound() {
  scoreInput.classList.remove("hidden");
  playInput.classList.add("hidden");
  issueSolverGuess();
}

function issueSolverGuess() {
  state.turn += 1;
  turnIndicator.textContent = `turn ${state.turn}`;
  const guess = state.solver.nextGuess();
  state.currentGuess = guess;
  renderGuessDisplay(guess);
  renderTopPicks();
  state.pendingBulls = 0;
  state.pendingCows = 0;
  bullsValue.textContent = "0";
  cowsValue.textContent = "0";
}

function handleScoreSubmit() {
  if (state.mode !== "solve" || !state.active || !state.currentGuess) return;
  const sc = { bulls: state.pendingBulls, cows: state.pendingCows };
  if (sc.bulls + sc.cows > SECRET_LENGTH) {
    shake(scoreInput);
    return;
  }
  state.solver.record(state.currentGuess, sc);
  state.history.push({
    turn: state.turn,
    guess: state.currentGuess,
    score: sc,
    pool: state.solver.candidates.length,
  });
  renderHistory();
  updatePool(state.solver.candidates.length);

  if (isWin(sc)) {
    endRound(state.currentGuess);
    return;
  }
  if (state.solver.candidates.length === 0) {
    poolFoot.textContent =
      "no candidates remain — a previous score must have been wrong";
    shake(scoreInput);
    startBtn.disabled = false;
    startBtn.textContent = "restart";
    state.active = false;
    return;
  }
  issueSolverGuess();
}

// --- Auto mode -----------------------------------------------------------
function startAutoRound() {
  scoreInput.classList.add("hidden");
  playInput.classList.add("hidden");
  state.secret = ALL_CANDIDATES[Math.floor(Math.random() * ALL_CANDIDATES.length)];
  stepAuto();
}

function stepAuto() {
  state.turn += 1;
  turnIndicator.textContent = `turn ${state.turn}`;
  const guess = state.solver.nextGuess();
  state.currentGuess = guess;
  renderGuessDisplay(guess);
  renderTopPicks();
  const sc = score(guess, state.secret);
  state.autoTimer = setTimeout(() => {
    state.solver.record(guess, sc);
    state.history.push({
      turn: state.turn,
      guess,
      score: sc,
      pool: state.solver.candidates.length,
    });
    renderHistory();
    updatePool(state.solver.candidates.length);
    if (isWin(sc)) {
      endRound(state.secret);
      return;
    }
    state.autoTimer = setTimeout(stepAuto, 950);
  }, 850);
}

// --- Play mode -----------------------------------------------------------
function startPlayRound() {
  scoreInput.classList.add("hidden");
  playInput.classList.remove("hidden");
  state.secret = ALL_CANDIDATES[Math.floor(Math.random() * ALL_CANDIDATES.length)];
  renderGuessDisplay("????");
  digitInputs.forEach((input) => (input.value = ""));
  digitInputs[0].focus();
}

function handlePlaySubmit() {
  if (state.mode !== "play" || !state.active) return;
  const guess = [...digitInputs].map((i) => i.value).join("");
  if (!isValidGuess(guess)) {
    shake(playInput);
    return;
  }
  state.turn += 1;
  turnIndicator.textContent = `turn ${state.turn}`;
  const sc = score(guess, state.secret);
  renderGuessDisplay(guess);
  state.history.push({
    turn: state.turn,
    guess,
    score: sc,
    pool: 0,
  });
  renderHistory();
  digitInputs.forEach((input) => (input.value = ""));
  digitInputs[0].focus();
  if (isWin(sc)) endRound(state.secret);
}

// --- End of round --------------------------------------------------------
function endRound(secret) {
  state.active = false;
  state.currentGuess = null;
  clearTimeout(state.autoTimer);
  startBtn.disabled = false;
  startBtn.textContent = "play again";
  showVictory(secret);
  burstConfetti();
}

function showVictory(secret) {
  victorySecret.textContent = secret;
  victoryTurns.textContent = state.turn;
  victoryMode.textContent = state.mode;
  victoryOverlay.classList.remove("hidden");
}
function hideVictory() {
  victoryOverlay.classList.add("hidden");
}

// --- Helpers -------------------------------------------------------------
function shake(node) {
  node.classList.remove("shake");
  void node.offsetWidth;
  node.classList.add("shake");
}

// --- Confetti ------------------------------------------------------------
function burstConfetti() {
  const ctx = confettiCanvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  confettiCanvas.width = window.innerWidth * dpr;
  confettiCanvas.height = window.innerHeight * dpr;
  confettiCanvas.style.width = `${window.innerWidth}px`;
  confettiCanvas.style.height = `${window.innerHeight}px`;
  ctx.scale(dpr, dpr);

  const colors = ["#7a5cff", "#2de2e6", "#ff4fa3", "#ffd166", "#37f7a6", "#ffffff"];
  const particles = [];
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  for (let i = 0; i < 180; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 5 + Math.random() * 10;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 4,
      size: 4 + Math.random() * 6,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.4,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 0,
    });
  }
  const maxLife = 140;
  function frame() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    let alive = false;
    for (const p of particles) {
      if (p.life > maxLife) continue;
      alive = true;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.22;
      p.vx *= 0.99;
      p.rot += p.vr;
      p.life += 1;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, 1 - p.life / maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.4);
      ctx.restore();
    }
    if (alive) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }
  requestAnimationFrame(frame);
}

// --- Wire up -------------------------------------------------------------
modeButtons.forEach((btn) =>
  btn.addEventListener("click", () => setMode(btn.dataset.mode))
);
startBtn.addEventListener("click", () => {
  if (state.active) return;
  startRound();
});
resetBtn.addEventListener("click", () => softReset());
victoryAgain.addEventListener("click", () => {
  hideVictory();
  startRound();
});

steppers.forEach((btn) =>
  btn.addEventListener("click", () => {
    const key = btn.dataset.step;
    const delta = Number(btn.dataset.delta);
    const current = key === "bulls" ? state.pendingBulls : state.pendingCows;
    const next = Math.max(0, Math.min(SECRET_LENGTH, current + delta));
    if (key === "bulls") {
      state.pendingBulls = next;
      bullsValue.textContent = String(next);
    } else {
      state.pendingCows = next;
      cowsValue.textContent = String(next);
    }
  })
);
submitScore.addEventListener("click", handleScoreSubmit);
submitGuess.addEventListener("click", handlePlaySubmit);

digitInputs.forEach((input, i) => {
  input.addEventListener("input", (e) => {
    const v = e.target.value.replace(/[^\d]/g, "").slice(0, 1);
    e.target.value = v;
    if (v && i < digitInputs.length - 1) digitInputs[i + 1].focus();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" && !e.target.value && i > 0) {
      digitInputs[i - 1].focus();
    }
    if (e.key === "Enter") handlePlaySubmit();
  });
});

// Initial render
setMode("solve");
renderGuessDisplay(null);
updatePool(TOTAL);
