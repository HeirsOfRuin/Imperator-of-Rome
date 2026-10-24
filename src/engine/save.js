// Saves are a contract: the key never changes, the payload carries a version,
// and every old version migrates forward. The text code (IMPR1.) moves a game
// between devices; the compression lives in the UI (browser streams).
import { rngs } from './core.js';

export const SAVE_KEY = 'imperator.save';
export const SAVE_VERSION = 1;

export function toSave(s) {
  const { R, events, ...rest } = s;
  return { v: SAVE_VERSION, state: rest };
}

const MIGRATIONS = {
  // 1 -> 2 goes here when the state shape changes
};

export function fromSave(obj) {
  if (!obj || typeof obj !== 'object' || !obj.state) throw new Error('Not an Imperator save');
  let { v, state } = obj;
  if (v > SAVE_VERSION) throw new Error('This save comes from a newer version of the game');
  while (v < SAVE_VERSION) { state = MIGRATIONS[v](state); v++; }
  state.events = [];
  state.R = rngs(state);
  return state;
}
