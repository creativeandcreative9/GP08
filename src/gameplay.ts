import { coastS } from './town/heights';
import { walkingRoute } from './gameplay/routes';
import type { WorldXZ } from './town/layout';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { advanceClock, clockText, collect, dailyGreeting, festivalOpen, festivalReward, friendship, nextDay } from './gameplay/calendar';
import { Environment } from './gameplay/environment';
import { Interiors } from './gameplay/interiors';
import { Collectibles } from './gameplay/collectibles';
import { TownAudio } from './gameplay/audio';
import { PerformanceCheck } from './gameplay/performance';
import { touchControls } from './player/touch';
import type { GameScene } from './scene';
import type { Player } from './player/player';
import { acceptErrand, buy, cancelErrand, consume, deliverErrand, greet, newProgress, parseProgress, SAVE_KEY, type ItemId, type Progress } from './gameplay/state';
import { errandFor } from './gameplay/errands';
import { inReach, restorePosition, shopContacts, type Contact } from './gameplay/world';
import { GameUI } from './gameplay/ui';
import { mapPlaces, navigationText, type MapPlace } from './gameplay/map';
import { canRest, restPlaces, type RestPlace } from './gameplay/rest';

/** Coordinates proximity, the local economy, dialog controls and browser-local persistence. */
export class Gameplay {
  readonly ui: GameUI;
  private readonly progress: Progress;
  private readonly shops: Contact[];
  private readonly places: MapPlace[];
  private readonly benches: RestPlace[];
  readonly interiors: Interiors;
  private readonly environment: Environment;
  private readonly collectibles: Collectibles;
  private readonly audio = new TownAudio();
  private readonly performanceCheck: PerformanceCheck;
  private readonly home: Contact | undefined;
  private readonly festival: Contact = { id: 'festival', name: '桜まつり案内所', x: 0, z: 250, y: 0, kind: 'event', line: '' };
  private route: WorldXZ[] = [];
  private destination: MapPlace | undefined;
  private storageBlocked = false;
  private lastCheck = 0;
  private lastSave = performance.now();

  constructor(private readonly game: GameScene, private readonly player: Player, canvas: HTMLCanvasElement) {
    let loaded: Progress | null = null;
    let message = 'ようこそ。近くの住人に E キーで話しかけてみよう。';
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      loaded = parseProgress(raw);
      if (raw && !loaded) message = 'セーブを読み込めなかったため、新しく街歩きを始めます。';
      else if (loaded) message = 'おかえりなさい。前回の街歩きから再開しました。';
    } catch { this.storageBlocked = true; }
    this.progress = loaded ?? newProgress();
    const position = restorePosition(game.town, this.progress.position);
    this.player.position.set(position.x, game.town.heightAt(position.x, position.z), position.z);
    this.shops = shopContacts(game.town);
    this.places = mapPlaces(game.town, this.shops);
    this.benches = restPlaces(game.town);
    const home = game.town.home;
    this.home = home ? { id: 'home', name: '自宅', x: home.x, z: home.z, y: game.town.heightAt(home.x, home.z), kind: 'home', line: 'おかえりなさい。家で眠ると翌朝になります。' } : undefined;
    if (this.home) this.places.push({ ...this.home, kind: 'landmark' });
    this.interiors = new Interiors(game, player);
    this.environment = new Environment(game);
    this.collectibles = new Collectibles(game);
    const booth = MeshBuilder.CreateBox('festival-booth', { width: 20, height: 12, depth: 10 }, game.scene);
    booth.position.set(0, 6, 264);
    const cloth = new StandardMaterial('festival-cloth', game.scene); cloth.diffuseColor = Color3.FromHexString('#e2a3b4'); booth.material = cloth;
    const roof = MeshBuilder.CreateCylinder('festival-roof', { diameterTop: 0, diameterBottom: 31, height: 9, tessellation: 4 }, game.scene);
    roof.position.set(0, 16.5, 264); roof.rotation.y = Math.PI / 4; roof.material = cloth;
    const removeTouch = touchControls(player);
    const unlockSound = (): void => { if (this.progress.life.sound) void this.audio.configure(true, this.progress.life.volume); };
    window.addEventListener('pointerdown', unlockSound, { once: true });
    window.addEventListener('keydown', unlockSound, { once: true });
    const active = this.progress.errand ? errandFor(this.progress.errand.resident) : undefined;
    this.destination = this.places.find(s => s.id === (active?.shop ?? 'e-wagashi'));
    this.ui = new GameUI({
      interact: () => this.interact(), inventory: () => this.inventory(),
      journal: () => this.journal(),
      guide: () => this.ui.guide(this.shops, shop => { this.destination = this.places.find(p => p.id === shop.id); this.route = []; this.updateNearby(); }),
      map: () => this.map(),
      life: () => this.lifeBook(), settings: () => this.settings(),
      save: () => { this.save(); },
      modal: open => {
        this.performanceCheck?.pause();
        player.setControlsEnabled(!open);
        if (open) game.camera.detachControl();
        else { game.camera.attachControl(canvas, true); game.life?.talkTo(null); }
      },
    });
    this.performanceCheck = new PerformanceCheck(() => {
      const engine = game.scene.getEngine(), gfx = new URLSearchParams(location.search).get('gfx');
      return { quality: game.rendering.quality, mode: gfx === 'high' || gfx === 'low' ? gfx : 'auto',
        renderSize: [engine.getRenderWidth(), engine.getRenderHeight()], scaling: engine.getHardwareScalingLevel() };
    }, text => this.ui.message(text), () => this.ui.dialog.close());
    const performanceObserver = game.scene.onAfterRenderObservable.add(() =>
      this.performanceCheck.frame(performance.now(), !document.hidden && !this.ui.dialog.open));
    this.ui.update(this.progress);
    this.ui.message(this.storageBlocked ? 'ブラウザの保存機能を利用できません。このタブを閉じると進行が失われます。' : message);
    this.ui.saved(this.storageBlocked ? '保存できません' : loaded ? '保存データを再開' : '自動保存待ち');
    this.updateNearby();
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('pagehide', this.saveOnLeave);
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('storage', this.storageChanged);
    const observer = game.scene.onBeforeRenderObservable.add(() => {
      const now = performance.now();
      if (!document.hidden && !this.ui.dialog.open) advanceClock(this.progress.life, Math.min(2, game.scene.getEngine().getDeltaTime() / 1000));
      this.environment.update(this.progress.life, this.interiors.indoor);
      this.collectibles.update(this.progress.life, this.interiors.indoor);
      game.life?.setTime(this.progress.life.minute);
      const festival = festivalOpen(this.progress.life) && !this.interiors.indoor;
      booth.setEnabled(festival); roof.setEnabled(festival);
      this.audio.update(this.player.currentSpeed, this.player.position.z > 1500 && !this.interiors.indoor, this.progress.life.weather === 'rain' && !this.interiors.indoor, this.progress.life.minute < 360 || this.progress.life.minute >= 1200, !this.interiors.indoor && Math.abs(this.player.position.z - 780) < 180);
      if (now - this.lastCheck >= 150) { this.lastCheck = now; this.updateNearby(); }
      if (now - this.lastSave >= 5000) this.save();
    });
    game.scene.onDisposeObservable.addOnce(() => {
      this.save();
      game.scene.onBeforeRenderObservable.remove(observer);
      window.removeEventListener('keydown', this.keydown);
      window.removeEventListener('pagehide', this.saveOnLeave);
      document.removeEventListener('visibilitychange', this.visibility);
      window.removeEventListener('storage', this.storageChanged);
      window.removeEventListener('pointerdown', unlockSound); window.removeEventListener('keydown', unlockSound);
      game.scene.onAfterRenderObservable.remove(performanceObserver); this.performanceCheck.dispose();
      removeTouch(); this.audio.dispose();
      this.ui.dispose();
    });
  }

  /** Read-only contact positions also let browser tests approach real residents and shop doors. */
  contacts(): Contact[] { return [...this.shops, ...(this.game.life?.contacts() ?? []), ...(this.home ? [this.home] : []), ...(festivalOpen(this.progress.life) ? [this.festival] : [])]; }
  snapshot(): Progress { return JSON.parse(JSON.stringify(this.progress)) as Progress; }
  restSpots(): readonly RestPlace[] { return this.benches; }

  private closest(): Contact | undefined {
    const p = this.player.position;
    return this.contacts().filter(c => inReach(p, c, this.game.town.obstacles))
      .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
  }

  private updateNearby(): void {
    this.ui.time(clockText(this.progress.life));
    if (this.interiors.indoor) {
      const action = this.interiors.action;
      this.ui.resting(this.player.resting?.name);
      if (this.player.resting) return;
      this.ui.promptText(action === 'exit' ? '外へ出る [E]' : action === 'sleep' ? '眠って翌朝へ [E]' : action === 'shop' ? 'カウンターで買い物 [E]' : action === 'seat' ? '店内の椅子に座る [E]' : '室内を歩こう · 出口は玄関側 [E]', !!action);
      this.ui.navigate(`${this.interiors.current!.name}の中 · WASD / スティックで移動`);
      return;
    }
    const pickup = this.nearbyPickup();
    const contact = this.closest();
    const bench = this.closestBench(contact);
    this.ui.resting(this.player.resting?.name);
    if (!this.player.resting) this.ui.nearby(bench ? undefined : contact, bench?.name);
    if (!this.player.resting && pickup) this.ui.promptText(`${pickup.name}を拾う [E]`);
    else if (!this.player.resting && !bench && contact?.id === 'home') this.ui.promptText('自宅に入る [E]');
    else if (!this.player.resting && !bench && contact?.id === 'festival') this.ui.promptText('桜まつりの受付 [E]');
    const target = this.destination;
    while (this.route.length > 1 && Math.hypot(this.player.position.x - this.route[0]!.x, this.player.position.z - this.route[0]!.z) < 20) this.route.shift();
    if (!target) return;
    const next = this.route[0];
    const base = navigationText(this.player.position, target, this.game.town);
    if (next && !base.includes('到着')) {
      const dx = next.x - this.player.position.x, dz = next.z - this.player.position.z;
      const direction = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'][((Math.round(Math.atan2(dx, dz) / (Math.PI / 4)) % 8) + 8) % 8];
      this.ui.navigate(`${base} · 経路：次の角は${direction}へ約${Math.round(Math.hypot(dx, dz) * .08)}m`);
    } else this.ui.navigate(base);
  }

  private nearbyPickup(): Contact | undefined {
    const p = this.player.position;
    return this.collectibles.contacts(this.progress.life).find(c => Math.hypot(p.x - c.x, p.z - c.z) < 12 && inReach(p, c, this.game.town.obstacles));
  }

  private closestBench(contact?: Contact): RestPlace | undefined {
    const p = this.player.position, people = this.contacts();
    const bench = this.benches.filter(b => canRest(p, b, people, this.game.town.obstacles))
      .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    if (bench && (!contact || Math.hypot(bench.x - p.x, bench.z - p.z) < Math.hypot(contact.x - p.x, contact.z - p.z))) return bench;
    return undefined;
  }

  private standUp(): void {
    this.player.standUp();
    this.ui.message('ひと休みできました。また街を歩いてみよう。');
    this.updateNearby();
    this.save();
  }

  private changed(message: string): void {
    this.ui.update(this.progress);
    if (message) this.ui.message(message);
    this.save();
  }

  interact(): void {
    if (this.ui.dialog.open) return;
    if (this.player.resting) { this.standUp(); return; }
    if (this.interiors.indoor) {
      const action = this.interiors.action;
      if (action === 'exit') { this.interiors.leave(); this.updateNearby(); this.save(); }
      else if (action === 'sleep') {
        this.ui.page('おやすみなさい'); this.ui.addText('眠ると翌日の朝8時になります。おつかいと持ち物はそのまま続きます。');
        this.ui.addAction('眠って翌朝を迎える', () => { nextDay(this.progress.life); this.changed('おはようございます。新しい一日が始まりました。'); this.ui.dialog.close(); this.updateNearby(); });
      } else if (action === 'shop') this.openShop(this.interiors.current!);
      else if (action === 'seat' && this.interiors.rest) { this.player.sit(this.interiors.rest); this.ui.message('店内でひと休み。Iからおやつを楽しめます。Eで立ち上がります。'); this.updateNearby(); this.save(); }
      return;
    }
    const pickup = this.nearbyPickup();
    if (pickup) { const result = collect(this.progress.life, pickup.id); this.changed(result.message); this.updateNearby(); return; }
    const contact = this.closest();
    const bench = this.closestBench(contact);
    if (bench) {
      this.player.sit(bench);
      this.ui.message('桜の下で、ひと休み。持ち物のおやつを食べたり、カメラで景色を眺めたりできます。');
      this.updateNearby();
      this.save();
      return;
    }
    if (!contact) { this.ui.message('もう少し近づいて話しかけてみよう。'); return; }
    if (contact.id === 'home') { this.interiors.enter(contact); this.updateNearby(); return; }
    if (contact.id === 'festival') { this.lifeBook(true); return; }
    if (contact.kind === 'shop') {
      this.openShop(contact);
    } else {
      const again = this.progress.greeted.includes(contact.id);
      const result = greet(this.progress, contact.id);
      this.ui.conversation(contact, again, result.message, this.progress, () => {
        const current = this.game.life?.contacts().find(c => c.id === contact.id);
        if (!current || !inReach(this.player.position, current, this.game.town.obstacles)) return { ok: false, message: '住人から離れています。一度閉じて、もう一度話しかけてください。' };
        const offer = errandFor(contact.id);
        const destination = this.places.find(s => s.id === offer?.shop);
        if (!destination) return { ok: false, message: '今は配達先を案内できません。別の住人に話しかけてください。' };
        const accepted = acceptErrand(this.progress, contact.id);
        if (accepted.ok) { this.destination = destination; this.route = []; this.changed(accepted.message); this.updateNearby(); }
        return accepted;
      });
      this.ui.addText(dailyGreeting(this.progress.life, contact.id));
      this.ui.addAction('街の暮らしについて聞く', () => this.ui.addText(this.progress.life.minute >= 1080
        ? 'もう夕方ですね。夜は家で休みます。自宅へは地図から案内できますよ。'
        : this.progress.life.weather === 'rain' ? '雨の日の散歩も好き。お店に入れば、雨宿りできますよ。'
        : '公園の花びらを3枚集めて、住人3人にあいさつすると、桜まつりで記念品をもらえます。1・4・7…日目の9時〜21時です。'));
      if ((this.progress.life.relations[contact.id]?.points ?? 0) >= 8) this.ui.addAction('お気に入りの場所を聞く', () => this.ui.addText('実は、山頂から見える海がいちばん好きです。今度、展望台まで散歩してみてね。'));
      this.game.life?.talkTo(contact.id);
      this.changed(result.message);
    }
  }

  private openShop(contact: Contact): void {
    const near = (): boolean => this.interiors.current?.id === contact.id
      ? this.interiors.action === 'shop' : !this.interiors.indoor && inReach(this.player.position, contact, this.game.town.obstacles);
    this.ui.shop(contact, this.progress, id => {
      if (!near()) return { ok: false, message: this.interiors.indoor ? 'カウンターから離れています。もう少し近づいてください。' : '店先から離れています。一度閉じて、お店に近づいてください。' };
      const result = buy(this.progress, id, contact.id);
      if (result.ok) this.changed(result.message);
      return result;
    }, () => {
      if (!near()) return { ok: false, message: '店先から離れています。一度閉じて、お店に近づいてください。' };
      const result = deliverErrand(this.progress, contact.id);
      if (result.ok) this.changed(result.message);
      return result;
    });
    if (!this.interiors.indoor) this.ui.addAction('お店の中に入る', () => {
      if (!near()) { this.ui.message('店先まで近づいてください。'); return; }
      this.ui.dialog.close(); this.interiors.enter(contact); this.updateNearby(); this.save();
    });
  }

  lifeBook(atFestival = false): void {
    this.ui.page('暮らしの手帳');
    this.ui.addText(clockText(this.progress.life));
    this.ui.addText(this.progress.rewarded ? 'はじめての街歩き 達成！' : `はじめての街歩き：あいさつ ${this.progress.greeted.length ? '✓' : '○'} · 三色だんごを買う ${this.progress.boughtDango ? '✓' : '○'} · 持ち物から食べる ${this.progress.ateDango ? '✓' : '○'}。達成のお祝いは500円です。`);
    this.ui.addText(`収集品：桜の花びら ${this.progress.life.petals}枚 · 貝がら ${this.progress.life.shells}個。公園と海辺で探してみよう。毎日また拾えます。`);
    const today = Object.values(this.progress.life.relations).filter(r => r.greetedDay === this.progress.life.day).length;
    this.ui.addText(`桜まつり：1・4・7…日目の9〜21時、公園のピンクの受付。花びら3枚と今日のあいさつ3人で600円と緑茶をもらえます。今日のあいさつ：${today}人。`);
    if (atFestival) this.ui.addAction('花びらを渡して記念品を受け取る', () => {
      if (!inReach(this.player.position, this.festival, this.game.town.obstacles)) { this.ui.message('まつりの受付まで近づいてください。'); return; }
      const result = festivalReward(this.progress); this.changed(result.message); this.ui.addText(result.message);
    });
    for (const id of Object.keys(this.progress.life.relations).sort((a, b) => this.progress.life.relations[b]!.points - this.progress.life.relations[a]!.points).slice(0, 12)) this.ui.addText(`${this.contacts().find(c => c.id === id)?.name ?? id} · ${friendship(this.progress.life, id)}`);
    this.ui.addText('操作：WASD / 矢印で移動、Shiftで走る、マウスや右側のスワイプでカメラ。Eで話す・拾う・座る・出入り。I：持ち物、J：依頼帳、M：地図。タッチ端末は左下のスティックで移動します。');
  }

  settings(): void {
    const body = this.ui.page('設定とセーブ');
    this.ui.addText('開いている間は時計と移動が止まります。保存先はこの端末のブラウザです。');
    this.ui.addAction('依頼帳を開く', () => this.journal());
    this.ui.addAction('暮らしの手帳を開く', () => this.lifeBook());
    this.ui.addAction('お店案内を開く', () => this.ui.guide(this.shops, shop => { this.destination = this.places.find(p => p.id === shop.id); this.route = []; this.updateNearby(); }));
    this.ui.addAction('今の進行を保存', () => { if (this.save()) this.ui.message('保存しました。'); });
    this.ui.addAction(this.progress.life.sound ? '音をオフにする' : '音をオンにする（BGM・環境音・足音）', () => {
      this.progress.life.sound = !this.progress.life.sound;
      void this.audio.configure(this.progress.life.sound, this.progress.life.volume);
      this.changed(this.progress.life.sound ? '音をオンにしました。' : '音をオフにしました。'); this.settings();
    });
    const label = document.createElement('label'); label.textContent = '音量 ';
    const volume = document.createElement('input'); volume.type = 'range'; volume.min = '0'; volume.max = '1'; volume.step = '.05'; volume.value = String(this.progress.life.volume);
    volume.addEventListener('input', () => { this.progress.life.volume = Number(volume.value); void this.audio.configure(this.progress.life.sound, this.progress.life.volume); this.save(); });
    label.append(volume); body.append(label);
    this.ui.addAction('画質：自動調整で再開', () => { if (!this.save()) return; const url = new URL(location.href); url.searchParams.delete('gfx'); location.assign(url); });
    for (const quality of ['low', 'high']) this.ui.addAction(`画質：${quality === 'low' ? '軽量' : '高画質'}で再開`, () => { if (!this.save()) return; const url = new URL(location.href); url.searchParams.set('gfx', quality); location.assign(url); });
    this.performanceCheck.settings(body);
    for (const slot of [1, 2, 3]) {
      let saved: Progress | null = null;
      try { saved = parseProgress(localStorage.getItem(`${SAVE_KEY}.slot${slot}`)); } catch { /* Saving reports the storage failure. */ }
      this.ui.addText(`記録${slot}：${saved ? `${saved.life.day}日目 · ${saved.money}円` : '空き'}`);
      this.ui.addAction(`記録${slot}に保存`, () => {
        if (!this.save()) return;
        try { localStorage.setItem(`${SAVE_KEY}.slot${slot}`, JSON.stringify(this.progress)); this.ui.message(`記録${slot}に保存しました。`); this.settings(); }
        catch { this.ui.message('記録の保存に失敗しました。'); }
      });
      if (saved) this.ui.addAction(`記録${slot}を読み込む`, () => {
        this.ui.page(`記録${slot}を再開しますか？`); this.ui.addText('現在の自動保存をこの記録で置き換えます。今の進行を残したい場合は、先に別の記録へ保存してください。');
        this.ui.addAction('この記録を読み込む', () => {
          try { this.storageBlocked = true; localStorage.setItem(SAVE_KEY, JSON.stringify(saved)); location.reload(); }
          catch { this.storageBlocked = false; this.ui.message('記録を読み込めませんでした。'); }
        });
      });
    }
    this.ui.addAction('最初から始める', () => {
      this.ui.page('最初から始めますか？'); this.ui.addText('現在の自動保存を消します。記録1〜3は残ります。');
      this.ui.addAction('自動保存を消して始める', () => {
        try { this.storageBlocked = true; localStorage.removeItem(SAVE_KEY); location.reload(); }
        catch { this.storageBlocked = false; this.ui.message('セーブを消せませんでした。'); }
      });
    });
  }

  inventory(): void {
    this.ui.inventory(this.progress, (id: ItemId) => {
      const result = consume(this.progress, id);
      if (result.ok) this.changed(result.message);
      return result;
    });
  }

  journal(): void {
    this.ui.journal(this.progress, () => {
      const offer = this.progress.errand ? errandFor(this.progress.errand.resident) : undefined;
      const destination = this.places.find(s => s.id === offer?.shop);
      if (!destination) { this.ui.message('配達先が見つかりません。依頼を取りやめ、ほかの住人に相談してください。'); return; }
      this.destination = destination;
      this.route = [];
      this.updateNearby();
      this.ui.dialog.close();
    }, () => {
      const result = cancelErrand(this.progress);
      if (result.ok) this.changed(result.message);
      return result;
    });
  }

  map(): void {
    const offer = this.progress.errand ? errandFor(this.progress.errand.resident) : undefined;
    const p = this.interiors.indoor ? this.player.resumePosition : this.player.position;
    this.ui.map(p, this.places, this.destination?.id, offer?.shop, place => {
      this.destination = place;
      this.route = walkingRoute(p, place, this.game.town.obstacles, this.game.town.heightAt, (x, z) => coastS(x, z) < -8);
      this.updateNearby();
      this.ui.message(this.route.length ? `${place.name}までの経路を案内します。Mで緑の線を確認できます。` : `${place.name}へ方角で案内します。今の場所から安全な経路が見つからないため、道に出て選び直してください。`);
    }, this.route);
  }

  save(): boolean {
    this.lastSave = performance.now();
    if (this.storageBlocked) return false;
    this.progress.position = this.player.resumePosition;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.progress));
      this.ui.saved('保存済み · このブラウザ');
      return true;
    } catch {
      this.ui.saved('保存できません');
      this.ui.message('保存に失敗しました。ブラウザの空き容量と保存設定を確認してください。進行はこのタブだけに残っています。');
      return false;
    }
  }

  private readonly keydown = (event: KeyboardEvent): void => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || this.ui.dialog.open) return;
    if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select')) return;
    if (event.code === 'KeyE') { event.preventDefault(); this.interact(); }
    else if (event.code === 'KeyI') { event.preventDefault(); this.inventory(); }
    else if (event.code === 'KeyJ') { event.preventDefault(); this.journal(); }
    else if (event.code === 'KeyM') { event.preventDefault(); this.map(); }
    else if (event.code === 'Escape') { event.preventDefault(); if (this.player.resting) this.standUp(); else this.settings(); }
  };
  private readonly saveOnLeave = (): void => { this.save(); };
  private readonly visibility = (): void => {
    if (document.hidden) { this.save(); this.audio.pause(); }
    else if (this.progress.life.sound) void this.audio.configure(true, this.progress.life.volume);
  };
  private readonly storageChanged = (event: StorageEvent): void => {
    if ((event.key !== null && event.key !== SAVE_KEY) || event.storageArea !== localStorage) return;
    this.storageBlocked = true;
    this.ui.saved('別タブで変更あり');
    this.ui.message('別のタブでセーブが変更されました。上書きを防ぐため、このタブの保存を停止しました。ページを再読み込みすると続きから遊べます。');
  };
}
