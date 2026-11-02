// Keep tuning separate from game behaviour so features can be developed independently.
window.COIN_DASH = {
  width: 800,
  height: 500,
  roundSeconds: 45,
  playerSpeed: 240,
  droneSpeed: 105,
  droneCount: 3,
  coinsPerLevel: 8,
  levelSpeedFactor: 1.1,
  levelDroneSafeDistance: 150,
  chaserSpeedFactor: 0.7,
  chaserTurnDegPerSec: 90,
  comboWindowMs: 2000,
  comboMax: 5,
  magnetIntervalMs: 10000,
  magnetDurationMs: 5000,
  magnetRadius: 150,
  magnetPullSpeed: 140,
  colors: { background: 0x000000, player: 0x00ff66, coin: 0xffff00, drone: 0xff0044, chaser: 0xbb44ff, magnet: 0x3399ff, player2: 0xff00ff },
  gridSize: 8,
  gridColor: 0x223355,
  hudColor: '#00ffff',
  // An object, because Phaser splits a font string on spaces and would break the family list.
  hudFont: { fontStyle: 'bold', fontSize: '18px', fontFamily: '"Courier New", Courier, monospace' }
};
