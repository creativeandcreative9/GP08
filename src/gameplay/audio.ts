/** Small original Web Audio score and ambience; no external audio files or autoplay. */
export class TownAudio {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private enabled = false;
  private volume = .4;
  private next = 0;
  private stepAt = 0;
  private phrase = 0;
  async configure(enabled: boolean, volume: number): Promise<void> {
    this.enabled = enabled; this.volume = volume;
    if (!enabled) { if (this.context?.state === 'running') await this.context.suspend(); return; }
    try {
      if (!this.context) {
        this.context = new AudioContext(); this.gain = this.context.createGain(); this.gain.connect(this.context.destination);
      }
      this.gain!.gain.value = volume * .18;
      if (this.context.state === 'suspended') await this.context.resume();
    } catch { this.enabled = false; }
  }
  private note(f: number, start: number, length: number, level: number, type: OscillatorType = 'sine'): void {
    const c = this.context, master = this.gain;
    if (!c || !master) return;
    const osc = c.createOscillator(), envelope = c.createGain();
    osc.type = type; osc.frequency.setValueAtTime(f, start);
    envelope.gain.setValueAtTime(0, start); envelope.gain.linearRampToValueAtTime(level, start + .015);
    envelope.gain.exponentialRampToValueAtTime(.0001, start + length);
    osc.connect(envelope); envelope.connect(master); osc.start(start); osc.stop(start + length + .02);
    osc.onended = () => { osc.disconnect(); envelope.disconnect(); };
  }
  update(speed: number, nearSea: boolean, rain: boolean, night: boolean, nearRail = false): void {
    const c = this.context;
    if (!this.enabled || !c || c.state !== 'running' || document.hidden || this.volume === 0) return;
    const now = c.currentTime;
    if (now >= this.next) {
      const tune = [0, 4, 7, 9, 7, 4, 2, 0, 4, 9, 12, 7, 4, 2, 0, 7];
      for (let i = 0; i < 4; i++) this.note(220 * 2 ** (tune[(this.phrase * 4 + i) % tune.length]! / 12), now + i * .55, 1.7, night ? .12 : .19);
      this.note(110 * 2 ** ((this.phrase % 4 === 2 ? 5 : 0) / 12), now, 3, .12);
      if (!night && !rain) { this.note(2200, now + 1.3, .12, .07); this.note(2700, now + 1.48, .1, .05); }
      if (nearSea || rain) {
        const count = Math.floor(c.sampleRate * 2.3), buffer = c.createBuffer(1, count, c.sampleRate), data = buffer.getChannelData(0);
        for (let i = 0; i < count; i++) data[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / count) * (rain ? .11 : .07);
        const source = c.createBufferSource(), filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = rain ? 2200 : 650;
        source.buffer = buffer; source.connect(filter); filter.connect(this.gain!); source.start(now); source.onended = () => { source.disconnect(); filter.disconnect(); };
      }
      if (nearRail && this.phrase % 8 === 0) {
        for (let i = 0; i < 6; i++) this.note(i % 2 ? 880 : 660, now + i * .35, .25, .08);
        this.note(82, now, 2.5, .12, 'triangle');
      }
      this.phrase++; this.next = now + 2.5;
    }
    if (speed > 2 && now > this.stepAt) { this.note(100 + speed, now, .06, .12, 'triangle'); this.stepAt = now + (speed > 25 ? .23 : .38); }
  }
  pause(): void { if (this.context?.state === 'running') void this.context.suspend(); }
  dispose(): void { void this.context?.close(); }
}
