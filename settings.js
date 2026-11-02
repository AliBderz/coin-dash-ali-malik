// Keep tuning separate from game behaviour so features can be developed independently.
window.COIN_DASH = {
  width: 800,
  height: 500,
  roundSeconds: 45,
  playerSpeed: 240,
  droneSpeed: 105,
  droneCount: 3,
  colors: { background: 0x000000, player: 0x00ff66, coin: 0xffff00, drone: 0xff0044 },
  gridSize: 8,
  gridColor: 0x223355,
  hudColor: '#00ffff',
  // An object, because Phaser splits a font string on spaces and would break the family list.
  hudFont: { fontStyle: 'bold', fontSize: '18px', fontFamily: '"Courier New", Courier, monospace' }
};
