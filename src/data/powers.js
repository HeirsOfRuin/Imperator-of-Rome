// Goods, peoples beyond the frontiers, and the Senate's opening favour
// (docs/FRAME-DEPTH.md). Sources for goods: Pliny, Natural History (Noric
// iron 34.145; Spanish silver and gold 33.67–78; Baetican oil 15.8; Cappadocian
// and Spanish horses 8.166; Cyprian copper 34.2); Strabo 3–4, 17.

export const GOODS = {
  grain: { name: 'Grain', does: 'Supplies: winter crossings and enemies left behind cost half the men' },
  wine: { name: 'Wine and oil', does: 'Legions grow content: loyalty +0.3 a month' },
  metal: { name: 'Metal', does: 'Levies a fifth cheaper and better armed' },
  horses: { name: 'Horses', does: 'Cavalry a quarter stronger; small fights a little easier' },
  timber: { name: 'Timber', does: 'Works a fifth cheaper' },
  luxury: { name: 'Luxuries', does: 'Legitimacy +0.3 a month; games a quarter cheaper' },
};
export const GOOD_IDS = Object.keys(GOODS);

export const PRODUCES = {
  BRI: ['metal'], GIN: ['timber'], GSU: ['timber'], BEL: ['grain'], LUG: ['wine'], AQU: ['metal'],
  NAR: ['wine'], TAR: ['metal', 'wine'], LUS: ['metal', 'horses'], BAE: ['wine', 'metal'],
  AMA: ['timber'], ACO: ['timber'], AGP: ['timber'], RAE: ['horses'], NOR: ['metal'],
  PAN: ['horses'], DAL: ['metal'], MOE: ['grain'], THR: ['horses'], MAC: ['timber', 'metal'],
  ACH: ['luxury'], ASI: ['luxury', 'wine'], BIT: ['timber'], GAL: ['horses'], CAP: ['horses'],
  LYC: ['timber'], CIL: ['timber'], CYP: ['metal'], SYR: ['luxury'], JUD: ['luxury'],
  EGY: ['grain', 'luxury'], CRC: ['horses'], AFR: ['grain', 'wine'], MCA: ['horses'], MTI: ['luxury'],
  SIC: ['grain'], SAR: ['grain', 'metal'], NIT: ['wine'], ETR: ['metal', 'wine'], ROM: [], CMP: ['wine'],
};

// Peoples beyond the frontiers. subsidy: for six months of quiet; incite: one payment.
export const PEOPLES = [
  { id: 'brigantes', name: 'Venutius of the Brigantes', frontier: 'britain', subsidy: 90, incite: 120, note: 'He has quarrelled with his wife, Rome\'s client queen Cartimandua, and wants her throne.' },
  { id: 'batavi', name: 'Julius Civilis of the Batavians', frontier: 'rhine', subsidy: 150, incite: 160, note: 'A Batavian prince and Roman citizen who has twice been in chains. He will rise for anyone who pays, and then for himself.' },
  { id: 'dacians', name: 'the Dacians and Sarmatians', frontier: 'danube', subsidy: 120, incite: 140, note: 'The Roxolani cross when the river freezes; the Dacians when the legions march away.' },
  { id: 'parthia', name: 'Vologases of Parthia', frontier: 'east', subsidy: 140, incite: 220, treaty: 220, note: 'King of Kings. He made peace with Corbulo and would rather trade than fight, if a Roman will deal with him as an equal.' },
  { id: 'garamantes', name: 'the Garamantes', frontier: 'africa', subsidy: 60, incite: 90, note: 'Desert raiders who come up to the coast when Africa\'s garrison is away.' },
];

// The Senate's opening favour toward the claimants who will appear.
export const SENATE_START = { galba: 60, otho: 45, vitellius: 35, vespasian: 45, vindex: 40, macer: 20, nymphidius: 25, capito: 30, albinus: 20 };

// How the four claimants deal. Tacitus' portraits, reduced to numbers the
// diplomacy reads (diplomacy.js evaluate).
export const PERSONALITY = {
  galba: { text: 'Stingy and stiff: gifts move him half as much; he will not pay to make peace.', giftMult: 0.5, truce: 0, trade: -0.1 },
  otho: { text: 'Charming and quick: he takes a truce more easily, and forgets an insult.', giftMult: 1.2, truce: 0.12, trade: 0.1 },
  vitellius: { text: 'Idle and greedy: gold weighs with him more than reasons.', giftMult: 1.5, truce: 0.05, trade: 0.15 },
  vespasian: { text: 'Patient and careful: he makes truces easily and alliances seldom, and keeps his word.', giftMult: 0.8, truce: 0.1, alliance: -0.15, trade: 0.1 },
};
