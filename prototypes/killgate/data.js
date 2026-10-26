// Map and order of battle, March AD 68. Source table: docs/PROVINCES.md.
// Revenue and grain are PROVISIONAL game units (thousands of denarii a month,
// collectable in wartime; grain in shiploads a month). They are set for the kill
// gate and will be replaced by docs/ECONOMY.md at Stage 3.

// tier: legion | grain | interior | proc | italy
// frontier: which frontier the province guards (threat rises if stripped)
// aux: auxiliary garrison, men
export const PROVINCES = [
  { id: 'BRI', name: 'Britannia', tier: 'legion', rev: 110, grain: 0, frontier: 'britain', aux: 3000 },
  { id: 'GIN', name: 'Germania Inferior', tier: 'legion', rev: 80, grain: 0, frontier: 'rhine', aux: 3000 },
  { id: 'GSU', name: 'Germania Superior', tier: 'legion', rev: 80, grain: 0, frontier: 'rhine', aux: 2500 },
  { id: 'BEL', name: 'Gallia Belgica', tier: 'interior', rev: 140, grain: 0, aux: 1000 },
  { id: 'LUG', name: 'Gallia Lugdunensis', tier: 'interior', rev: 170, grain: 0, aux: 1200 },
  { id: 'AQU', name: 'Gallia Aquitania', tier: 'interior', rev: 130, grain: 0, aux: 600 },
  { id: 'NAR', name: 'Gallia Narbonensis', tier: 'interior', rev: 160, grain: 0, aux: 600 },
  { id: 'TAR', name: 'Hispania Tarraconensis', tier: 'legion', rev: 180, grain: 0, aux: 2000 },
  { id: 'LUS', name: 'Lusitania', tier: 'interior', rev: 90, grain: 0, aux: 800 },
  { id: 'BAE', name: 'Baetica', tier: 'grain', rev: 170, grain: 0.5, aux: 500 },
  { id: 'AMA', name: 'Alpes Maritimae', tier: 'proc', rev: 15, grain: 0, aux: 600 },
  { id: 'ACO', name: 'Alpes Cottiae', tier: 'proc', rev: 15, grain: 0, aux: 600 },
  { id: 'AGP', name: 'Alpes Graiae et Poeninae', tier: 'proc', rev: 15, grain: 0, aux: 600 },
  { id: 'RAE', name: 'Raetia', tier: 'proc', rev: 30, grain: 0, aux: 2500 },
  { id: 'NOR', name: 'Noricum', tier: 'proc', rev: 40, grain: 0, aux: 2000 },
  { id: 'PAN', name: 'Pannonia', tier: 'legion', rev: 70, grain: 0, frontier: 'danube', aux: 3000 },
  { id: 'DAL', name: 'Dalmatia', tier: 'legion', rev: 80, grain: 0, aux: 1500 },
  { id: 'MOE', name: 'Moesia', tier: 'legion', rev: 60, grain: 0, frontier: 'danube', aux: 3000 },
  { id: 'THR', name: 'Thracia', tier: 'interior', rev: 60, grain: 0, aux: 1500 },
  { id: 'MAC', name: 'Macedonia', tier: 'interior', rev: 90, grain: 0, aux: 600 },
  { id: 'ACH', name: 'Achaea', tier: 'interior', rev: 80, grain: 0, aux: 400 },
  { id: 'ASI', name: 'Asia', tier: 'grain', rev: 340, grain: 0, aux: 600 },
  { id: 'BIT', name: 'Bithynia et Pontus', tier: 'interior', rev: 140, grain: 0, aux: 800 },
  { id: 'GAL', name: 'Galatia', tier: 'interior', rev: 80, grain: 0, aux: 1000 },
  { id: 'CAP', name: 'Cappadocia', tier: 'proc', rev: 50, grain: 0, frontier: 'east', aux: 2500 },
  { id: 'LYC', name: 'Lycia et Pamphylia', tier: 'interior', rev: 60, grain: 0, aux: 500 },
  { id: 'CIL', name: 'Cilicia', tier: 'interior', rev: 60, grain: 0, aux: 600 },
  { id: 'CYP', name: 'Cyprus', tier: 'interior', rev: 50, grain: 0, aux: 300 },
  { id: 'SYR', name: 'Syria', tier: 'legion', rev: 270, grain: 0, frontier: 'east', aux: 4000 },
  { id: 'JUD', name: 'Judaea', tier: 'legion', rev: 60, grain: 0, frontier: 'judaea', aux: 4000 },
  { id: 'EGY', name: 'Aegyptus', tier: 'grain', rev: 420, grain: 4, aux: 3000 },
  { id: 'CRC', name: 'Creta et Cyrenaica', tier: 'interior', rev: 60, grain: 0, aux: 500 },
  { id: 'AFR', name: 'Africa Proconsularis', tier: 'legion', rev: 240, grain: 8, frontier: 'africa', aux: 2000 },
  { id: 'MCA', name: 'Mauretania Caesariensis', tier: 'proc', rev: 50, grain: 0, aux: 3000 },
  { id: 'MTI', name: 'Mauretania Tingitana', tier: 'proc', rev: 40, grain: 0, aux: 2500 },
  { id: 'SIC', name: 'Sicilia', tier: 'grain', rev: 100, grain: 1, aux: 300 },
  { id: 'SAR', name: 'Sardinia et Corsica', tier: 'grain', rev: 50, grain: 1, aux: 500 },
  // Italy: four game regions
  { id: 'NIT', name: 'Northern Italy', tier: 'italy', rev: 150, grain: 0, aux: 0 },
  { id: 'ETR', name: 'Etruria and Umbria', tier: 'italy', rev: 100, grain: 0, aux: 0 },
  { id: 'ROM', name: 'Rome and Latium', tier: 'italy', rev: 250, grain: 0, aux: 3000 },
  { id: 'CMP', name: 'Campania and the south', tier: 'italy', rev: 120, grain: 0, aux: 1000 },
];

// [a, b, months, kind]. kind: land | sea | alps. Sea and alps are slow and
// costly November to March.
export const EDGES = [
  ['BRI', 'BEL', 1, 'sea'], ['BRI', 'LUG', 1, 'sea'],
  ['GIN', 'GSU', 1, 'land'], ['GIN', 'BEL', 1, 'land'],
  ['GSU', 'BEL', 1, 'land'], ['GSU', 'RAE', 1, 'land'], ['GSU', 'LUG', 1, 'land'], ['GSU', 'AGP', 1, 'land'],
  ['BEL', 'LUG', 1, 'land'],
  ['LUG', 'AQU', 1, 'land'], ['LUG', 'NAR', 1, 'land'], ['LUG', 'AGP', 1, 'land'],
  ['AQU', 'NAR', 1, 'land'], ['AQU', 'TAR', 1, 'alps'],
  ['NAR', 'TAR', 1, 'land'], ['NAR', 'AMA', 1, 'land'], ['NAR', 'ACO', 1, 'land'], ['NAR', 'SAR', 1, 'sea'],
  ['TAR', 'LUS', 1, 'land'], ['TAR', 'BAE', 1, 'land'], ['TAR', 'SAR', 1, 'sea'],
  ['LUS', 'BAE', 1, 'land'], ['BAE', 'MTI', 1, 'sea'], ['MTI', 'MCA', 1, 'land'], ['MCA', 'AFR', 1, 'land'],
  ['AFR', 'SIC', 1, 'sea'], ['AFR', 'SAR', 1, 'sea'], ['AFR', 'ROM', 1, 'sea'], ['AFR', 'CRC', 2, 'land'],
  ['CRC', 'EGY', 2, 'land'], ['CRC', 'ACH', 1, 'sea'],
  ['EGY', 'JUD', 1, 'land'], ['EGY', 'ROM', 2, 'sea'],
  ['JUD', 'SYR', 1, 'land'],
  ['SYR', 'CIL', 1, 'land'], ['SYR', 'CAP', 2, 'land'], ['SYR', 'CYP', 1, 'sea'],
  ['CIL', 'GAL', 1, 'land'], ['CIL', 'LYC', 1, 'land'], ['CIL', 'CYP', 1, 'sea'],
  ['CAP', 'GAL', 1, 'land'],
  ['GAL', 'BIT', 1, 'land'], ['GAL', 'ASI', 1, 'land'], ['GAL', 'LYC', 1, 'land'],
  ['ASI', 'BIT', 1, 'land'], ['ASI', 'LYC', 1, 'land'], ['ASI', 'ACH', 1, 'sea'], ['ASI', 'THR', 1, 'land'],
  ['BIT', 'THR', 1, 'land'],
  ['THR', 'MAC', 1, 'land'], ['THR', 'MOE', 1, 'land'],
  ['MAC', 'ACH', 1, 'land'], ['MAC', 'DAL', 2, 'land'], ['MAC', 'MOE', 1, 'land'],
  ['ACH', 'CMP', 1, 'sea'],
  ['MOE', 'PAN', 1, 'land'], ['MOE', 'DAL', 1, 'land'],
  ['PAN', 'DAL', 1, 'land'], ['PAN', 'NOR', 1, 'land'], ['PAN', 'NIT', 1, 'land'],
  ['DAL', 'NIT', 1, 'land'], ['DAL', 'CMP', 1, 'sea'],
  ['NOR', 'RAE', 1, 'land'], ['NOR', 'NIT', 1, 'alps'],
  ['RAE', 'NIT', 1, 'alps'], ['RAE', 'AGP', 1, 'alps'],
  ['AGP', 'NIT', 1, 'alps'], ['ACO', 'NIT', 1, 'alps'], ['AMA', 'NIT', 1, 'land'],
  ['NIT', 'ETR', 1, 'land'], ['ETR', 'ROM', 1, 'land'], ['ROM', 'CMP', 1, 'land'],
  ['SIC', 'CMP', 1, 'sea'], ['SAR', 'ROM', 1, 'sea'],
];

// Legion stations, March 68. group = service region, used for shared-history
// (appeal to comrades) and for distance from station.
export const LEGIONS = [
  { id: 'II-Aug', station: 'BRI', group: 'britain' },
  { id: 'IX-Hisp', station: 'BRI', group: 'britain' },
  { id: 'XX-VV', station: 'BRI', group: 'britain' },
  { id: 'I-Germ', station: 'GIN', group: 'rhine' },
  { id: 'V-Alaud', station: 'GIN', group: 'rhine' },
  { id: 'XV-Prim', station: 'GIN', group: 'rhine' },
  { id: 'XVI-Gall', station: 'GIN', group: 'rhine' },
  { id: 'IV-Mac', station: 'GSU', group: 'rhine' },
  { id: 'XXI-Rap', station: 'GSU', group: 'rhine' },
  { id: 'XXII-Prim', station: 'GSU', group: 'rhine' },
  { id: 'VI-Vic', station: 'TAR', group: 'spain' },
  { id: 'X-Gem', station: 'PAN', group: 'danube' },
  { id: 'XIII-Gem', station: 'PAN', group: 'danube' },
  { id: 'XI-Claud', station: 'DAL', group: 'danube' },
  { id: 'XIV-Gem', station: 'DAL', group: 'britain' }, // Boudicca's conquerors, withdrawn c. 66
  { id: 'VII-Claud', station: 'MOE', group: 'danube' },
  { id: 'VIII-Aug', station: 'MOE', group: 'danube' },
  { id: 'III-Gall', station: 'SYR', group: 'east' },
  { id: 'IV-Scyth', station: 'SYR', group: 'east' },
  { id: 'VI-Ferr', station: 'SYR', group: 'east' },
  { id: 'XII-Fulm', station: 'SYR', group: 'east' },
  { id: 'V-Mac', station: 'JUD', group: 'east' },
  { id: 'X-Fret', station: 'JUD', group: 'east' },
  { id: 'XV-Apoll', station: 'JUD', group: 'east' },
  { id: 'III-Cyr', station: 'EGY', group: 'east' },
  { id: 'XXII-Deiot', station: 'EGY', group: 'east' },
  { id: 'III-Aug', station: 'AFR', group: 'africa' },
  { id: 'I-Ital', station: 'NIT', group: 'italy' },
];

// Normal legion complement per frontier: stripping below it raises threat.
export const FRONTIERS = {
  britain: { provinces: ['BRI'], normal: 3, base: 3 },
  rhine: { provinces: ['GIN', 'GSU'], normal: 6, base: 4 },
  danube: { provinces: ['PAN', 'MOE'], normal: 3, base: 4 },
  east: { provinces: ['SYR', 'CAP'], normal: 3, base: 3 },
  judaea: { provinces: ['JUD'], normal: 2, base: 4 },
  africa: { provinces: ['AFR'], normal: 1, base: 2 },
};

export const GROUP_OF_PROVINCE = {
  BRI: 'britain', GIN: 'rhine', GSU: 'rhine', BEL: 'rhine', TAR: 'spain', LUS: 'spain', BAE: 'spain',
  PAN: 'danube', DAL: 'danube', MOE: 'danube', NOR: 'danube', SYR: 'east', JUD: 'east', EGY: 'east',
  AFR: 'africa', NIT: 'italy', ETR: 'italy', ROM: 'italy', CMP: 'italy',
};

export const STARTS = ['BRI', 'GSU', 'PAN', 'MOE', 'DAL', 'AFR', 'SYR'];

// Background choices (SPEC §13). Each option: stat deltas and friends.
// stats: opes (wealth), virtus (military), auct (politics), gratia (charisma)
export const BACKGROUND = [
  { stage: 'family', options: [
    { id: 'patrician', d: { auct: 2, opes: 1 }, legit: 12, enemies: 1 },
    { id: 'plebeian-noble', d: { auct: 1, opes: 1 }, legit: 6 },
    { id: 'italian-new-man', d: { opes: 1, gratia: 1 }, legit: 0 },
    { id: 'provincial-new-man', d: { virtus: 1, gratia: 1 }, legit: -3 },
  ] },
  { stage: 'upbringing', options: [
    { id: 'rome-rhetoric', d: { gratia: 1 } },
    { id: 'greek-education', d: { auct: 1 } },
    { id: 'estates', d: { opes: 1 } },
    { id: 'frontier', d: { virtus: 1 } },
  ] },
  { stage: 'first-office', options: [
    { id: 'mint', d: { opes: 1 }, friend: 'banker' },
    { id: 'courts', d: { auct: 1 }, friend: 'senator' },
    { id: 'police', d: { virtus: 1 } },
    { id: 'roads', d: { gratia: 1 } },
  ] },
  { stage: 'tribune', options: [ // sets the comrade group
    { id: 'rhine', d: { virtus: 1 }, comrades: 'rhine' },
    { id: 'danube', d: { virtus: 1 }, comrades: 'danube' },
    { id: 'east', d: { virtus: 1 }, comrades: 'east' },
    { id: 'britain', d: { virtus: 2 }, comrades: 'britain' },
  ] },
  { stage: 'quaestor', options: [
    { id: 'rome', d: { auct: 1 } },
    { id: 'province', d: { opes: 1 }, friend: 'patron' },
    { id: 'court', d: { auct: 1, opes: 1 }, friend: 'freedman', enemies: 1 },
  ] },
  { stage: 'aedile', options: [
    { id: 'lavish-games', d: { gratia: 2, opes: -1 } },
    { id: 'kept-books', d: { opes: 1 } },
    { id: 'tribune-plebs', d: { auct: 1 } },
  ] },
  { stage: 'pisonian', options: [
    { id: 'silent', d: {} },
    { id: 'informed', d: { auct: 1, opes: 1 }, legit: -6, enemies: 1 },
    { id: 'friends-executed', d: { gratia: 1 }, legit: 3 },
    { id: 'unnamed-plotter', d: { auct: 1, gratia: 1 }, risk: 1 },
  ] },
];
