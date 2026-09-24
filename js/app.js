(() => {
  "use strict";

  const STORAGE_KEY = "samay.settings.v2";

  const el = {
    ring: document.getElementById("ring"),
    phaseCount: document.getElementById("phase-count"),
    roundCounter: document.getElementById("round-counter"),
    startBtn: document.getElementById("start-btn"),
    pauseBtn: document.getElementById("pause-btn"),
    resetBtn: document.getElementById("reset-btn"),
    settingsToggle: document.getElementById("settings-toggle"),
    drawer: document.getElementById("settings-drawer"),
    drawerBackdrop: document.getElementById("drawer-backdrop"),
    drawerClose: document.getElementById("drawer-close"),
    themeSwitchBtns: [...document.querySelectorAll("#theme-switch .segmented-btn")],
    langSwitchBtns: [...document.querySelectorAll("#lang-switch .segmented-btn")],
    presetBtns: [...document.querySelectorAll(".preset-btn")],
    configPanel: document.getElementById("config-panel"),
    cfgInhale: document.getElementById("cfg-inhale"),
    cfgHoldIn: document.getElementById("cfg-hold-in"),
    cfgExhale: document.getElementById("cfg-exhale"),
    cfgHoldOut: document.getElementById("cfg-hold-out"),
    cfgRounds: document.getElementById("cfg-rounds"),
    cfgMusic: document.getElementById("cfg-music"),
    cfgImage: document.getElementById("cfg-image"),
    presetDescription: document.getElementById("preset-description"),
    audio: document.getElementById("bg-audio"),
  };

  const patternFields = [el.cfgInhale, el.cfgHoldIn, el.cfgExhale, el.cfgHoldOut, el.cfgRounds];

  const PATTERN_PHASES = [
    { key: "inhale", cssClass: "phase-inhale" },
    { key: "hold_in", cssClass: "phase-hold-in" },
    { key: "exhale", cssClass: "phase-exhale" },
    { key: "hold_out", cssClass: "phase-hold-out" },
  ];

  let currentLang = "fr";
  let pendingMusicValue = null;
  let pendingImageValue = null;

  let session = null;
  let activePreset = "box";
  let phaseSequence = [];
  let running = false;
  let paused = false;
  let phaseIndex = 0;
  let round = 1;
  let remaining = 0;
  let tickHandle = null;

  function t(key) { return I18N[currentLang][key]; }

  // ---------- persistence ----------
  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.theme) document.documentElement.setAttribute("data-theme", saved.theme);
      if (saved.lang) currentLang = saved.lang;
      if (saved.music) pendingMusicValue = saved.music;
      if (saved.bgImage) pendingImageValue = saved.bgImage;
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
      lang: currentLang,
      music: el.cfgMusic.value,
      bgImage: el.cfgImage.value,
      custom: readConfigForm(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  // ---------- theme ----------
  function initThemeDefault() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    updateThemeSwitchUI();
    saveSettings();
  }

  function updateThemeSwitchUI() {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    el.themeSwitchBtns.forEach((b) => b.classList.toggle("active", b.dataset.themeChoice === current));
  }

  // ---------- language ----------
  function setLang(lang) {
    currentLang = lang;
    document.documentElement.lang = lang;
    updateLangSwitchUI();
    applyTranslations();
    saveSettings();
  }

  function updateLangSwitchUI() {
    el.langSwitchBtns.forEach((b) => b.classList.toggle("active", b.dataset.langChoice === currentLang));
  }

  function applyTranslations() {
    document.documentElement.lang = currentLang;
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      const val = t(node.getAttribute("data-i18n"));
      if (typeof val === "string") node.textContent = val;
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((node) => {
      node.setAttribute("aria-label", t(node.getAttribute("data-i18n-aria")));
    });
    populateMusicOptions();
    populateImageOptions();
    updatePresetDescription();
    refreshDynamicTexts();
  }

  // ---------- music ----------
  function populateMusicOptions() {
    const prevValue = el.cfgMusic.value || pendingMusicValue;
    el.cfgMusic.innerHTML = "";
    const noneOpt = document.createElement("option");
    noneOpt.value = "none";
    noneOpt.textContent = t("musicNone");
    el.cfgMusic.appendChild(noneOpt);
    for (const track of MUSIC_TRACKS) {
      const opt = document.createElement("option");
      opt.value = track.id;
      opt.textContent = I18N[currentLang].musicTracks[track.id];
      el.cfgMusic.appendChild(opt);
    }
    if (prevValue && [...el.cfgMusic.options].some((o) => o.value === prevValue)) {
      el.cfgMusic.value = prevValue;
      pendingMusicValue = null;
    }
  }

  function applyMusicSelection() {
    const id = el.cfgMusic.value;
    const track = MUSIC_TRACKS.find((tr) => tr.id === id);
    el.audio.pause();
    if (!track) return;
    el.audio.src = track.src;
    if (running && !paused) {
      el.audio.play().catch(() => {
        console.warn(`Piste "${track.src}" introuvable. Ajoute le fichier dans /audio (voir audio/README.md).`);
      });
    }
  }

  // ---------- background image ----------
  function populateImageOptions() {
    const prevValue = el.cfgImage.value || pendingImageValue;
    el.cfgImage.innerHTML = "";
    const noneOpt = document.createElement("option");
    noneOpt.value = "none";
    noneOpt.textContent = t("imageNone");
    el.cfgImage.appendChild(noneOpt);
    for (const img of IMAGE_TRACKS) {
      const opt = document.createElement("option");
      opt.value = img.id;
      opt.textContent = I18N[currentLang].imageTracks[img.id];
      el.cfgImage.appendChild(opt);
    }
    if (prevValue && [...el.cfgImage.options].some((o) => o.value === prevValue)) {
      el.cfgImage.value = prevValue;
      pendingImageValue = null;
    }
    applyImageSelection();
  }

  function applyImageSelection() {
    const id = el.cfgImage.value;
    const img = IMAGE_TRACKS.find((im) => im.id === id);
    document.body.style.backgroundImage = img ? `url("${img.src}")` : "none";
  }

  // ---------- settings drawer ----------
  function openDrawer() {
    el.drawer.classList.add("open");
    el.drawerBackdrop.classList.add("open");
    el.drawer.setAttribute("aria-hidden", "false");
  }
  function closeDrawer() {
    el.drawer.classList.remove("open");
    el.drawerBackdrop.classList.remove("open");
    el.drawer.setAttribute("aria-hidden", "true");
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
      session = { type: "pattern", ...readConfigForm() };
      el.configPanel.classList.remove("hidden");
    } else {
      session = { ...PRESETS[name] };
      if (session.type === "pattern") writeConfigForm(session);
      el.configPanel.classList.add("hidden");
    }
    updatePresetDescription();
    resetSession();
  }

  function updatePresetDescription() {
    const key = "desc" + activePreset.charAt(0).toUpperCase() + activePreset.slice(1);
    el.presetDescription.textContent = I18N[currentLang][key] || "";
  }

  // ---------- phase sequence builders ----------
  function buildPhaseSequence(s) {
    if (s.type === "wimhof") {
      const seq = [];
      for (let i = 0; i < s.breaths; i++) {
        seq.push({ cssClass: "phase-inhale", duration: s.breath_inhale, transition: s.breath_inhale, breath: true });
        seq.push({ cssClass: "phase-exhale", duration: s.breath_exhale, transition: s.breath_exhale, breath: true });
      }
      seq.push({ cssClass: "phase-hold-out", duration: s.hold, transition: Math.min(1.5, s.hold) });
      seq.push({ cssClass: "phase-hold-in", duration: s.recovery_hold, transition: Math.min(2, s.recovery_hold) });
      return seq;
    }
    return PATTERN_PHASES
      .filter((p) => s[p.key] > 0)
      .map((p) => ({ cssClass: p.cssClass, duration: s[p.key], transition: s[p.key] }));
  }

  // ---------- breathing engine ----------
  function startSession() {
    if (activePreset === "custom") session = { type: "pattern", ...readConfigForm() };
    phaseSequence = buildPhaseSequence(session);
    if (phaseSequence.length === 0) return;

    running = true;
    paused = false;
    phaseIndex = 0;
    round = 1;

    el.startBtn.disabled = true;
    el.pauseBtn.disabled = false;
    el.resetBtn.disabled = false;
    updatePauseButtonUI();

    enterPhase();
    applyMusicSelection();
    tick();
  }

  function enterPhase() {
    const phase = phaseSequence[phaseIndex];
    remaining = Math.ceil(phase.duration);

    el.ring.className = "ring " + phase.cssClass;
    el.ring.style.transitionDuration = `${phase.transition}s`;
    updateRoundCounter(phase);
  }

  function updateRoundCounter(phase) {
    const L = I18N[currentLang];
    if (session.type === "wimhof") {
      if (phase.breath) {
        const breathNum = Math.floor(phaseIndex / 2) + 1;
        el.roundCounter.textContent = `${L.roundWord} ${round} / ${session.rounds} · ${L.breathWord} ${breathNum} / ${session.breaths}`;
      } else if (phase.cssClass === "phase-hold-out") {
        el.roundCounter.textContent = `${L.roundWord} ${round} / ${session.rounds} · ${L.holdPhase}`;
      } else {
        el.roundCounter.textContent = `${L.roundWord} ${round} / ${session.rounds} · ${L.recoveryPhase}`;
      }
    } else {
      el.roundCounter.textContent = `${L.roundWord} ${round} / ${session.rounds}`;
    }
  }

  function refreshDynamicTexts() {
    updatePauseButtonUI();
    if (!session) return;
    if (running) {
      updateRoundCounter(phaseSequence[phaseIndex]);
    } else {
      el.roundCounter.textContent = `${I18N[currentLang].roundWord} 0 / ${session.rounds}`;
    }
  }

  function updatePauseButtonUI() {
    el.pauseBtn.classList.toggle("is-paused", paused);
    el.pauseBtn.querySelector(".icon-pause-symbol").style.display = paused ? "none" : "";
    el.pauseBtn.querySelector(".icon-resume-symbol").style.display = paused ? "" : "none";
    el.pauseBtn.setAttribute("aria-label", paused ? t("ariaResume") : t("ariaPause"));
  }

  function tick() {
    clearTimeout(tickHandle);
    if (!running || paused) return;

    tickHandle = setTimeout(() => {
      remaining -= 1;
      if (remaining > 0) {
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

  const FINISHED_ICON = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><polyline points="8 12 11 15 16 9"></polyline></svg>';

  function finishSession() {
    running = false;
    paused = false;
    clearTimeout(tickHandle);
    el.audio.pause();
    el.ring.className = "ring";
    el.ring.style.transitionDuration = "1s";
    el.phaseCount.innerHTML = FINISHED_ICON;
    el.startBtn.disabled = false;
    el.pauseBtn.disabled = true;
    el.resetBtn.disabled = true;
    updatePauseButtonUI();
  }

  function pauseSession() {
    if (!running) return;
    paused = !paused;
    updatePauseButtonUI();
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
    el.phaseCount.innerHTML = "";
    el.roundCounter.textContent = `${I18N[currentLang].roundWord} 0 / ${session.rounds}`;
    el.startBtn.disabled = false;
    el.pauseBtn.disabled = true;
    el.resetBtn.disabled = true;
    updatePauseButtonUI();
  }

  // ---------- wiring ----------
  // Event listeners are wired up FIRST, before anything that could
  // possibly throw (settings/translation loading). This way, even if a
  // later step fails, the buttons still respond instead of the whole
  // page going dead.
  function wireEvents() {
    el.settingsToggle.addEventListener("click", openDrawer);
    el.drawerClose.addEventListener("click", closeDrawer);
    el.drawerBackdrop.addEventListener("click", closeDrawer);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDrawer();
    });

    el.themeSwitchBtns.forEach((btn) => {
      btn.addEventListener("click", () => applyTheme(btn.dataset.themeChoice));
    });
    el.langSwitchBtns.forEach((btn) => {
      btn.addEventListener("click", () => setLang(btn.dataset.langChoice));
    });
    el.cfgMusic.addEventListener("change", () => {
      applyMusicSelection();
      saveSettings();
    });
    el.cfgImage.addEventListener("change", () => {
      applyImageSelection();
      saveSettings();
    });

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
  }

  function init() {
    wireEvents();
    try {
      loadSettings();
      initThemeDefault();
      updateThemeSwitchUI();
      updateLangSwitchUI();
      document.documentElement.lang = currentLang;
      applyTranslations();
      selectPreset("box");
    } catch (err) {
      console.error("Samay: erreur au démarrage, réglages/traductions non appliqués.", err);
      // Fall back to a minimal working session so the buttons still work.
      if (!session) {
        session = { type: "pattern", ...PRESETS.box };
        resetSession();
      }
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
