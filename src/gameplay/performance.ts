export interface FrameResult {
  frames: number;
  durationMs: number;
  meanFPS: number;
  medianMs: number;
  p95Ms: number;
}

/** Frame intervals, including stalls, with explicit gaps for menus and background tabs. */
export class FrameMeasurement {
  private previous: number | undefined;
  private warmed = 0;
  private elapsed = 0;
  private readonly intervals: number[] = [];
  result: FrameResult | undefined;

  constructor(private readonly durationMs = 30000, private readonly warmupMs = 3000) {}
  pause(): void { this.previous = undefined; }
  get secondsLeft(): number { return Math.ceil((this.durationMs - this.elapsed) / 1000); }
  get warming(): boolean { return this.warmed < this.warmupMs; }

  frame(now: number, active: boolean): FrameResult | undefined {
    if (this.result) return this.result;
    if (!active || !Number.isFinite(now)) { this.pause(); return; }
    const previous = this.previous;
    this.previous = now;
    if (previous === undefined || now <= previous) return;
    const interval = now - previous;
    if (this.warming) { this.warmed += interval; return; }
    this.intervals.push(interval);
    this.elapsed += interval;
    if (this.elapsed < this.durationMs) return;
    const sorted = [...this.intervals].sort((a, b) => a - b);
    this.result = {
      frames: sorted.length, durationMs: this.elapsed, meanFPS: sorted.length * 1000 / this.elapsed,
      medianMs: sorted[Math.floor(sorted.length / 2)]!,
      p95Ms: sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)]!,
    };
    return this.result;
  }
}

export interface RenderState {
  quality: 'high' | 'low';
  mode: 'auto' | 'high' | 'low';
  renderSize: [number, number];
  scaling: number;
}

interface DeviceState extends RenderState {
  viewport: [number, number];
  pixelRatio: number;
}

export interface PerformanceReport extends FrameResult {
  version: 1;
  measuredAt: string;
  build: string;
  browser: string;
  start: DeviceState;
  end: DeviceState;
}

/** Local, opt-in measurement. Results are copied only by the player's explicit action. */
export class PerformanceCheck {
  private measurement: FrameMeasurement | undefined;
  private startState: DeviceState | undefined;
  private lastNotice = '';
  private report: PerformanceReport | undefined;
  private readonly visibility = (): void => { this.measurement?.pause(); };

  constructor(private readonly readState: () => RenderState, private readonly notice: (text: string) => void,
    private readonly closeSettings: () => void) {
    document.addEventListener('visibilitychange', this.visibility);
  }

  pause(): void { this.measurement?.pause(); }

  private state(): DeviceState {
    return { ...this.readState(), viewport: [innerWidth, innerHeight], pixelRatio: devicePixelRatio };
  }

  frame(now: number, active: boolean): void {
    if (!this.measurement) return;
    const result = this.measurement.frame(now, active);
    if (result) {
      const entry = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
      this.report = { ...result, version: 1, measuredAt: new Date().toISOString(),
        build: entry ? new URL(entry.src).pathname.split('/').pop() ?? 'unknown' : 'unknown',
        browser: navigator.userAgent, start: this.startState!, end: this.state() };
      this.measurement = undefined;
      this.notice(`計測完了：平均 ${result.meanFPS.toFixed(1)} FPS。設定で結果を確認・コピーできます。`);
      return;
    }
    if (!active) return;
    const text = this.measurement.warming ? '動作の計測を準備中。そのまま街を歩いてください。'
      : `動作を計測中：残り約${this.measurement.secondsLeft}秒。いつもどおり街を歩いてください。`;
    if (text !== this.lastNotice) { this.notice(text); this.lastNotice = text; }
  }

  settings(body: HTMLElement): void {
    const section = document.createElement('section'); section.className = 'life-performance';
    const heading = document.createElement('h3'); heading.textContent = '動作の確認'; section.append(heading);
    const paragraph = (text: string): void => { const p = document.createElement('p'); p.textContent = text; section.append(p); };
    const button = (text: string, action: () => void): void => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.addEventListener('click', action); section.append(b);
    };
    paragraph('街が表示されてから1分ほど歩き、同じ道で比べてください。準備後30秒間を測ります。メニュー・背景の時間は除き、途中の重いフレームも含めます。結果はこのタブ内に残り、再読み込みで消えます。');
    button(this.measurement ? '計測を中止する' : '動作を30秒測る', () => {
      if (this.measurement) { this.measurement = undefined; this.notice('動作の計測を中止しました。'); }
      else { this.measurement = new FrameMeasurement(); this.startState = this.state(); this.lastNotice = ''; this.notice('動作の計測を準備中。そのまま街を歩いてください。'); }
      this.closeSettings();
    });
    if (this.report) {
      const report = this.report;
      const title = document.createElement('h4'); title.textContent = '直近の完了結果'; section.append(title);
      paragraph(`平均 ${report.meanFPS.toFixed(1)} FPS · 中央 ${report.medianMs.toFixed(1)} ms · 遅い側の目安（95%）${report.p95Ms.toFixed(1)} ms。${report.frames}フレーム／${(report.durationMs / 1000).toFixed(1)}秒。`);
      paragraph(`画質：${report.start.quality === 'low' ? '軽量' : '高画質'} → ${report.end.quality === 'low' ? '軽量' : '高画質'}。描画サイズ：${report.end.renderSize.join(' × ')}。カクつく場合は軽量画質で再開して比べてください。`);
      const text = document.createElement('textarea'); text.readOnly = true; text.rows = 8;
      text.setAttribute('aria-label', '動作確認の結果'); text.value = JSON.stringify(report, null, 2);
      text.style.width = '100%'; text.style.boxSizing = 'border-box'; section.append(text);
      button('結果をコピー', () => {
        const fallback = (): void => { text.focus(); text.select(); this.notice('結果欄を選択しました。端末のコピー操作を使ってください。'); };
        if (!navigator.clipboard?.writeText) { fallback(); return; }
        void navigator.clipboard.writeText(text.value).then(() => this.notice('動作確認の結果をコピーしました。'), fallback);
      });
    }
    body.append(section);
  }

  dispose(): void { this.measurement = undefined; document.removeEventListener('visibilitychange', this.visibility); }
}
