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
    } while (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < 60);
    this.coin.setPosition(x, y);
    this.coin.body.reset(x, y);
  }

  setupLevels() {
    this.coinsCollected = 0;
    this.level = 1;
    // Separate from the main HUD line, right-aligned so it always fits the canvas.
    this.levelText = this.add.text(COIN_DASH.width - 18, 12, 'Level: 1',
      { font: '18px monospace', color: '#ffffff' }).setOrigin(1, 0);
  }

  countCoin() {
    this.coinsCollected++;
    if (this.coinsCollected % COIN_DASH.coinsPerLevel === 0) this.levelUp();
  }

  levelUp() {
    const c = COIN_DASH;
    this.level++;
    this.levelText.setText(`Level: ${this.level}`);
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
    } while (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < c.levelDroneSafeDistance);
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
    const seconds = Math.max(0, Math.ceil((this.deadline - this.time.now) / 1000));
    this.hud.setText(`Score: ${this.score}            Combo: x${this.combo}            Time: ${seconds}s`);
    if (seconds === 0) this.finish('Time is up!');
  }

  finish(reason) {
    if (this.finished) return;
    this.finished = true;
    this.physics.pause();
    const c = COIN_DASH;
    this.add.rectangle(c.width / 2, c.height / 2, 460, 150, 0x0a1120, 0.95);
    this.add.text(c.width / 2, c.height / 2,
      `${reason}\n${this.score} points scored\nPress R to try again`,
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
