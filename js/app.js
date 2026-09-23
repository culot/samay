(() => {
  "use strict";

  const STORAGE_KEY = "respire.settings.v1";

  const el = {
    ring: document.getElementById("ring"),
    phaseLabel: document.getElementById("phase-label"),
    phaseCount: document.getElementById("phase-count"),
    roundCounter: document.getElementById("round-counter"),
    startBtn: document.getElementById("start-btn"),
    pauseBtn: document.getElementById("pause-btn"),
    resetBtn: document.getElementById("reset-btn"),
    themeToggle: document.getElementById("theme-toggle"),
    presetBtns: [...document.querySelectorAll(".preset-btn")],
    configPanel: document.getElementById("config-panel"),
    configHint: document.getElementById("config-hint"),
    cfgInhale: document.getElementById("cfg-inhale"),
    cfgHoldIn: document.getElementById("cfg-hold-in"),
    cfgExhale: document.getElementById("cfg-exhale"),
    cfgHoldOut: document.getElementById("cfg-hold-out"),
    cfgRounds: document.getElementById("cfg-rounds"),
    cfgMusic: document.getElementById("cfg-music"),
    audio: document.getElementById("bg-audio"),
  };

  const patternFields = [el.cfgInhale, el.cfgHoldIn, el.cfgExhale, el.cfgHoldOut, el.cfgRounds];

  // "pattern" phase definitions, keyed to the config-panel field names.
  const PATTERN_PHASES = [
    { key: "inhale", label: "inspire", cssClass: "phase-inhale" },
    { key: "hold_in", label: "retiens", cssClass: "phase-hold-in" },
    { key: "exhale", label: "expire", cssClass: "phase-exhale" },
    { key: "hold_out", label: "retiens", cssClass: "phase-hold-out" },
  ];

  let session = null;
  let activePreset = "box";
  let phaseSequence = [];
  let running = false;
  let paused = false;
  let phaseIndex = 0;
  let round = 1;
  let remaining = 0;
  let tickHandle = null;

  // ---------- persistence ----------
  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.theme) document.documentElement.setAttribute("data-theme", saved.theme);
      if (saved.music) el.cfgMusic.value = saved.music;
      if (saved.custom) {
        el.cfgInhale.value = saved.custom.inhale;
        el.cfgHoldIn.value = saved.custom.hold_in;
        el.cfgExhale.value = saved.custom.exhale;
        el.cfgHoldOut.value = saved.custom.hold_out;
        el.cfgRounds.value = saved.custom.rounds;
      }
    } catch (e) { /* ignore corrupt storage */ }
  }

  function saveSettings() {
    const data = {
      theme: document.documentElement.getAttribute("data-theme") || "light",
      music: el.cfgMusic.value,
      custom: readConfigForm(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  // ---------- theme ----------
  function initTheme() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.documentElement.setAttribute("data-theme", "dark");
    }
    el.themeToggle.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", current === "dark" ? "light" : "dark");
      saveSettings();
    });
  }

  // ---------- music ----------
  function populateMusicOptions() {
    for (const track of MUSIC_TRACKS) {
      const opt = document.createElement("option");
      opt.value = track.id;
      opt.textContent = track.label;
      el.cfgMusic.appendChild(opt);
    }
    el.cfgMusic.addEventListener("change", () => {
      applyMusicSelection();
      saveSettings();
    });
  }

  function applyMusicSelection() {
    const id = el.cfgMusic.value;
    const track = MUSIC_TRACKS.find((t) => t.id === id);
    el.audio.pause();
    if (!track) return;
    el.audio.src = track.src;
    if (running && !paused) {
      el.audio.play().catch(() => {
        console.warn(`Piste "${track.src}" introuvable. Ajoute le fichier dans /audio (voir audio/README.md).`);
      });
    }
  }

  // ---------- config form (pattern sessions only) ----------
  function readConfigForm() {
    return {
      inhale: clamp(el.cfgInhale.value, 0, 30),
      hold_in: clamp(el.cfgHoldIn.value, 0, 60),
      exhale: clamp(el.cfgExhale.value, 0, 30),
      hold_out: clamp(el.cfgHoldOut.value, 0, 60),
      rounds: clamp(el.cfgRounds.value, 1, 99),
    };
  }

  function writeConfigForm(preset) {
    el.cfgInhale.value = preset.inhale;
    el.cfgHoldIn.value = preset.hold_in;
    el.cfgExhale.value = preset.exhale;
    el.cfgHoldOut.value = preset.hold_out;
    el.cfgRounds.value = preset.rounds;
  }

  function setFieldsEnabled(enabled) {
    patternFields.forEach((f) => (f.disabled = !enabled));
    el.configPanel.classList.toggle("panel-readonly", !enabled);
    el.configHint.textContent = enabled
      ? "Modifie librement ces valeurs, puis clique sur Custom pour les appliquer."
      : "Cette session (Wim-Hof) utilise des paramètres fixes définis dans js/presets.js — choisis Custom pour une session éditable.";
  }

  function clamp(v, min, max) {
    const n = Math.round(Number(v));
    if (Number.isNaN(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  // ---------- presets ----------
  function selectPreset(name) {
    activePreset = name;
    el.presetBtns.forEach((b) => b.classList.toggle("active", b.dataset.preset === name));

    if (name === "custom") {
      session = { type: "pattern", label: "Custom", ...readConfigForm() };
      setFieldsEnabled(true);
    } else {
      session = { ...PRESETS[name] };
      if (session.type === "pattern") {
        writeConfigForm(session);
        setFieldsEnabled(true);
      } else {
        setFieldsEnabled(false);
      }
    }
    resetSession();
  }

  // ---------- phase sequence builders ----------
  function buildPhaseSequence(s) {
    if (s.type === "wimhof") {
      const seq = [];
      for (let i = 0; i < s.breaths; i++) {
        seq.push({ label: "inspire", cssClass: "phase-inhale", duration: s.breath_inhale, transition: s.breath_inhale, breath: true });
        seq.push({ label: "expire", cssClass: "phase-exhale", duration: s.breath_exhale, transition: s.breath_exhale, breath: true });
      }
      seq.push({ label: "retiens (poumons vides)", cssClass: "phase-hold-out", duration: s.hold, transition: Math.min(1.5, s.hold) });
      seq.push({ label: "récupère", cssClass: "phase-hold-in", duration: s.recovery_hold, transition: Math.min(2, s.recovery_hold) });
      return seq;
    }
    // pattern
    return PATTERN_PHASES
      .filter((p) => s[p.key] > 0)
      .map((p) => ({ label: p.label, cssClass: p.cssClass, duration: s[p.key], transition: s[p.key] }));
  }

  // ---------- breathing engine ----------
  function startSession() {
    if (activePreset === "custom") session = { type: "pattern", label: "Custom", ...readConfigForm() };
    phaseSequence = buildPhaseSequence(session);
    if (phaseSequence.length === 0) return;

    running = true;
    paused = false;
    phaseIndex = 0;
    round = 1;

    el.startBtn.disabled = true;
    el.pauseBtn.disabled = false;
    el.resetBtn.disabled = false;
    el.pauseBtn.textContent = "Pause";

    enterPhase();
    applyMusicSelection();
    tick();
  }

  function enterPhase() {
    const phase = phaseSequence[phaseIndex];
    remaining = Math.ceil(phase.duration);

    el.ring.className = "ring " + phase.cssClass;
    el.ring.style.transitionDuration = `${phase.transition}s`;
    el.phaseLabel.textContent = phase.label;
    el.phaseCount.textContent = remaining;
    updateRoundCounter(phase);
  }

  function updateRoundCounter(phase) {
    if (session.type === "wimhof") {
      if (phase.breath) {
        const breathNum = Math.floor(phaseIndex / 2) + 1;
        el.roundCounter.textContent = `Round ${round} / ${session.rounds} · souffle ${breathNum} / ${session.breaths}`;
      } else if (phase.cssClass === "phase-hold-out") {
        el.roundCounter.textContent = `Round ${round} / ${session.rounds} · rétention`;
      } else {
        el.roundCounter.textContent = `Round ${round} / ${session.rounds} · récupération`;
      }
    } else {
      el.roundCounter.textContent = `Round ${round} / ${session.rounds}`;
    }
  }

  function tick() {
    clearTimeout(tickHandle);
    if (!running || paused) return;

    tickHandle = setTimeout(() => {
      remaining -= 1;
      if (remaining > 0) {
        el.phaseCount.textContent = remaining;
        tick();
        return;
      }
      advancePhase();
    }, 1000);
  }

  function advancePhase() {
    phaseIndex += 1;
    if (phaseIndex >= phaseSequence.length) {
      phaseIndex = 0;
      round += 1;
      if (round > session.rounds) {
        finishSession();
        return;
      }
    }
    enterPhase();
    tick();
  }

  function finishSession() {
    running = false;
    paused = false;
    clearTimeout(tickHandle);
    el.audio.pause();
    el.ring.className = "ring";
    el.ring.style.transitionDuration = "1s";
    el.phaseLabel.textContent = "Terminé";
    el.phaseCount.textContent = "🌿";
    el.startBtn.disabled = false;
    el.pauseBtn.disabled = true;
    el.resetBtn.disabled = true;
  }

  function pauseSession() {
    if (!running) return;
    paused = !paused;
    el.pauseBtn.textContent = paused ? "Reprendre" : "Pause";
    if (paused) {
      clearTimeout(tickHandle);
      el.audio.pause();
    } else {
      tick();
      if (el.audio.src) el.audio.play().catch(() => {});
    }
  }

  function resetSession() {
    running = false;
    paused = false;
    clearTimeout(tickHandle);
    el.audio.pause();
    phaseIndex = 0;
    round = 1;
    el.ring.className = "ring";
    el.ring.style.transitionDuration = "1s";
    el.phaseLabel.textContent = "Prêt";
    el.phaseCount.textContent = "";
    el.roundCounter.textContent = `Round 0 / ${session.rounds}`;
    el.startBtn.disabled = false;
    el.pauseBtn.disabled = true;
    el.resetBtn.disabled = true;
    el.pauseBtn.textContent = "Pause";
  }

  // ---------- wiring ----------
  function init() {
    loadSettings();
    initTheme();
    populateMusicOptions();
    if (localStorage.getItem(STORAGE_KEY)) {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved.music) el.cfgMusic.value = saved.music;
    }

    el.presetBtns.forEach((btn) => {
      btn.addEventListener("click", () => selectPreset(btn.dataset.preset));
    });

    patternFields.forEach((input) => {
      input.addEventListener("change", () => {
        selectPreset("custom");
        saveSettings();
      });
    });

    el.startBtn.addEventListener("click", startSession);
    el.pauseBtn.addEventListener("click", pauseSession);
    el.resetBtn.addEventListener("click", resetSession);

    selectPreset("box");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
