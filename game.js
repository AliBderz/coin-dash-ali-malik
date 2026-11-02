/* global Phaser, COIN_DASH */
class CoinDash extends Phaser.Scene {
  constructor() { super('CoinDash'); }

  create() {
    const c = COIN_DASH;
    this.score = 0;
    this.finished = false;
    this.deadline = this.time.now + c.roundSeconds * 1000;
    this.combo = 1;
    this.lastCoinTime = -Infinity; // No previous coin, so the first coin always scores at x1.
    this.physics.world.setBounds(0, 44, c.width, c.height - 44);
    this.add.grid(c.width / 2, c.height / 2, c.width, c.height, 40, 40,
      c.colors.background, 1, 0x24334b, 0.45);
    this.hud = this.add.text(18, 12, '', { font: '18px monospace', color: '#ffffff' });
    this.player = this.add.rectangle(c.width / 2, c.height / 2, 24, 24, c.colors.player);
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);
    this.createPlayer2();
    this.coin = this.add.circle(100, 100, 9, c.colors.coin);
    this.physics.add.existing(this.coin);
    this.coin.body.setCircle(9);
    this.placeCoin();
    this.drones = this.physics.add.group();
    for (let i = 0; i < c.droneCount; i++) {
      const drone = this.add.rectangle(90 + i * 270, 100, 26, 26, c.colors.drone);
      this.drones.add(drone);
      drone.body.setCollideWorldBounds(true).setBounce(1, 1);
      const angle = (35 + i * 105) * Math.PI / 180;
      drone.body.setVelocity(Math.cos(angle) * c.droneSpeed, Math.sin(angle) * c.droneSpeed);
    }
    this.setupLevels();
    this.physics.add.overlap(this.player, this.coin, () => {
      if (this.finished) return;
      this.collectCoinScore();
      this.placeCoin();
      this.countCoin();
    });
    this.physics.add.overlap(this.player, this.drones, () => this.finish('A drone caught you!'));
    this.spawnChaser();
    this.createMagnet();
    this.setupPlayer2();
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,R');
    this.input.keyboard.on('keydown-R', () => this.scene.restart());
  }

  placeCoin() {
    const c = COIN_DASH;
    // Avoid spawning the next coin directly underneath the player.
    let x, y;
    do {
      x = Phaser.Math.Between(25, c.width - 25);
      y = Phaser.Math.Between(70, c.height - 25);
    } while (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < 60
      || this.isNearPlayer2(x, y));
    this.coin.setPosition(x, y);
    this.coin.body.reset(x, y);
  }

  setupLevels() {
    this.coinsCollected = 0;
    this.level = 1;
  }

  countCoin() {
    this.coinsCollected++;
    if (this.coinsCollected % COIN_DASH.coinsPerLevel === 0) this.levelUp();
  }

  levelUp() {
    const c = COIN_DASH;
    this.level++;
    const speed = c.droneSpeed * Math.pow(c.levelSpeedFactor, this.level - 1);
    this.drones.getChildren().forEach((drone) => {
      const velocity = drone.body.velocity.clone().setLength(speed);
      drone.body.setVelocity(velocity.x, velocity.y);
    });
    this.spawnLevelDrone(speed);
  }

  spawnLevelDrone(speed) {
    const c = COIN_DASH;
    // Keep clear of the player so a level-up is never an instant death.
    let x, y;
    do {
      x = Phaser.Math.Between(25, c.width - 25);
      y = Phaser.Math.Between(70, c.height - 25);
    } while (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < c.levelDroneSafeDistance
      || this.isNearPlayer2(x, y));
    const drone = this.add.rectangle(x, y, 26, 26, c.colors.drone);
    this.drones.add(drone);
    drone.body.setCollideWorldBounds(true).setBounce(1, 1);
    const angle = Phaser.Math.Between(0, 359) * Math.PI / 180;
    drone.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  spawnChaser() {
    const c = COIN_DASH;
    // Bottom-right corner: far from the player's centre start and the drones' top row.
    this.chaser = this.add.rectangle(c.width - 30, c.height - 30, 26, 26, c.colors.chaser);
    this.physics.add.existing(this.chaser);
    this.chaser.body.setCollideWorldBounds(true);
    this.chaserHeading = Phaser.Math.Angle.Between(this.chaser.x, this.chaser.y, this.player.x, this.player.y);
    this.physics.add.overlap(this.player, this.chaser, () => this.finish('The chaser caught you!'));
  }

  steerChaser(delta) {
    const c = COIN_DASH;
    const target = Phaser.Math.Angle.Between(this.chaser.x, this.chaser.y, this.player.x, this.player.y);
    const maxTurn = Phaser.Math.DegToRad(c.chaserTurnDegPerSec) * delta / 1000;
    this.chaserHeading = Phaser.Math.Angle.RotateTo(this.chaserHeading, target, maxTurn);
    const speed = c.droneSpeed * c.chaserSpeedFactor;
    this.chaser.body.setVelocity(Math.cos(this.chaserHeading) * speed, Math.sin(this.chaserHeading) * speed);
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

  createMagnet() {
    const c = COIN_DASH;
    this.magnetUntil = 0;
    this.nextMagnetAt = this.time.now + c.magnetIntervalMs;
    // One pickup is reused for every spawn; it stays hidden and disabled until the first is due.
    this.magnet = this.add.rectangle(0, 0, 20, 20, c.colors.magnet).setVisible(false);
    this.physics.add.existing(this.magnet);
    this.magnet.body.enable = false;
    this.physics.add.overlap(this.player, this.magnet, () => {
      if (this.finished) return;
      this.magnet.setVisible(false);
      this.magnet.body.enable = false;
      this.magnetUntil = this.time.now + c.magnetDurationMs;
    });
  }

  placeMagnet() {
    const c = COIN_DASH;
    let x, y;
    do {
      x = Phaser.Math.Between(25, c.width - 25);
      y = Phaser.Math.Between(70, c.height - 25);
    } while (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < 60);
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

  magnetHud() {
    const left = this.magnetUntil - this.time.now;
    return left > 0 ? `  Magnet: ${(Math.ceil(left / 100) / 10).toFixed(1)}s` : '';
  }

  createPlayer2() {
    const c = COIN_DASH;
    // The scene object survives R, so this also resets to one-player mode.
    this.score2 = 0;
    this.player2Active = false;
    this.player2Played = false;
    this.player2 = this.add.rectangle(c.width / 2, c.height / 2, 24, 24, c.colors.player2);
    this.physics.add.existing(this.player2);
    this.player2.body.setCollideWorldBounds(true);
    this.player2.setVisible(false);
    this.player2.body.enable = false;
  }

  setupPlayer2() {
    this.physics.add.overlap(this.player2, this.coin, () => {
      if (this.finished || !this.player2Active) return;
      this.score2++;
      this.placeCoin();
      this.countCoin(); // Levels count every coin collected, by either player.
    });
    this.physics.add.overlap(this.player2, this.drones, () => {
      if (this.player2Active) this.finish('A drone caught player 2!');
    });
    this.physics.add.overlap(this.player2, this.chaser, () => {
      if (this.player2Active) this.finish('The chaser caught player 2!');
    });
    this.keys2 = this.input.keyboard.addKeys('I,J,K,L');
    // Phaser re-emits this on browser auto-repeat, so holding 2 must not flicker.
    this.input.keyboard.on('keydown-TWO', (event) => {
      if (!event.repeat) this.togglePlayer2();
    });
  }

  togglePlayer2() {
    if (this.finished) return;
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

  isNearPlayer2(x, y) {
    return this.player2Active
      && Phaser.Math.Distance.Between(x, y, this.player2.x, this.player2.y) < 60;
  }

  updatePlayer2() {
    if (!this.player2Active) return;
    const dx = Number(this.keys2.L.isDown) - Number(this.keys2.J.isDown);
    const dy = Number(this.keys2.K.isDown) - Number(this.keys2.I.isDown);
    const direction = new Phaser.Math.Vector2(dx, dy).normalize().scale(COIN_DASH.playerSpeed);
    this.player2.body.setVelocity(direction.x, direction.y);
  }

  player2EndText() {
    return this.player2Played ? `, P2: ${this.score2}` : '';
  }

  update(time, delta) {
    if (this.finished) return;
    const dx = Number(this.cursors.right.isDown || this.keys.D.isDown)
      - Number(this.cursors.left.isDown || this.keys.A.isDown);
    const dy = Number(this.cursors.down.isDown || this.keys.S.isDown)
      - Number(this.cursors.up.isDown || this.keys.W.isDown);
    const direction = new Phaser.Math.Vector2(dx, dy).normalize().scale(COIN_DASH.playerSpeed);
    this.player.body.setVelocity(direction.x, direction.y);
    this.steerChaser(delta);
    this.checkComboLapse();
    this.updateMagnet();
    this.updatePlayer2();
    const seconds = Math.max(0, Math.ceil((this.deadline - this.time.now) / 1000));
    const p2 = this.player2Active ? `  P2: ${this.score2}` : '';
    this.hud.setText(`Score: ${this.score}  Combo: x${this.combo}  Level: ${this.level}  Time: ${seconds}s${p2}${this.magnetHud()}`);
    if (seconds === 0) this.finish('Time is up!');
  }

  finish(reason) {
    if (this.finished) return;
    this.finished = true;
    this.physics.pause();
    const c = COIN_DASH;
    this.add.rectangle(c.width / 2, c.height / 2, 460, 150, 0x0a1120, 0.95);
    this.add.text(c.width / 2, c.height / 2,
      `${reason}\n${this.score} points scored${this.player2EndText()}\nPress R to try again`,
      { font: '24px monospace', color: '#ffffff', align: 'center', lineSpacing: 12 }
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
