// Client kings and foreign powers who can lend men (docs/FRAME-DIPLOMACY.md).
// near: the province you must hold (or border) to deal with them.
// Sources: Tacitus, Histories 2.81 (the kings who backed Vespasian), 4.51
// (Vologases' offer of 40,000 horsemen), 2.58 (Lucceius Albinus and the Mauri).
export const CLIENTS = [
  { id: 'agrippa', name: 'Agrippa II', near: 'JUD', men: 3000, exp: 0.7, group: 'east', cost: 250 },
  { id: 'sohaemus', name: 'Sohaemus of Emesa', near: 'SYR', men: 3000, exp: 0.7, group: 'east', cost: 250 },
  { id: 'antiochus', name: 'Antiochus IV of Commagene', near: 'SYR', men: 4000, exp: 0.75, group: 'east', cost: 320 },
  { id: 'mauri', name: 'the Mauretanian chiefs', near: 'MCA', men: 3000, exp: 0.6, group: 'africa', cost: 200 },
  { id: 'cottii', name: 'the Alpine chiefs', near: 'ACO', men: 2000, exp: 0.6, group: 'italy', cost: 130 },
  { id: 'parthia', name: 'Vologases of Parthia', near: 'SYR', men: 10000, exp: 0.8, group: 'east', cost: 450, legit: -15, mustHold: true },
];
