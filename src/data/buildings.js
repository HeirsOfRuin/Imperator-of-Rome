// Provincial works (docs/ECONOMY.md). Works a governor could finish in a
// season, not monuments: the campaign lasts three or four years. Costs in
// thousands of denarii; upkeep a month.
export const BUILDINGS = {
  road: { name: 'Road repairs', latin: 'via', cost: 120, months: 2, upkeep: 2, does: 'Revenue +8%: carts and tax collectors move faster' },
  granary: { name: 'Granaries', latin: 'horrea', cost: 150, months: 3, upkeep: 3, does: 'Unrest falls 1 a month faster; grain provinces send half a shipload more' },
  harbour: { name: 'Harbour works', latin: 'portus', cost: 220, months: 4, upkeep: 4, does: 'Armies cross the sea from here in winter without delay or loss; grain ships sail all winter', needsCoast: true },
  castra: { name: 'Stone camp', latin: 'castra', cost: 200, months: 4, upkeep: 4, does: 'Garrison fights half again as hard; legions stationed here grow loyal and refill their ranks' },
  limes: { name: 'Signal towers', latin: 'limes', cost: 140, months: 3, upkeep: 3, does: 'Frontier threat rises a third more slowly', needsFrontier: true },
  dilectus: { name: 'Levy office', latin: 'dilectus', cost: 100, months: 2, upkeep: 2, does: 'Legions raised here come a month sooner, a quarter cheaper, and better drilled' },
  mint: { name: 'Mint', latin: 'moneta', cost: 300, months: 5, upkeep: 6, does: 'Coin with your face: +40k a month and legitimacy', onlyAt: ['LUG', 'ROM', 'SYR', 'EGY', 'TAR'] },
  temple: { name: 'Temple of the imperial cult', latin: 'aedes', cost: 180, months: 4, upkeep: 3, does: 'Legitimacy grows; unrest falls 1 a month faster' },
};
export const SLOTS = { legion: 4, grain: 3, interior: 3, proc: 2, italy: 4 };
export const GAMES_COST = 120;

// Governors' traits
export const TRAITS = {
  honest: { name: 'honest', does: 'Unrest falls 1 a month faster' },
  greedy: { name: 'greedy', does: 'Revenue +15%, but unrest rises 2 a month' },
  able: { name: 'able', does: 'Revenue +8%; legions raised a month sooner' },
  ambitious: { name: 'ambitious', does: 'Revenue +5%; may claim the province for himself if you look weak' },
  timid: { name: 'timid', does: 'No gain, no risk' },
};
