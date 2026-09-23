// Presets. Two session "types" are supported by the engine in js/app.js:
//
// - "pattern": a simple repeating cycle of inhale / hold / exhale / hold,
//   repeated `rounds` times. Used by "box" and "daily", and by the
//   user-editable "Custom" session.
//
// - "wimhof": a Wim-Hof-style round of rapid breaths followed by a breath
//   hold and a recovery hold, repeated `rounds` times. Used by "morning".
//   Not editable from the config panel (only the preconfigured values
//   below) — tweak them here if you want a different pace/duration.
const PRESETS = {
  morning: {
    type: "wimhof",
    label: "Daily morning routine",
    breaths: 30,
    breath_inhale: 2,
    breath_exhale: 1,
    hold: 60,
    recovery_hold: 15,
    rounds: 3,
  },
  box: {
    type: "pattern",
    label: "Box breathing",
    inhale: 4,
    hold_in: 4,
    exhale: 4,
    hold_out: 4,
    rounds: 6,
  },
  daily: {
    type: "pattern",
    label: "Daily",
    inhale: 5,
    hold_in: 0,
    exhale: 5,
    hold_out: 0,
    rounds: 20,
  },
};

// Background music tracks. Drop your own royalty-free .mp3 files into /audio
// using these exact filenames (see audio/README.md), or edit this list to
// point at whatever files you add.
const MUSIC_TRACKS = [
  { id: "rain", label: "Pluie douce", src: "audio/rain.mp3" },
  { id: "ocean", label: "Vagues", src: "audio/ocean.mp3" },
  { id: "drone", label: "Nappe ambiante", src: "audio/drone.mp3" },
];
