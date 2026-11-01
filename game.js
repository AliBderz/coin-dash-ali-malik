/* global Phaser, COIN_DASH */
class CoinDash extends Phaser.Scene {
  constructor() { super('CoinDash'); }

  create() {
    const c = COIN_DASH;
    this.score = 0;
    this.finished = false;
    this.paused = false;
    // Keep the best seen in this page session as a fallback when storage is unavailable.
    this.best = Math.max(this.loadBest(), this.best || 0);
    this.shieldUntil = 0; // clock time when the current shield runs out; 0 means no shield
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
    const hudStyle = { font: '18px monospace', color: c.colors.text };
    this.hud = this.add.text(18, 12, '', hudStyle);
    this.timerHud = this.add.text(c.width - 18, 12, '', hudStyle).setOrigin(1, 0);
    this.player = this.add.rectangle(c.width / 2, c.height / 2, 24, 24, c.colors.player).setStrokeStyle(2, c.colors.edge);
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);
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
    for (let i = 0; i < c.droneCount; i++) {
      const drone = this.add.rectangle(90 + i * 270, 100, 26, 26, c.colors.drone).setStrokeStyle(2, c.colors.edge, 0.8);
      this.drones.add(drone);
      drone.body.setCollideWorldBounds(true).setBounce(1, 1);
      const angle = (35 + i * 105) * Math.PI / 180;
      drone.body.setVelocity(Math.cos(angle) * c.droneSpeed, Math.sin(angle) * c.droneSpeed);
    }
    // Bubble drawn around the player while a shield is active; it follows the player in update().
    this.shieldRing = this.add.circle(this.player.x, this.player.y, 22, c.shield.color, 0.15)
      .setStrokeStyle(3, c.shield.color).setVisible(false);
    this.physics.add.overlap(this.player, this.coin, () => {
      if (this.finished) return;
      this.score++;
      this.sounds.coin();
      this.placeCoin();
    });
    this.physics.add.overlap(this.player, this.shieldPickup, () => {
      if (this.finished) return;
      this.collectShield();
    });
    this.physics.add.overlap(this.player, this.drones, (player, drone) => {
      if (this.finished) return;
      if (this.shieldLeft() > 0) { this.bounceDrone(drone); return; }
      this.sounds.crash();
      this.finish('A drone caught you!');
    });
    this.cursors = this.input.keyboard.createCursorKeys();
    // Registering R, P and ESC as keys makes their keydown events ignore key auto-repeat.
    this.keys = this.input.keyboard.addKeys('W,A,S,D,R,P,ESC');
    this.input.keyboard.on('keydown-R', () => this.scene.restart());
    this.input.keyboard.on('keydown-P', () => this.togglePause());
    this.input.keyboard.on('keydown-ESC', () => this.togglePause());
    this.input.keyboard.on('keydown-M', () => this.sounds.toggleMute());
    // Phaser only emits this for presses that started on the canvas, so page clicks do not restart.
    this.input.on('pointerdown', () => { if (this.finished) this.scene.restart(); });
    // Added last so it draws above everything else; shown only while paused.
    this.pauseOverlay = this.add.container(c.width / 2, c.height / 2, [
      this.add.rectangle(0, 0, 460, 150, c.pause.panelColor, c.pause.panelAlpha).setStrokeStyle(2, c.colors.player),
      this.add.text(0, 0, 'PAUSED\npress P to resume',
        { font: '24px monospace', color: c.colors.text, align: 'center', lineSpacing: 12 }).setOrigin(0.5)
    ]).setVisible(false);
  }

  togglePause() {
    if (this.finished) return;
    this.paused = !this.paused;
    this.pauseOverlay.setVisible(this.paused);
    this.shieldTimer.paused = this.paused;
    if (this.shieldExpiry) this.shieldExpiry.paused = this.paused;
    if (this.paused) {
      this.pausedAt = this.time.now;
      this.player.body.setVelocity(0, 0);
      this.physics.pause();
    } else {
      // Shift the deadline (and an active shield) by the time spent paused so no round time is lost.
      const pausedFor = this.time.now - this.pausedAt;
      this.deadline += pausedFor;
      if (this.shieldUntil) this.shieldUntil += pausedFor;
      this.physics.resume();
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

  drawScore(shield = 0) {
    const shieldText = shield > 0 ? `   Shield: ${shield}s` : '';
    this.hud.setText(`Coins: ${this.score}   Best: ${this.best}${shieldText}`);
  }

  freeSpot() {
    const c = COIN_DASH;
    // A random spot inside the play area, never directly underneath the player.
    let x, y;
    do {
      x = Phaser.Math.Between(25, c.width - 25);
      y = Phaser.Math.Between(70, c.height - 25);
    } while (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < 60);
    return { x, y };
  }

  placeCoin() {
    const { x, y } = this.freeSpot();
    this.coin.setPosition(x, y);
    this.coin.body.reset(x, y);
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

  collectShield() {
    this.hideShieldPickup();
    this.shieldUntil = this.time.now + COIN_DASH.shield.seconds * 1000;
    this.shieldRing.setVisible(true);
  }

  shieldLeft() {
    // Milliseconds of shield remaining; 0 when the player is not shielded.
    return Math.max(0, this.shieldUntil - this.time.now);
  }

  bounceDrone(drone) {
    // Send the drone straight away from the shielded player at its normal speed.
    const away = new Phaser.Math.Vector2(drone.x - this.player.x, drone.y - this.player.y);
    if (away.lengthSq() === 0) away.set(1, 0);
    away.normalize().scale(COIN_DASH.droneSpeed);
    drone.body.setVelocity(away.x, away.y);
  }

  update() {
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
    this.glow.setPosition(this.player.x, this.player.y);
    const seconds = Math.max(0, Math.ceil((this.deadline - this.time.now) / 1000));
    const shield = Math.ceil(this.shieldLeft() / 1000);
    // body.center already holds this frame's position; player.x only catches up after update().
    this.shieldRing.setPosition(this.player.body.center.x, this.player.body.center.y).setVisible(shield > 0);
    this.drawScore(shield);
    this.timerHud.setText(`Time: ${seconds}s`);
    if (seconds === 0) {
      this.sounds.timeUp();
      this.finish('Time is up!');
    }
  }

  finish(reason) {
    if (this.finished) return;
    this.finished = true;
    this.physics.pause();
    // No more shield pickups once the round is over; R restarts the scene with fresh timers.
    this.shieldTimer.remove(false);
    if (this.shieldExpiry) this.shieldExpiry.remove(false);
    const newBest = this.score > this.best;
    if (newBest) {
      this.best = this.score;
      this.saveBest(this.best);
      this.drawScore();
    }
    const bestLine = newBest ? 'New best!' : `Best: ${this.best}`;
    const c = COIN_DASH;
    this.add.rectangle(c.width / 2, c.height / 2, 460, 190, c.colors.panel, 0.95).setStrokeStyle(2, c.colors.player);
    this.add.text(c.width / 2, c.height / 2,
      `${reason}\n${this.score} coins collected\n${bestLine}\nPress R or tap to try again`,
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
