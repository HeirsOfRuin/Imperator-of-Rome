// Win rate by road and difficulty: does each road carry a run on every difficulty?
export default {
  runs: 14, metric: 'win',
  rows: { wealth: { road: 'wealth' }, military: { road: 'military' }, politics: { road: 'politics' }, charisma: { road: 'charisma' } },
  cols: { legionary: { difficulty: 'legionary' }, centurion: { difficulty: 'centurion' }, legate: { difficulty: 'legate' } },
  fixed: { start: 'GSU' },
};
