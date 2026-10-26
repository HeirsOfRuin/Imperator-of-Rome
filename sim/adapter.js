// sim/adapter.js — connects Imperator to the measurement kit (game-measure).
// The tools in sim/ are the skill's, unchanged; everything specific to this
// game is here. Seeds reproduce tools/measure-campaign.js exactly, so numbers
// from before the kit compare one for one.

import { play as playGame } from '../src/engine/turn.js';
import { STARTS } from '../src/data/world.js';

export const axes = {
  difficulty: ['legionary', 'centurion', 'legate'],
  road: ['wealth', 'military', 'politics', 'charisma'],
  start: STARTS,
};
export const defaults = { difficulty: 'centurion' };

// measure-campaign.js: 1 + i * 7919 + start.charCodeAt(0) * 31 + start.charCodeAt(1)
export function seedFor(i, opts, seed0 = 1) {
  return seed0 + i * 7919 + opts.start.charCodeAt(0) * 31 + opts.start.charCodeAt(1);
}

export function play(seed, opts) {
  return playGame(seed, opts);
}

export function progress(s) {
  const missing = [];
  if (!s.outcome) missing.push('campaign did not finish');
  if (!(s.turn >= 1)) missing.push(`turn ${s.turn}`);
  if (s.outcome?.win && !s.stats.tookRome) missing.push('won without taking Rome');
  return missing;
}

export function metrics(s) {
  const st = s.stats;
  const tax = st.taxIncome || 0, trade = st.tradeIncome || 0;
  return {
    win: !!s.outcome.win,
    tookRome: !!st.tookRome,
    tookThenLost: !!st.tookRome && !s.outcome.win,
    turn: s.outcome.turn,
    fightsSmall: st.pSmall,
    fightsLarge: st.pLarge,
    motions: st.motions || 0,
    breaches: st.breaches || 0,
    tradeShare: trade / Math.max(1, trade + tax),
  };
}

// measure-buildings.js's signature of a campaign
export function digest(s) {
  return JSON.stringify([s.outcome, s.stats.maxLegions, Math.round(s.factions.player.treasury), s.turn]);
}

export function trace(s) {
  return `${s.outcome.cause} in month ${s.outcome.turn}; Rome ${s.stats.tookRome ? 'taken' : 'never taken'}; max legions ${s.stats.maxLegions}`;
}
