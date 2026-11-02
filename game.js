/* global Phaser, COIN_DASH */
class CoinDash extends Phaser.Scene {
  constructor() { super('CoinDash'); }

  create() {
    const c = COIN_DASH;
    // The registry outlives scene.restart(), so the chosen preset survives R and tap-to-restart.
    // Every other feature is reset below, because create() runs again on each restart.
    this.difficulty = this.registry.get('difficulty') || c.defaultDifficulty;
    this.preset = c.difficulties[this.difficulty];
    this.score = 0;
    this.finished = false;
    this.paused = false;
    this.frozenAt = null; // clock time at which a pause or the end of the round stopped the HUD
    this.combo = 1;
    this.lastCoinTime = -Infinity; // No previous coin, so the first coin always scores at x1.
    this.coinsCollected = 0;
    this.level = 1;
    // Keep the best seen in this page session as a fallback when storage is unavailable.
    this.best = Math.max(this.loadBest(), this.best || 0);
    this.shieldUntil = 0; // clock time when the current shield runs out; 0 means no shield
    this.shieldOwner = null; // the player who collected the current shield
    this.shieldExpiry = null; // timer that removes an uncollected pickup
    this.deadline = this.time.now + c.roundSeconds * 1000;
    this.sounds = window.coinDashSounds;
    this.sounds.reset();
    this.physics.world.setBounds(0, 44, c.width, c.height - 44);
    this.grid = this.add.grid(c.width / 2, c.height / 2, c.width, c.height, 40, 40,
      c.colors.background, 1, c.colors.grid, 0.3);
    // The grid renderer reads outlineFillAlpha every frame, so tweening it makes the lines pulse.
    this.tweens.add({ targets: this.grid, outlineFillAlpha: 0.8, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // Glow: a larger translucent copy of the player, drawn beneath it and kept in step in update().
    this.glow = this.add.rectangle(c.width / 2, c.height / 2, c.glowSize, c.glowSize, c.colors.player, 0.25);
    this.tweens.add({ targets: this.glow, alpha: 0.5, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // Two lines fit above the play area, which starts at y = 44.
    this.hud = this.add.text(18, 3, '', { font: '16px monospace', color: c.colors.text, lineSpacing: 2 });
    this.player = this.add.rectangle(c.width / 2, c.height / 2, 24, 24, c.colors.player).setStrokeStyle(2, c.colors.edge);
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);
    this.createPlayer2();
    this.coin = this.add.circle(100, 100, 9, c.colors.coin).setStrokeStyle(2, c.colors.edge, 0.8);
    this.physics.add.existing(this.coin);
    this.coin.body.setCircle(9);
    this.placeCoin();
    // Shield pickup: a translucent light-blue disc with a thin ring, hidden until its timer spawns it.
    this.shieldPickup = this.add.circle(0, 0, 11, c.shield.color, 0.35).setStrokeStyle(2, c.shield.color);
    this.physics.add.existing(this.shieldPickup);
    this.shieldPickup.body.setCircle(11);
    this.hideShieldPickup();
    this.shieldTimer = this.time.addEvent({
      delay: c.shield.every * 1000, loop: true, callback: this.spawnShield, callbackScope: this
    });
    this.drones = this.physics.add.group();
    // Original 270 px spacing, squeezed to fit 90..width-90 when a preset has more drones.
    // The row sits at y = 100, 150 px above the player's centre start.
    const { droneCount, droneSpeed } = this.preset;
    const gap = Math.min(270, (c.width - 180) / Math.max(1, droneCount - 1));
    for (let i = 0; i < droneCount; i++) {
      this.addDrone(90 + i * gap, 100, (35 + i * 105) * Math.PI / 180, droneSpeed);
    }
    this.spawnChaser();
    this.createMagnet();
    // Bubble drawn around the shielded player; it follows that player in update().
    this.shieldRing = this.add.circle(this.player.x, this.player.y, 22, c.shield.color, 0.15)
      .setStrokeStyle(3, c.shield.color).setVisible(false);
    this.physics.add.overlap(this.player, this.coin, () => {
      if (this.finished) return;
      this.collectCoinScore();
      this.afterCoin();
    });
    this.physics.add.overlap(this.player2, this.coin, () => {
      if (this.finished || !this.player2Active) return;
      this.score2++;
      this.afterCoin();
    });
    this.addPlayerOverlaps(this.player, 'you');
    this.addPlayerOverlaps(this.player2, 'player 2');
    this.physics.add.overlap(this.player, this.magnet, () => {
      if (this.finished) return;
      this.magnet.setVisible(false);
      this.magnet.body.enable = false;
      this.magnetUntil = this.time.now + c.magnetDurationMs;
    });
    this.cursors = this.input.keyboard.createCursorKeys();
    // Registering a key makes its keydown event ignore key auto-repeat, so holding it cannot flicker.
    this.keys = this.input.keyboard.addKeys('W,A,S,D,R,P,ESC,M,T,ONE,TWO,THREE');
    this.keys2 = this.input.keyboard.addKeys('I,J,K,L');
    this.input.keyboard.on('keydown-R', () => this.scene.restart());
    ['easy', 'normal', 'hard'].forEach((name, i) => this.input.keyboard.on(
      `keydown-${['ONE', 'TWO', 'THREE'][i]}`, () => { this.registry.set('difficulty', name); this.scene.restart(); }));
    this.input.keyboard.on('keydown-P', () => this.togglePause());
    this.input.keyboard.on('keydown-ESC', () => this.togglePause());
    this.input.keyboard.on('keydown-T', () => this.togglePlayer2());
    this.input.keyboard.on('keydown-M', () => {
      this.sounds.toggleMute();
      this.drawHud(); // update() does not run while paused or after the round, but the HUD must still change.
    });
    // Phaser only emits this for presses that started on the canvas, so page clicks do not restart.
    this.input.on('pointerdown', () => { if (this.finished) this.scene.restart(); });
    // Added last so it draws above everything else; shown only while paused.
    this.pauseOverlay = this.add.container(c.width / 2, c.height / 2, [
      this.add.rectangle(0, 0, 460, 150, c.pause.panelColor, c.pause.panelAlpha).setStrokeStyle(2, c.colors.player),
      this.add.text(0, 0, 'PAUSED\npress P to resume',
        { font: '24px monospace', color: c.colors.text, align: 'center', lineSpacing: 12 }).setOrigin(0.5)
    ]).setVisible(false);
    this.drawHud();
  }

  togglePause() {
    if (this.finished) return;
    this.paused = !this.paused;
    this.pauseOverlay.setVisible(this.paused);
    this.shieldTimer.paused = this.paused;
    if (this.shieldExpiry) this.shieldExpiry.paused = this.paused;
    if (this.paused) {
      this.frozenAt = this.time.now;
      this.player.body.setVelocity(0, 0);
      if (this.player2Active) this.player2.body.setVelocity(0, 0);
      this.physics.pause();
      this.tweens.pauseAll();
    } else {
      // this.time.now keeps running during a pause, so shift every clock-based time by the
      // time spent paused. No round, shield, magnet or combo time is lost.
      const pausedFor = this.time.now - this.frozenAt;
      this.frozenAt = null;
      this.deadline += pausedFor;
      if (this.shieldUntil) this.shieldUntil += pausedFor;
      if (this.magnetUntil) this.magnetUntil += pausedFor;
      this.nextMagnetAt += pausedFor;
      this.lastCoinTime += pausedFor; // -Infinity (no coin yet) stays -Infinity
      this.physics.resume();
      this.tweens.resumeAll();
    }
  }

  loadBest() {
    // localStorage can be missing or throw (private mode, blocked storage); treat that as no best yet.
    try {
      const best = parseInt(localStorage.getItem(COIN_DASH.storageKey), 10);
      return best > 0 ? best : 0;
    } catch (e) {
      return 0;
    }
  }

  saveBest(best) {
    try {
      localStorage.setItem(COIN_DASH.storageKey, String(best));
    } catch (e) {
      // Storage is unavailable or full; the best is still kept in memory for this page session.
    }
  }

  clockNow() {
    return this.frozenAt === null ? this.time.now : this.frozenAt;
  }

  secondsLeft() {
    return Math.max(0, Math.ceil((this.deadline - this.clockNow()) / 1000));
  }

  drawHud() {
    const now = this.clockNow();
    const p2 = this.player2Played ? `  P2 coins: ${this.score2}` : '';
    const magnetLeft = this.magnetUntil - now;
    const magnet = magnetLeft > 0 ? `  Magnet: ${(Math.ceil(magnetLeft / 100) / 10).toFixed(1)}s` : '';
    const shieldLeft = Math.ceil(Math.max(0, this.shieldUntil - now) / 1000);
    const shield = shieldLeft > 0 ? `  Shield: ${shieldLeft}s` : '';
    this.hud.setText([
      `Score: ${this.score}  Combo: x${this.combo}  Level: ${this.level}  Time: ${this.secondsLeft()}s${p2}`,
      `Best: ${this.best}  Difficulty: ${this.preset.label}  Sound: ${this.sounds.muted ? 'off' : 'on'}${magnet}${shield}`
    ]);
  }

  freeSpot(minDistance = 60) {
    const c = COIN_DASH;
    // A random spot inside the play area, never directly underneath a player.
    let x, y;
    do {
      x = Phaser.Math.Between(25, c.width - 25);
      y = Phaser.Math.Between(70, c.height - 25);
    } while (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < minDistance
      || (this.player2Active && Phaser.Math.Distance.Between(x, y, this.player2.x, this.player2.y) < minDistance));
    return { x, y };
  }

  placeCoin() {
    const { x, y } = this.freeSpot();
    this.coin.setPosition(x, y);
    this.coin.body.reset(x, y);
  }

  afterCoin() {
    this.sounds.coin();
    this.placeCoin();
    // Levels count every coin collected, by either player.
    this.coinsCollected++;
    if (this.coinsCollected % COIN_DASH.coinsPerLevel === 0) this.levelUp();
  }

  collectCoinScore() {
    const c = COIN_DASH;
    const withinWindow = this.time.now - this.lastCoinTime <= c.comboWindowMs;
    this.combo = withinWindow ? Math.min(this.combo + 1, c.comboMax) : 1;
    this.lastCoinTime = this.time.now;
    this.score += this.combo;
  }

  checkComboLapse() {
    if (this.time.now - this.lastCoinTime > COIN_DASH.comboWindowMs) this.combo = 1;
  }

  addDrone(x, y, angle, speed) {
    const drone = this.add.rectangle(x, y, 26, 26, COIN_DASH.colors.drone).setStrokeStyle(2, COIN_DASH.colors.edge, 0.8);
    this.drones.add(drone);
    drone.body.setCollideWorldBounds(true).setBounce(1, 1);
    drone.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  droneSpeedNow() {
    return this.preset.droneSpeed * Math.pow(COIN_DASH.levelSpeedFactor, this.level - 1);
  }

  levelUp() {
    this.level++;
    const speed = this.droneSpeedNow();
    this.drones.getChildren().forEach((drone) => {
      const velocity = drone.body.velocity.clone().setLength(speed);
      drone.body.setVelocity(velocity.x, velocity.y);
    });
    // Keep clear of the players so a level-up is never an instant death.
    const { x, y } = this.freeSpot(COIN_DASH.levelDroneSafeDistance);
    this.addDrone(x, y, Phaser.Math.Between(0, 359) * Math.PI / 180, speed);
  }

  spawnChaser() {
    const c = COIN_DASH;
    // Bottom-right corner: far from the player's centre start and the drones' top row.
    this.chaser = this.add.rectangle(c.width - 30, c.height - 30, 26, 26, c.colors.chaser).setStrokeStyle(2, c.colors.edge, 0.8);
    this.physics.add.existing(this.chaser);
    this.chaser.body.setCollideWorldBounds(true);
    this.chaserHeading = Phaser.Math.Angle.Between(this.chaser.x, this.chaser.y, this.player.x, this.player.y);
  }

  steerChaser(delta) {
    const c = COIN_DASH;
    // The chaser always hunts player 1, though it can catch either player.
    const target = Phaser.Math.Angle.Between(this.chaser.x, this.chaser.y, this.player.x, this.player.y);
    const maxTurn = Phaser.Math.DegToRad(c.chaserTurnDegPerSec) * delta / 1000;
    this.chaserHeading = Phaser.Math.Angle.RotateTo(this.chaserHeading, target, maxTurn);
    const speed = this.preset.droneSpeed * c.chaserSpeedFactor;
    this.chaser.body.setVelocity(Math.cos(this.chaserHeading) * speed, Math.sin(this.chaserHeading) * speed);
  }

  addPlayerOverlaps(player, name) {
    this.physics.add.overlap(player, this.shieldPickup, () => {
      if (!this.finished) this.collectShield(player);
    });
    this.physics.add.overlap(player, this.drones, (who, drone) => this.hitHazard(player, drone, `A drone caught ${name}!`));
    this.physics.add.overlap(player, this.chaser, () => this.hitHazard(player, this.chaser, `The chaser caught ${name}!`));
  }

  hitHazard(player, hazard, reason) {
    if (this.finished) return;
    if (player === this.player2 && !this.player2Active) return;
    if (this.isShielded(player)) {
      this.bounceHazard(player, hazard);
      return;
    }
    this.sounds.crash();
    this.finish(reason);
  }

  spawnShield() {
    if (this.finished) return;
    const { x, y } = this.freeSpot();
    this.shieldPickup.setPosition(x, y).setVisible(true);
    this.shieldPickup.body.reset(x, y);
    this.shieldPickup.body.enable = true;
    if (this.shieldExpiry) this.shieldExpiry.remove(false);
    this.shieldExpiry = this.time.delayedCall(COIN_DASH.shield.lifetime * 1000, this.hideShieldPickup, [], this);
  }

  hideShieldPickup() {
    this.shieldPickup.setVisible(false);
    this.shieldPickup.body.enable = false;
    if (this.shieldExpiry) this.shieldExpiry.remove(false);
    this.shieldExpiry = null;
  }

  collectShield(player) {
    this.hideShieldPickup();
    this.shieldOwner = player;
    this.shieldUntil = this.time.now + COIN_DASH.shield.seconds * 1000;
    this.shieldRing.setVisible(true);
  }

  clearShield() {
    this.shieldOwner = null;
    this.shieldUntil = 0;
    this.shieldRing.setVisible(false);
  }

  isShielded(player) {
    return this.shieldOwner === player && this.shieldUntil > this.time.now;
  }

  bounceHazard(player, hazard) {
    // Send the drone or chaser straight away from the shielded player.
    const away = new Phaser.Math.Vector2(hazard.x - player.x, hazard.y - player.y);
    if (away.lengthSq() === 0) away.set(1, 0);
    if (hazard === this.chaser) {
      this.chaserHeading = away.angle(); // steerChaser() turns this into a velocity
      return;
    }
    away.normalize().scale(this.droneSpeedNow());
    hazard.body.setVelocity(away.x, away.y);
  }

  createMagnet() {
    const c = COIN_DASH;
    this.magnetUntil = 0;
    this.nextMagnetAt = this.time.now + c.magnetIntervalMs;
    // One pickup is reused for every spawn; it stays hidden and disabled until the first is due.
    this.magnet = this.add.rectangle(0, 0, 20, 20, c.colors.magnet).setStrokeStyle(2, c.colors.edge, 0.8).setVisible(false);
    this.physics.add.existing(this.magnet);
    this.magnet.body.enable = false;
  }

  placeMagnet() {
    const { x, y } = this.freeSpot();
    this.magnet.body.reset(x, y);
    this.magnet.body.enable = true;
    this.magnet.setVisible(true);
  }

  updateMagnet() {
    const c = COIN_DASH;
    if (this.time.now >= this.nextMagnetAt) {
      this.placeMagnet();
      this.nextMagnetAt += c.magnetIntervalMs;
    }
    const inRange = Phaser.Math.Distance.Between(this.coin.x, this.coin.y, this.player.x, this.player.y) <= c.magnetRadius;
    if (this.time.now < this.magnetUntil && inRange) {
      const angle = Phaser.Math.Angle.Between(this.coin.x, this.coin.y, this.player.x, this.player.y);
      this.coin.body.setVelocity(Math.cos(angle) * c.magnetPullSpeed, Math.sin(angle) * c.magnetPullSpeed);
    } else {
      this.coin.body.setVelocity(0, 0);
    }
  }

  createPlayer2() {
    const c = COIN_DASH;
    // The scene object survives R, so this also resets to one-player mode.
    this.score2 = 0;
    this.player2Active = false;
    this.player2Played = false;
    this.player2 = this.add.rectangle(c.width / 2, c.height / 2, 24, 24, c.colors.player2).setStrokeStyle(2, c.colors.edge);
    this.physics.add.existing(this.player2);
    this.player2.body.setCollideWorldBounds(true);
    this.player2.setVisible(false);
    this.player2.body.enable = false;
  }

  togglePlayer2() {
    if (this.finished || this.paused) return;
    this.player2Active = !this.player2Active;
    this.player2.setVisible(this.player2Active);
    if (this.player2Active) {
      this.player2Played = true;
      const spot = this.findPlayer2Spot();
      this.player2.body.enable = true;
      this.player2.setPosition(spot.x, spot.y);
      this.player2.body.reset(spot.x, spot.y);
    } else {
      this.player2.body.setVelocity(0, 0);
      this.player2.body.enable = false;
      if (this.shieldOwner === this.player2) this.clearShield(); // A shield leaves with its owner.
    }
  }

  findPlayer2Spot() {
    const c = COIN_DASH;
    const bounds = this.physics.world.bounds;
    const others = [this.player, this.chaser, ...this.drones.getChildren()];
    // Of the spots 60 px from the centre, take the one furthest from anything else.
    const spots = [[60, 0], [-60, 0], [0, 60], [0, -60]].map(([ox, oy]) => ({
      x: Phaser.Math.Clamp(c.width / 2 + ox, bounds.x + 12, bounds.right - 12),
      y: Phaser.Math.Clamp(c.height / 2 + oy, bounds.y + 12, bounds.bottom - 12)
    }));
    const clearance = (spot) => Math.min(...others.map((other) =>
      Phaser.Math.Distance.Between(spot.x, spot.y, other.x, other.y)));
    return spots.reduce((best, spot) => (clearance(spot) > clearance(best) ? spot : best));
  }

  updatePlayer2() {
    if (!this.player2Active) return;
    const dx = Number(this.keys2.L.isDown) - Number(this.keys2.J.isDown);
    const dy = Number(this.keys2.K.isDown) - Number(this.keys2.I.isDown);
    const direction = new Phaser.Math.Vector2(dx, dy).normalize().scale(COIN_DASH.playerSpeed);
    this.player2.body.setVelocity(direction.x, direction.y);
  }

  update(time, delta) {
    if (this.finished || this.paused) return;
    const c = COIN_DASH;
    const dx = Number(this.cursors.right.isDown || this.keys.D.isDown)
      - Number(this.cursors.left.isDown || this.keys.A.isDown);
    const dy = Number(this.cursors.down.isDown || this.keys.S.isDown)
      - Number(this.cursors.up.isDown || this.keys.W.isDown);
    // A finger or mouse button held down on the canvas; presses elsewhere on the page do not count.
    const pointer = this.input.activePointer;
    const held = pointer.isDown && pointer.downElement === this.game.canvas;
    const gap = Phaser.Math.Distance.Between(pointer.x, pointer.y, this.player.x, this.player.y);
    if (dx || dy) {
      // Keys win while one is held.
      const direction = new Phaser.Math.Vector2(dx, dy).normalize().scale(c.playerSpeed);
      this.player.body.setVelocity(direction.x, direction.y);
    } else if (held && gap > c.pointerStopDistance) {
      this.physics.moveTo(this.player, pointer.x, pointer.y, c.playerSpeed);
    } else {
      this.player.body.setVelocity(0, 0);
    }
    this.steerChaser(delta);
    this.checkComboLapse();
    this.updateMagnet();
    this.updatePlayer2();
    this.glow.setPosition(this.player.x, this.player.y);
    // body.center already holds this frame's position; player.x only catches up after update().
    const shielded = this.shieldOwner !== null && this.isShielded(this.shieldOwner);
    if (shielded) this.shieldRing.setPosition(this.shieldOwner.body.center.x, this.shieldOwner.body.center.y);
    this.shieldRing.setVisible(shielded);
    this.drawHud();
    if (this.secondsLeft() === 0) {
      this.sounds.timeUp();
      this.finish('Time is up!');
    }
  }

  finish(reason) {
    if (this.finished) return;
    this.finished = true;
    this.frozenAt = this.time.now;
    this.physics.pause();
    // No more shield pickups once the round is over; R restarts the scene with fresh timers.
    this.shieldTimer.remove(false);
    if (this.shieldExpiry) this.shieldExpiry.remove(false);
    this.clearShield();
    this.magnetUntil = 0;
    const newBest = this.score > this.best;
    if (newBest) {
      this.best = this.score;
      this.saveBest(this.best);
    }
    this.drawHud();
    const bestLine = newBest ? 'New best!' : `Best: ${this.best}`;
    const p2Text = this.player2Played ? `, P2: ${this.score2}` : '';
    const c = COIN_DASH;
    this.add.rectangle(c.width / 2, c.height / 2, 460, 190, c.colors.panel, 0.95).setStrokeStyle(2, c.colors.player);
    this.add.text(c.width / 2, c.height / 2,
      `${reason}\n${this.score} points scored${p2Text}\n${bestLine}\nPress R or tap to try again`,
      { font: '24px monospace', color: c.colors.text, align: 'center', lineSpacing: 12 }
    ).setOrigin(0.5);
  }
}
window.coinDashGame = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: COIN_DASH.width,
  height: COIN_DASH.height,
  backgroundColor: COIN_DASH.colors.background,
  physics: { default: 'arcade', arcade: { debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
  scene: CoinDash
});
