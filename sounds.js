/* global COIN_DASH */
// Scoring sounds synthesized with the Web Audio API: no audio files, no assets.
// Loaded before game.js; the scene only calls window.coinDashSounds.coin(), .crash(),
// .timeUp(), .reset() and .toggleMute(). Volume and base pitch come from COIN_DASH.sound;
// the mute state is shown in the #sound-state label under the game.
class CoinDashSounds {
  constructor(settings) {
    this.settings = Object.assign({ volume: 0.4, coinPitch: 660 }, settings);
    this.storageKey = 'coinDash.muted';
    this.ctx = null;
    this.master = null;
    this.streak = 0; // coins collected so far this round; each one plays a little higher
    this.muted = this.loadMuted();
    this.showState();
    // Browsers only allow audio after a user gesture, so the context is created on the first key press.
    window.addEventListener('keydown', () => this.unlock());
  }

  loadMuted() {
    try { return localStorage.getItem(this.storageKey) === 'true'; } catch (e) { return false; }
  }

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem(this.storageKey, String(this.muted)); } catch (e) { /* storage unavailable: mute still works for this page */ }
    this.showState();
    return this.muted;
  }

  // Keeps the small "Sound: on/off" label under the game in step with the mute flag.
  showState() {
    const label = document.getElementById('sound-state');
    if (label) label.textContent = `Sound: ${this.muted ? 'off' : 'on'}`;
  }

  // Creates the AudioContext on first use and resumes it if the browser suspended it.
  unlock() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!this.ctx && AudioCtx) {
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.settings.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  // Call at the start of every round so the coin pitch starts from the base again.
  reset() { this.streak = 0; }

  // One oscillator note with a quick attack and an exponential decay. Returns the oscillator
  // so callers can bend its frequency.
  note(type, freq, start, duration, peak) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + duration);
    return osc;
  }

  // Short bright blip. Each coin in a round is a semitone higher than the last, up to an octave.
  coin() {
    const step = Math.min(this.streak++, 12);
    if (this.muted || !this.ctx) return;
    const freq = this.settings.coinPitch * Math.pow(2, step / 12);
    const t = this.ctx.currentTime;
    const osc = this.note('square', freq, t, 0.15, 0.25);
    osc.frequency.setValueAtTime(freq * 1.5, t + 0.05); // hop up a fifth: the classic coin blip
  }

  // Low crunch/thud for a drone catching the player: a falling sine plus a burst of filtered noise.
  crash() {
    if (this.muted || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const thud = this.note('sine', 160, t, 0.35, 0.9);
    thud.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + 0.2);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    noise.start(t);
    noise.stop(t + 0.2);
  }

  // Two falling notes when the clock runs out, in the same key as the coin blip.
  timeUp() {
    if (this.muted || !this.ctx) return;
    const base = this.settings.coinPitch;
    const t = this.ctx.currentTime;
    this.note('triangle', base * 0.75, t, 0.2, 0.5);
    this.note('triangle', base * 0.5, t + 0.22, 0.45, 0.5);
  }
}
window.coinDashSounds = new CoinDashSounds(COIN_DASH.sound);
