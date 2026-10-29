import { fight } from './combat.js';
import { loyalty } from './world.js';
import { hold } from './rome.js';
import { step } from './turn.js';

export const CONFIG = {
  maxTurns: 64,            // March 68 + 64 months
  legionMen: 5000,
  payPerMan: 0.0188,       // k denarii a month; 225 denarii a year
  praetorianPayMult: 3,
  buyPerMan: 0.08,         // k denarii per man at loyalty 50
  promiseMult: 1.5,
  promiseMonths: 6,
  creditPerOpes: 200,
  interest: 0.015,
  levyCost: 320,
  levyMonths: 4,
  letterCost: 20,
  romeGrainNeed: 12,
  stateShare: 0.35,        // emperor's share of neutral provinces' revenue
  donativePraetorians: 1500,
  donativePerLegion: 90,
  holdLoseMonths: 3,
  actIVTurn: 16,           // July 69, Vespasian's proclamation
  declareDeadline: 2,      // months after Act IV opens
  largeBattleMen: 18000,
  supplyLimit: 8,          // legions one army can be fed in one place
  homePayMult: 0.6,        // pay for a legion in its own province (requisitions in kind)
  legateSalary: 15,        // a month, until you hold a province
  partPayDelay: 3,
  militaryAbsorb: 0.3,
  drilledDesert: 0.4,       // a beaten military-road army: share of the usual desertions (§21)
  campaignDecay: 0.5,
  forcedMarchLoss: 0.01,    // men lost (share) on a forced second stage
  terrorLegionsMilitary: 3, // legions in Italy that make the Senate recognise a soldier (others need 5)
  guardScandal: 15,         // the Senate's favour lost when you dismiss the Guard
  forageLoss: 3,            // military road unpaid: loyalty lost a month (others lose 8)
  forageUnrest: 2,          // ...and the province they forage grows restless, per legion       // military road: loyalty lost to distance from home, as a share
  drilledRetreatLoss: 0.15, // men lost fighting back to their own lines when cut off      // extra chance a beaten legion joins a military-road victor
  charismaAppeal: 0.02,     // extra appeal chance per point of charisma, charisma road
  booty: 0.15,             // share of the loser's treasury taken after a pitched battle (doubled for the military road)
  charismaPull: 0.025,     // a month, per point of charisma, for a wavering rival legion near a charismatic commander
  rearguardLoss: 0.03,     // men lost falling back before an attacker
  retreatLoss: [0.1, 0.04], // sounding the retreat: lines in contact, lines apart         // months a part payment buys
};

export const DIFFICULTY = {
  legionary: { truceReluctance: 0, rivalLevyEvery: 3, plotMult: 3.2, generalMult: 2.5, rebelMult: 0.5, rivalRebel: 1, rivalStat: 3, rivalLoyalty: 14, rivalFunds: 1.8, praetorianDonative: 1000, procPerAct: 1, minorStandAside: 0.4, aiAggr: 0.8, leaderBias: 0, hold: 13, distMult: 0.5,
    dueOnVictory: 4, frontierMult: 0.7, startFunds: 1.2, playerEdge: 1.08, suspicionMult: 0.8, negPenalty: -0.05 },
  centurion: { truceReluctance: 1, rivalLevyEvery: 2, plotMult: 3.6, generalMult: 4.0, rebelMult: 1, rivalRebel: 0.8, rivalStat: 3, rivalLoyalty: 18, rivalFunds: 2.0, praetorianDonative: 1500, procPerAct: 2, minorStandAside: 0, aiAggr: 1.0, leaderBias: 0, hold: 18, distMult: 1.0,
    dueOnVictory: 3, frontierMult: 1.0, startFunds: 1.0, playerEdge: 1.0, suspicionMult: 1.0, negPenalty: 0 },
  legate: { truceReluctance: 2, rivalLevyEvery: 1, plotMult: 5.0, generalMult: 5.0, rebelMult: 1.3, rivalRebel: 0.45, rivalStat: 3, rivalLoyalty: 20, rivalFunds: 2.6, praetorianDonative: 2500, procPerAct: 3.5, minorStandAside: 0, aiAggr: 1.2, leaderBias: 1, hold: 23, distMult: 1.0,
    dueOnVictory: 1, frontierMult: 1.4, startFunds: 1.0, playerEdge: 1.0, suspicionMult: 1.3, negPenalty: 0.05 },
};

// Encounter preference order by road; each step is gated by a threshold.
export const ROAD_PREFS = {
  wealth: ['buy', 'negotiate', 'fight', 'bypass'],
  military: ['fight', 'negotiate', 'buy', 'bypass'],
  politics: ['negotiate', 'buy', 'fight', 'bypass'],
  charisma: ['negotiate', 'fight', 'buy', 'bypass'],
};

export const NEG_THRESHOLD = { wealth: 0.4, military: 0.4, politics: 0.25, charisma: 0.25 };

export const FIGHT_RATIO = { wealth: 1.6, military: 1.3, politics: 1.5, charisma: 1.3 };

export const ROAD_STAT = { wealth: 'opes', military: 'virtus', politics: 'auct', charisma: 'gratia' };

// Walled towns: they cannot be bought. Open the gates by negotiation, storm
// them, or march past.
export const TOWN_MEN = { legion: 1200, grain: 1500, interior: 1200, proc: 0, italy: 1800 };
