// App logic for the Number Cracker coach.
// Three modes: coach (primary), auto (demo), practice (human guesses).
// Length is configurable at 3 or 4 digits; repeats and leading zeros allowed.

import { Solver, allCandidates, isValidGuess, isWin, score } from "./solver.js";

// --- DOM lookups ---------------------------------------------------------
const $ = (id) => document.getElementById(id);
const modeButtons = document.querySelectorAll(".mode-btn");
const lengthButtons = document.querySelectorAll(".length-btn");
const poolCounter = $("pool-counter");
const poolBarFill = $("pool-bar-fill");
const poolFoot = $("pool-foot-message");
const turnIndicator = $("turn-indicator");
const currentEyebrow = $("current-eyebrow");
const currentTitle = $("current-title");
const guessDisplay = $("guess-display");
const promptHint = $("prompt-hint");
const coachInput = $("coach-input");
const playInput = $("play-input");
const correctValue = $("correct-value");
const inorderValue = $("inorder-value");
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
const digitRow = $("digit-row");
const steppers = document.querySelectorAll("[data-step]");
const confettiCanvas = $("confetti");
const footerStats = $("footer-stats");

// --- State ---------------------------------------------------------------
const state = {
  mode: "coach",
  length: 3,
  solver: new Solver(3),
  secret: null,
  turn: 0,
  history: [],
  active: false,
  currentGuess: null,
  pendingCorrect: 0,
  pendingInOrder: 0,
  autoTimer: null,
};

function totalCandidates() {
  return allCandidates(state.length).length;
}

// --- Dynamic digit slots -------------------------------------------------
function renderDigitSlots() {
  guessDisplay.dataset.length = state.length;
  guessDisplay.innerHTML = "";
  for (let i = 0; i < state.length; i++) {
    const span = document.createElement("span");
    span.className = "digit";
    span.textContent = "–";
    guessDisplay.appendChild(span);
  }
  digitRow.innerHTML = "";
  for (let i = 0; i < state.length; i++) {
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "numeric";
    input.maxLength = 1;
    input.className = "digit-input";
    input.dataset.index = String(i);
    input.addEventListener("input", (e) => {
      const v = e.target.value.replace(/[^\d]/g, "").slice(0, 1);
      e.target.value = v;
      const inputs = digitRow.querySelectorAll(".digit-input");
      if (v && i < inputs.length - 1) inputs[i + 1].focus();
    });
    input.addEventListener("keydown", (e) => {
      const inputs = digitRow.querySelectorAll(".digit-input");
      if (e.key === "Backspace" && !e.target.value && i > 0) {
        inputs[i - 1].focus();
      }
      if (e.key === "Enter") handlePlaySubmit();
    });
    digitRow.appendChild(input);
  }
}

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
  const pct = Math.max(3, (size / totalCandidates()) * 100);
  poolBarFill.style.width = `${pct}%`;
  if (size === totalCandidates()) poolFoot.textContent = "ready when you are";
  else if (size === 1) poolFoot.textContent = "locked on — one possibility";
  else if (size <= 6)
    poolFoot.textContent =
      "finalists: " + state.solver.candidates.slice(0, 6).join(" · ");
  else poolFoot.textContent = `${size} possibilities remain`;
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
    li.className =
      "history-row" + (isWin(entry.score, state.length) ? " win" : "");
    const chipClass = entry.score.correct === 0 ? "chip zero" : "chip";
    li.innerHTML = `
      <span class="history-turn">#${entry.turn}</span>
      <span class="history-guess">${entry.guess}</span>
      <span class="chip-group">
        <span class="${chipClass}">${entry.score.correct} correct</span>
        <span class="chip">${entry.score.inOrder} in order</span>
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
const MODE_COPY = {
  coach: {
    eyebrow: "RECOMMENDED GUESS",
    title: "tell your friend this guess",
    hint: (length) =>
      `Your friend picks a secret ${length}-digit number (repeats and leading zeros OK). Press <strong>start</strong> and I'll tell you the optimal first guess. Enter how many digits your friend says are <strong>correct</strong> (in the secret at all) and how many are <strong>in order</strong> (exact right position). You win when "in order" hits ${length}.`,
  },
  auto: {
    eyebrow: "ENGINE'S GUESS",
    title: "watch me crack a random secret",
    hint: () =>
      `Press <strong>start</strong> and I'll pick a random secret, then crack it in front of you using Knuth minimax.`,
  },
  practice: {
    eyebrow: "YOUR GUESS",
    title: "you vs the secret",
    hint: (length) =>
      `I'll pick a secret ${length}-digit number. Press <strong>start</strong>, then guess — I'll tell you how many digits are correct and how many are in the right order.`,
  },
};

function setMode(mode) {
  if (state.active) softReset(false);
  state.mode = mode;
  modeButtons.forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.mode === mode)
  );
  const copy = MODE_COPY[mode];
  currentEyebrow.textContent = copy.eyebrow;
  currentTitle.textContent = copy.title;
  promptHint.innerHTML = copy.hint(state.length);
  promptHint.classList.remove("hidden");
  coachInput.classList.add("hidden");
  playInput.classList.add("hidden");
  startBtn.textContent = "start round";
  startBtn.disabled = false;
}

function setLength(length) {
  if (length === state.length) return;
  state.length = length;
  lengthButtons.forEach((btn) =>
    btn.classList.toggle("active", Number(btn.dataset.length) === length)
  );
  state.solver.setLength(length);
  renderDigitSlots();
  softReset(false);
  const total = totalCandidates();
  footerStats.textContent = `${length}-digit secrets · ${total} possibilities · repeats & leading zeros allowed`;
  updatePool(total);
  setMode(state.mode);
}

function softReset(applyMode = true) {
  clearTimeout(state.autoTimer);
  state.solver.reset();
  state.turn = 0;
  state.history = [];
  state.secret = null;
  state.active = false;
  state.currentGuess = null;
  state.pendingCorrect = 0;
  state.pendingInOrder = 0;
  correctValue.textContent = "0";
  inorderValue.textContent = "0";
  renderGuessDisplay(null);
  renderTopPicks();
  renderHistory();
  updatePool(totalCandidates());
  turnIndicator.textContent = "turn 0";
  promptHint.classList.remove("hidden");
  coachInput.classList.add("hidden");
  playInput.classList.add("hidden");
  startBtn.disabled = false;
  startBtn.textContent = "start round";
  hideVictory();
  if (applyMode) setMode(state.mode);
}

function startRound() {
  state.active = true;
  state.solver.reset();
  state.turn = 0;
  state.history = [];
  renderHistory();
  updatePool(totalCandidates());
  hideVictory();
  promptHint.classList.add("hidden");
  startBtn.disabled = true;
  startBtn.textContent = "round in progress";

  if (state.mode === "coach") startCoachRound();
  else if (state.mode === "auto") startAutoRound();
  else startPracticeRound();
}

// --- Coach mode ----------------------------------------------------------
function startCoachRound() {
  coachInput.classList.remove("hidden");
  playInput.classList.add("hidden");
  issueCoachGuess();
}

function issueCoachGuess() {
  state.turn += 1;
  turnIndicator.textContent = `turn ${state.turn}`;
  const guess = state.solver.nextGuess();
  if (!guess) {
    poolFoot.textContent =
      "no candidates remain — a previous score must have been wrong";
    shake(coachInput);
    startBtn.disabled = false;
    startBtn.textContent = "restart";
    state.active = false;
    return;
  }
  state.currentGuess = guess;
  renderGuessDisplay(guess);
  renderTopPicks();
  state.pendingCorrect = 0;
  state.pendingInOrder = 0;
  correctValue.textContent = "0";
  inorderValue.textContent = "0";
}

function handleScoreSubmit() {
  if (state.mode !== "coach" || !state.active || !state.currentGuess) return;
  const sc = {
    correct: state.pendingCorrect,
    inOrder: state.pendingInOrder,
  };
  if (
    sc.inOrder > sc.correct ||
    sc.correct > state.length ||
    sc.inOrder > state.length ||
    sc.correct < 0 ||
    sc.inOrder < 0
  ) {
    shake(coachInput);
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
  if (isWin(sc, state.length)) {
    endRound(state.currentGuess);
    return;
  }
  if (state.solver.candidates.length === 0) {
    poolFoot.textContent =
      "no candidates remain — a previous score must have been wrong";
    shake(coachInput);
    startBtn.disabled = false;
    startBtn.textContent = "restart";
    state.active = false;
    return;
  }
  issueCoachGuess();
}

// --- Auto mode -----------------------------------------------------------
function startAutoRound() {
  coachInput.classList.add("hidden");
  playInput.classList.add("hidden");
  const pool = allCandidates(state.length);
  state.secret = pool[Math.floor(Math.random() * pool.length)];
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
    if (isWin(sc, state.length)) {
      endRound(state.secret);
      return;
    }
    state.autoTimer = setTimeout(stepAuto, 900);
  }, 800);
}

// --- Practice mode -------------------------------------------------------
function startPracticeRound() {
  coachInput.classList.add("hidden");
  playInput.classList.remove("hidden");
  const pool = allCandidates(state.length);
  state.secret = pool[Math.floor(Math.random() * pool.length)];
  renderGuessDisplay("?".repeat(state.length));
  const inputs = digitRow.querySelectorAll(".digit-input");
  inputs.forEach((input) => (input.value = ""));
  if (inputs[0]) inputs[0].focus();
}

function handlePlaySubmit() {
  if (state.mode !== "practice" || !state.active) return;
  const inputs = digitRow.querySelectorAll(".digit-input");
  const guess = [...inputs].map((i) => i.value).join("");
  if (!isValidGuess(guess, state.length)) {
    shake(playInput);
    return;
  }
  state.turn += 1;
  turnIndicator.textContent = `turn ${state.turn}`;
  const sc = score(guess, state.secret);
  renderGuessDisplay(guess);
  state.history.push({ turn: state.turn, guess, score: sc, pool: 0 });
  renderHistory();
  inputs.forEach((input) => (input.value = ""));
  if (inputs[0]) inputs[0].focus();
  if (isWin(sc, state.length)) endRound(state.secret);
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
function hideVictory() { victoryOverlay.classList.add("hidden"); }

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
      x: cx, y: cy,
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
lengthButtons.forEach((btn) =>
  btn.addEventListener("click", () => setLength(Number(btn.dataset.length)))
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
    const current = key === "correct" ? state.pendingCorrect : state.pendingInOrder;
    const next = Math.max(0, Math.min(state.length, current + delta));
    if (key === "correct") {
      state.pendingCorrect = next;
      correctValue.textContent = String(next);
      if (state.pendingInOrder > next) {
        state.pendingInOrder = next;
        inorderValue.textContent = String(next);
      }
    } else {
      state.pendingInOrder = next;
      inorderValue.textContent = String(next);
      if (next > state.pendingCorrect) {
        state.pendingCorrect = next;
        correctValue.textContent = String(next);
      }
    }
  })
);
submitScore.addEventListener("click", handleScoreSubmit);
submitGuess.addEventListener("click", handlePlaySubmit);

// Initial render
renderDigitSlots();
setMode("coach");
renderGuessDisplay(null);
updatePool(totalCandidates());
