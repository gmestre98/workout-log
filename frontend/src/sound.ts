// Short audio cues: one when a timed set reaches its target duration, one when
// a between-set rest countdown finishes. These use the Web Audio API so there
// are no audio assets to bundle, and a single AudioContext is created lazily on
// first use — by which point the user has already tapped a control, satisfying
// the browser's autoplay-requires-a-gesture rule.

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
  if (!AC) return null; // e.g. jsdom in tests — cues are simply skipped
  if (!ctx) ctx = new AC();
  return ctx;
}

// Play a sequence of buzzes, each `dur` seconds long with a short `gap` of
// silence between them. A square wave gives the buzz its body, and a low-pass
// filter rolls off the harsh high harmonics so it reads as a plain, steady buzz
// — no shrill stridency and no vibrato/tremolo wobble.
function buzz(freqs: number[], dur: number, gap: number) {
  const ac = context();
  if (!ac) return;
  // The context can start suspended until a user gesture resumes it.
  if (ac.state === "suspended") void ac.resume();
  let t = ac.currentTime;
  for (const freq of freqs) {
    const osc = ac.createOscillator();
    const filter = ac.createBiquadFilter();
    const env = ac.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    // Low-pass keeps the fundamental plus a couple of harmonics: warm, not shrill.
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.7;
    // Amplitude envelope: quick fade in, steady sustain, quick fade out.
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.18, t + 0.03);
    env.gain.setValueAtTime(0.18, t + dur - 0.05);
    env.gain.linearRampToValueAtTime(0.0001, t + dur);
    osc.connect(filter).connect(env).connect(ac.destination);
    osc.start(t);
    osc.stop(t + dur);
    t += dur + gap;
  }
}

// Two warm buzzes: a timed set has reached its target duration.
export function playSetDone() {
  buzz([330, 330], 0.3, 0.08);
}

// Three lower warm buzzes: the rest period before the next set is over.
export function playRestDone() {
  buzz([247, 247, 247], 0.28, 0.08);
}
