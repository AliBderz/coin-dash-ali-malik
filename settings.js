// Keep tuning separate from game behaviour so features can be developed independently.
window.COIN_DASH = {
  width: 800,
  height: 500,
  roundSeconds: 45,
  playerSpeed: 240,
  pointerStopDistance: 8, // px: the player stops this close to a held finger or mouse button
  droneSpeed: 105,
  droneCount: 3,
  storageKey: 'coinDash.best', // localStorage key for the best score
  // Neon arcade: near-black backdrop, electric accents, white-hot edges.
  colors: { background: 0x05060f, grid: 0x1b2f6b, player: 0x19f3ff, coin: 0xffd23f, drone: 0xff2bd6,
    edge: 0xffffff, panel: 0x05060f, text: '#e9fbff' },
  glowSize: 40,
  pause: { panelColor: 0x05060f, panelAlpha: 0.85 },
  sound: { volume: 0.4, coinPitch: 660 }, // master volume 0..1 and the first coin blip's pitch in Hz
  // Shield pickup: appears every `every` seconds, stays `lifetime` seconds, protects for `seconds`.
  shield: { every: 12, lifetime: 6, seconds: 5, color: 0x7fc8ff }
};
