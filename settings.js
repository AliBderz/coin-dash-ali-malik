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
  colors: { background: 0x101c31, player: 0x71e8ce, coin: 0xffd166, drone: 0xff657a, chaser: 0xb36bff, magnet: 0x4da6ff }
};
