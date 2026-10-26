// Sound, made in the browser (no files): trumpets for a battle round, drums at
// the month's end, a fanfare or a low horn for a result, a chime for a choice.
// Played only from a tap (phones allow audio only after a gesture). The
// setting is kept per device. Fails silent: no audio, no harm.
import { lsGet, lsSet } from './storage.js';

const KEY = 'imperator.sound';
let ctx = null, master = null;
export const soundOn = () => lsGet(KEY) !== 'off';
export function setSound(on) { lsSet(KEY, on ? 'on' : 'off'); }

function audio() {
  if (!soundOn()) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.22; master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

// a brass note: two detuned saws through a lowpass that opens on the attack
function brass(a, f, t, d, vol = 1) {
  const g = a.createGain(), lp = a.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.setValueAtTime(400, t); lp.frequency.linearRampToValueAtTime(2600, t + 0.06); lp.frequency.linearRampToValueAtTime(1400, t + d);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * vol, t + 0.05); g.gain.setValueAtTime(0.45 * vol, t + d - 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  for (const det of [-6, 6]) { const o = a.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det; o.connect(lp); o.start(t); o.stop(t + d + 0.05); }
  lp.connect(g); g.connect(master);
}
// a drum: a falling sine thump with a little noise
function drum(a, t, vol = 1) {
  const o = a.createOscillator(), g = a.createGain();
  o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.18);
  g.gain.setValueAtTime(0.9 * vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.3);
  const n = a.createBufferSource(), buf = a.createBuffer(1, a.sampleRate * 0.08, a.sampleRate), ch = buf.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
  const ng = a.createGain(); ng.gain.value = 0.25 * vol; n.buffer = buf; n.connect(ng); ng.connect(master); n.start(t);
}
function chime(a, f, t) {
  const o = a.createOscillator(), g = a.createGain();
  o.type = 'sine'; o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + 1);
}

const C4 = 261.63, G4 = 392, C5 = 523.25, E5 = 659.25, G3 = 196, Eb4 = 311.13;
const SOUNDS = {
  trumpets: (a, t) => { brass(a, G4, t, 0.18); brass(a, G4, t + 0.2, 0.12); brass(a, C5, t + 0.34, 0.45); },
  month: (a, t) => { drum(a, t); drum(a, t + 0.22, 0.7); drum(a, t + 0.44); },
  victory: (a, t) => { brass(a, C4, t, 0.2); brass(a, G4, t + 0.2, 0.2); brass(a, C5, t + 0.4, 0.2); brass(a, E5, t + 0.6, 0.7); },
  defeat: (a, t) => { brass(a, G3 * 1.0, t, 0.6, 0.8); brass(a, Eb4 * 0.75, t + 0.55, 1.0, 0.7); },
  choice: (a, t) => { chime(a, E5, t); chime(a, C5 * 1.5, t + 0.12); },
};

export function play(name) {
  const a = audio();
  if (!a || !SOUNDS[name]) return;
  try { SOUNDS[name](a, a.currentTime + 0.02); } catch { /* audio is a nicety */ }
}
