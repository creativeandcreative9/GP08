import { coastS } from './town/heights';
import { createWalkingSegmentCheck, walkingRoute } from './gameplay/routes';
import type { WorldXZ } from './town/layout';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { advanceClock, clockText, collect, dailyGreeting, festivalOpen, festivalReward, friendship, restUntilMorning } from './gameplay/calendar';
import { Environment } from './gameplay/environment';
import { Interiors } from './gameplay/interiors';
import { Collectibles } from './gameplay/collectibles';
import { TownAudio } from './gameplay/audio';
import { PerformanceCheck } from './gameplay/performance';
import { touchControls } from './player/touch';
import type { GameScene } from './scene';
import type { Player } from './player/player';
import { acceptErrand, buy, cancelErrand, consume, deliverErrand, greet, homeMeal, newProgress, parseProgress, SAVE_KEY, type ItemId, type Progress } from './gameplay/state';
import { errandFor, residentName, validResident } from './gameplay/errands';
import { inReach, restorePosition, shopContacts, type Contact } from './gameplay/world';
import { GameUI, type JournalAction, type JournalRecord, type PostcardScene } from './gameplay/ui';
import { mapPlaces, navigationText, type MapPlace } from './gameplay/map';
import { canRest, restPlaces, type RestPlace } from './gameplay/rest';
import { Wayfinder } from './gameplay/wayfinder';
import './gameplay/wayfinder.css';
import { isEvening, nightEpisode } from './gameplay/preferences';
import { journeyCards, journeyCompletion, nextJourneySuggestion, observeJourney, residentReply, type JourneyContext } from './gameplay/journey';
import { acceptStory, completeStory, observeStory, storyCards, storyOffer, storyReunion, type StoryContext, type StoryId } from './gameplay/stories';
import { chooseExploration, explorationSuggestion, explorationThemes, observationCards, presentObservation, recordObservation, setFavorite, type ExplorationPlace } from './gameplay/exploration';
import { DiscoveryVistas } from './gameplay/discovery-vistas';
import { advanceHunger } from './gameplay/hunger';

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
  private readonly wayfinder: Wayfinder;
  private readonly vistas: DiscoveryVistas;
  private readonly walkableSegment: (from: WorldXZ, to: WorldXZ) => boolean;
  private routeOrigin: WorldXZ | undefined;
  private lastRoutePlan = -Infinity;
  private contextKey = '';
  private justSlept = false;
  private storageBlocked = false;
  private lastCheck = 0;
  private lastSave = performance.now();
  private resumeAvailable = false;
  private skipWorldTick = false;

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
    this.resumeAvailable = !!loaded && (loaded.stories.arcs.length > 0 || loaded.exploration.observations.length > 0 || loaded.exploration.active !== null);
    this.walkableSegment = createWalkingSegmentCheck(game.town.obstacles, game.town.heightAt, (x, z) => coastS(x, z) < -8);
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
    this.destination = this.places.find(s => s.id === (this.progress.preferences.destination ?? active?.shop ?? (isEvening(this.progress.life.minute) ? 'home' : 'e-wagashi')));
    this.ui = new GameUI({
      interact: () => this.interact(), inventory: () => this.inventory(),
      journal: () => this.journal(),
      guide: () => this.ui.guide(this.shops, shop => this.chooseDestination(shop.id)),
      map: () => this.map(),
      life: () => this.lifeBook(), settings: () => this.settings(),
      save: () => { this.save(); },
      modal: open => {
        if (open) this.vistas?.restore();
        this.performanceCheck?.pause();
        if (open && this.wayfinder) this.wayfinder.root.hidden = true;
        player.setControlsEnabled(!open && !this.vistas?.activeId);
        if (open) game.camera.detachControl();
        else {
          if (!this.vistas?.activeId) game.camera.attachControl(canvas, true);
          game.life?.talkTo(null);
          this.contextKey = ''; this.updateContext(); this.updateWayfinder();
        }
      },
    });
    this.wayfinder = new Wayfinder(this.ui.root);
    this.vistas = new DiscoveryVistas(game.scene, game.town, this.places, { subject: player.root,
      onActiveChange: active => {
        player.setControlsEnabled(!active && !this.ui.dialog.open);
        if (active) game.camera.detachControl();
        else if (!this.ui.dialog.open) game.camera.attachControl(canvas, true);
        this.updateWayfinder();
      } });
    this.performanceCheck = new PerformanceCheck(() => {
      const engine = game.scene.getEngine(), gfx = new URLSearchParams(location.search).get('gfx');
      return { quality: game.rendering.quality, mode: gfx === 'high' || gfx === 'low' ? gfx : 'auto',
        renderSize: [engine.getRenderWidth(), engine.getRenderHeight()], scaling: engine.getHardwareScalingLevel() };
    }, text => this.ui.message(text), () => this.ui.dialog.close());
    const performanceObserver = game.scene.onAfterRenderObservable.add(() =>
      this.performanceCheck.frame(performance.now(), !document.hidden && !this.ui.dialog.open));
    this.ui.update(this.progress);
    if (this.resumeAvailable) message = this.resumeSummary();
    this.ui.message(this.storageBlocked ? 'ブラウザの保存機能を利用できません。このタブを閉じると進行が失われます。' : message, this.storageBlocked ? 0 : 8000);
    this.ui.saved(this.storageBlocked ? '保存できません' : loaded ? '保存データを再開' : '自動保存待ち');
    this.updateNearby();
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('pagehide', this.saveOnLeave);
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('storage', this.storageChanged);
    const observer = game.scene.onBeforeRenderObservable.add(() => {
      const now = performance.now();
      if (!document.hidden && !this.ui.dialog.open && !this.vistas.activeId && !this.skipWorldTick) {
        const seconds = Math.min(2, game.scene.getEngine().getDeltaTime() / 1000);
        advanceClock(this.progress.life, seconds);
        advanceHunger(this.progress, seconds, this.player.running ? this.player.runMultiplier : 0);
      }
      if (!document.hidden) this.skipWorldTick = false;
      this.environment.update(this.progress.life, this.interiors.indoor);
      this.collectibles.update(this.progress.life, this.interiors.indoor);
      game.life?.setTime(this.progress.life.minute);
      const festival = festivalOpen(this.progress.life) && !this.interiors.indoor;
      booth.setEnabled(festival); roof.setEnabled(festival);
      this.audio.update(this.player.currentSpeed, this.player.position.z > 1500 && !this.interiors.indoor, this.progress.life.weather === 'rain' && !this.interiors.indoor, this.progress.life.minute < 360 || this.progress.life.minute >= 1200, !this.interiors.indoor && Math.abs(this.player.position.z - 780) < 180);
      if (now - this.lastCheck >= 150) { this.lastCheck = now; this.updateNearby(); }
      this.updateWayfinder();
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
      this.wayfinder.dispose(); this.ui.dispose();
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
    this.syncResidentDestination();
    this.vistas.update(this.progress.stories.arcs.filter(arc => arc.stage === 'completed').map(arc => arc.id));
    this.ui.time(clockText(this.progress.life));
    this.ui.vitals(this.progress.hunger, this.player.runMultiplier, this.player.running);
    this.ui.root.toggleAttribute('data-night', isEvening(this.progress.life.minute));
    this.recordMemories();
    this.updateContext();
    if (this.interiors.indoor) {
      this.updateWayfinder();
      const action = this.interiors.action;
      this.ui.resting(this.player.resting?.name);
      if (this.player.resting) return;
      this.ui.promptText(action === 'exit' ? '外へ出る [E]' : action === 'sleep' ? '眠って翌朝へ [E]' : action === 'shop' ? 'カウンターで買い物 [E]' : action === 'seat' ? '店内の椅子に座る [E]' : '室内を歩こう · 出口は玄関側 [E]', !!action);
      this.ui.navigate(`${this.interiors.current!.name}の中 · WASD / スティックで移動`);
      return;
    }
    this.ensureRoute();
    const pickup = this.nearbyPickup();
    const contact = this.closest();
    const bench = this.closestBench(contact);
    this.ui.resting(this.player.resting?.name);
    if (!this.player.resting) this.ui.nearby(bench ? undefined : contact, bench?.name);
    if (!this.player.resting && !contact && !bench && this.currentPlace()) this.ui.promptText('この場所の景色を見つける [E]');
    if (!this.player.resting && pickup) this.ui.promptText(`${pickup.name}を拾う [E]`);
    else if (!this.player.resting && !bench && contact?.id === 'home') this.ui.promptText('自宅に入る [E]');
    else if (!this.player.resting && !bench && contact?.id === 'festival') this.ui.promptText('桜まつりの受付 [E]');
    const target = this.destination;
    while (this.route.length > 1
      && Math.hypot(this.player.position.x - this.route[0]!.x, this.player.position.z - this.route[0]!.z) < 9
      && this.walkableSegment(this.player.position, this.route[1]!)) this.routeOrigin = this.route.shift();
    if (!target) { this.ui.navigate(validResident(this.progress.preferences.destination)
      ? `${residentName(this.progress.preferences.destination)}は今、休憩中。朝にまた会えます。物語は手帳に残っています。`
      : '行き先は地図から選べます。予定のない散歩も、自由に。'); this.updateWayfinder(); return; }
    const next = this.route[0];
    const base = navigationText(this.player.position, target, this.game.town);
    if (next && !this.arrived(target)) {
      const dx = next.x - this.player.position.x, dz = next.z - this.player.position.z;
      const direction = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'][((Math.round(Math.atan2(dx, dz) / (Math.PI / 4)) % 8) + 8) % 8];
      this.ui.navigate(`${base} · 経路：次の角は${direction}へ約${Math.round(Math.hypot(dx, dz) * .08)}m`);
    } else this.ui.navigate(!next && !this.arrived(target) ? `${base} · 道へ戻ると、安全な経路を探し直します。地図でも現在地を確認できます。` : base);
    this.updateWayfinder();
  }

  private arrived(target: MapPlace): boolean {
    const p = this.player.position;
    return target.kind === 'shop' || target.id === 'home' || validResident(target.id)
      ? inReach(p, { ...target, kind: validResident(target.id) ? 'resident' : target.id === 'home' ? 'home' : 'shop', line: '' }, this.game.town.obstacles)
      : Math.hypot(p.x - target.x, p.z - target.z) < 55 && Math.abs(p.y - target.y) < 16;
  }

  /** Plan from the real standing position; every guide entry point uses the same safe route. */
  private chooseDestination(id: string): void {
    if (validResident(id)) {
      this.progress.preferences.destination = id;
      this.destination = undefined; this.route = []; this.lastRoutePlan = -Infinity;
      this.syncResidentDestination(); this.updateNearby(); this.save(); return;
    }
    const target = this.places.find(p => p.id === id);
    if (!target) { this.ui.message('この場所はまだ案内できません。地図から別の行き先を選んでください。'); return; }
    this.destination = target; this.progress.preferences.destination = id;
    this.route = []; this.routeOrigin = undefined; this.lastRoutePlan = -Infinity;
    this.ensureRoute(true); this.updateNearby(); this.save();
  }

  /** Follow the same person as they move; a closed shop or sleeping resident never becomes a false arrival. */
  private syncResidentDestination(): void {
    const id = this.progress.preferences.destination;
    if (!validResident(id)) return;
    const resident = this.game.life?.contacts().find(contact => contact.id === id);
    if (!resident) { this.destination = undefined; this.route = []; return; }
    const endpoint = this.route.at(-1);
    const moved = !endpoint || Math.hypot(resident.x - endpoint.x, resident.z - endpoint.z) > 12;
    this.destination = { ...resident, kind: 'landmark' };
    if (moved && performance.now() - this.lastRoutePlan >= 2500) {
      this.route = []; this.routeOrigin = undefined; this.lastRoutePlan = -Infinity;
    }
  }

  private ensureRoute(force = false): void {
    if (!this.destination || this.interiors.indoor || this.player.resting || this.arrived(this.destination)) return;
    const p = this.player.position, now = performance.now();
    if (this.route[0] && !this.walkableSegment(p, this.route[0])) {
      this.route = []; this.routeOrigin = undefined;
    }
    const first = this.route[0];
    let deviation = Infinity;
    if (first && this.routeOrigin) {
      const a = this.routeOrigin, dx = first.x - a.x, dz = first.z - a.z;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      deviation = Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
    }
    const moved = !this.routeOrigin || Math.hypot(p.x - this.routeOrigin.x, p.z - this.routeOrigin.z) > 25;
    if (!force && now - this.lastRoutePlan < 2500) return;
    if (!force && (first ? deviation < 32 : !moved)) return;
    this.lastRoutePlan = now; this.routeOrigin = { x: p.x, z: p.z };
    this.route = walkingRoute({ x: p.x, z: p.z }, this.destination, this.game.town.obstacles, this.game.town.heightAt, (x, z) => coastS(x, z) < -8);
  }

  private updateWayfinder(): void {
    if (!this.wayfinder) return;
    const p = this.player.position, camera = this.game.camera;
    const forward = camera.getTarget().subtract(camera.position);
    let distance = 0, previous: WorldXZ = p;
    for (const point of this.route) { distance += Math.hypot(point.x - previous.x, point.z - previous.z); previous = point; }
    const target = this.destination;
    this.wayfinder.update({ enabled: this.progress.preferences.wayfinding, visible: !this.ui.dialog.open && !document.hidden && !this.player.resting && !this.vistas?.activeId,
      indoors: this.interiors.indoor, target, player: p, waypoint: this.route[0], cameraForward: forward,
      distanceMetres: distance * .08, arrived: !!target && this.arrived(target),
      arrivalHint: target?.id === 'home' ? '入口の操作ボタンで家へ' : validResident(target?.id) ? '操作ボタンで話しかけよう' : target?.kind === 'shop' ? '近くの操作ボタンで買い物' : 'ひと休みして景色を楽しもう',
    }, this.game.scene.getEngine().getDeltaTime() / 1000);
  }

  private journeyContext(events: Pick<JourneyContext, 'consumed' | 'sleptAtHome'> = {}): JourneyContext {
    let place: JourneyContext['place'];
    if (this.interiors.current?.id === 'home') place = 'home';
    else if (!this.interiors.indoor) {
      const p = this.player.position;
      for (const id of ['summit', 'beach', 'plaza'] as const) {
        const target = this.places.find(l => l.id === id);
        const radius = id === 'plaza' ? 240 : id === 'beach' ? 280 : 65;
        if (target && Math.hypot(p.x - target.x, p.z - target.z) < radius && Math.abs(p.y - target.y) < 20) { place = id; break; }
      }
    }
    return { life: this.progress.life, greeted: this.progress.greeted, completedErrands: this.progress.completedErrands,
      inventory: this.progress.inventory, place, resting: !!this.player.resting, ...events };
  }

  private recordMemories(events: Pick<JourneyContext, 'consumed' | 'sleptAtHome'> = {}): void {
    const result = observeJourney(this.progress.journey, this.journeyContext(events));
    if (!result.unlocked.length) return;
    this.progress.journey = result.state;
    const first = result.unlocked[0]!;
    this.ui.celebration(result.unlocked.length > 1 ? `${result.unlocked.length}つの思い出が手帳に` : first.title,
      result.unlocked.length > 1 ? 'これまでの街歩きが、暮らしの手帳に残りました。' : `${first.body} 暮らしの手帳に残しました。`);
    this.ui.update(this.progress); this.save();
  }

  private updateContext(): void {
    const life = this.progress.life, home = this.interiors.current?.id === 'home';
    const night = isEvening(life.minute);
    const suggestion = nextJourneySuggestion(this.progress.journey, this.journeyContext());
    const discovery = this.discoveryHint();
    const key = this.ui.dialog.open ? 'modal' : home ? `home-${this.justSlept}` : this.interiors.indoor ? 'inside'
      : night && this.progress.preferences.nightHintDay !== nightEpisode(life.day, life.minute) ? `night-${life.day}`
      : this.resumeAvailable ? 'resume'
      : discovery ? `discovery-${discovery}`
      : !night && this.progress.rewarded && !this.progress.errand && this.progress.preferences.destination === null ? `suggestion-${suggestion.title}` : 'quiet';
    if (key === this.contextKey) return;
    this.contextKey = key;
    if (key.startsWith('night')) this.ui.contextHint({ title: '日が暮れたら、どう過ごそう',
      body: '夜は住人も家で休みます。自宅で眠ると次の朝8時へ。持ち物やおつかいはそのまま、夜の散歩も自由です。',
      actionLabel: '自宅への帰り道を案内', onAction: () => { this.chooseDestination('home'); this.progress.preferences.nightHintDay = nightEpisode(life.day, life.minute); this.contextKey = ''; this.updateContext(); this.save(); this.ui.message(this.progress.preferences.wayfinding ? '矢印は安全な道の次の角を示します。自宅の入口で操作ボタンを押すと入れます。' : '自宅まで文字と地図で案内します。矢印は「設定」でオンにできます。入口で操作ボタンを押すと家に入れます。'); },
      secondaryLabel: '夜の散歩を続ける', onSecondary: () => { this.progress.preferences.nightHintDay = nightEpisode(life.day, life.minute); this.contextKey = ''; this.updateContext(); this.save(); this.ui.message('ゆっくりどうぞ。帰りたくなったら「暮らし」から自宅へ案内できます。'); } });
    else if (home) this.ui.contextHint({ title: this.justSlept ? '新しい朝、今日はどこへ' : 'おかえりなさい。家でひと休み',
      body: this.justSlept ? '朝ごはんを食べて、お腹も満たされました。おつかいも持ち物も、昨日の続きから。' : '左奥の布団で眠ると次の朝8時になり、朝ごはんも食べられます。今すぐ食べたいときは、無料の軽食をどうぞ。',
      actionLabel: this.justSlept ? '街へ出る' : '朝まで休む',
      onAction: () => { if (this.justSlept) { this.interiors.leave(); this.justSlept = false; this.contextKey = ''; this.updateNearby(); this.save(); } else this.sleep(); },
      secondaryLabel: '軽食を食べる（無料）', onSecondary: () => this.eatAtHome() });
    else if (key === 'resume') this.ui.contextHint({ title: 'あなたの散歩の、続きから', body: this.resumeSummary(),
      actionLabel: '続きや過ごし方を選ぶ', onAction: () => { this.resumeAvailable = false; this.resumeBook(); },
      secondaryLabel: 'そのまま歩く', onSecondary: () => { this.resumeAvailable = false; this.contextKey = ''; this.updateContext(); } });
    else if (key.startsWith('discovery')) this.ui.contextHint({ title: 'ここで、小さな発見', body: discovery!,
      actionLabel: 'この場所を見つめる', onAction: () => this.discoveryBook() });
    else if (key.startsWith('suggestion')) this.ui.contextHint({ title: suggestion.title, body: suggestion.body,
      actionLabel: suggestion.destinationId ? 'この場所へ案内' : undefined,
      onAction: suggestion.destinationId ? () => { this.chooseDestination(suggestion.destinationId!); this.ui.message('寄り道も自由です。目的地はいつでも地図から変えられます。'); } : undefined });
    else this.ui.contextHint(null);
  }

  private sleep(): void {
    if (this.interiors.current?.id !== 'home') return;
    this.ui.page('おやすみなさい');
    const today = journeyCards(this.progress.journey).filter(card => card.day === this.progress.life.day)
      .sort((a, b) => (b.minute ?? 0) - (a.minute ?? 0))[0];
    this.ui.addText(today ? `今日の思い出「${today.title}」` : '今日も一日、おつかれさま。');
    this.ui.addText(today ? today.body : '何かを達成しない日も、大切な一日。歩いた景色を思い返して、ゆっくり休もう。');
    const entries = this.depthRecords().filter(entry => entry.day === this.progress.life.day);
    if (entries.length) { this.ui.addText('今日、あなたがこの街に残した時間。'); this.ui.timeline(entries); }
    this.ui.addText(`これまでの思い出は${this.progress.journey.memories.length}つ。「暮らし」の手帳でいつでも読み返せます。`);
    this.ui.addText(`${this.progress.life.minute < 480 ? this.progress.life.day : Math.min(9999, this.progress.life.day + 1)}日目の朝8時まで休み、無料の朝ごはんで空腹度が0になります。おつかいと持ち物はそのまま続きます。`);
    this.ui.addAction('眠って翌朝を迎える', () => {
      if (this.interiors.current?.id !== 'home') return;
      restUntilMorning(this.progress.life); this.justSlept = true;
      homeMeal(this.progress);
      this.recordMemories({ sleptAtHome: true }); this.changed('おはようございます。朝ごはんでお腹を満たして、新しい一日へ。');
      this.ui.dialog.close(); this.contextKey = ''; this.updateNearby();
    });
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
    this.recordMemories();
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
      else if (action === 'sleep') this.sleep();
      else if (action === 'shop') this.openShop(this.interiors.current!);
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
    if (!contact) { if (this.currentPlace()) this.discoveryBook(); else this.ui.message('もう少し近づいて話しかけてみよう。'); return; }
    if (contact.id === 'home') { this.justSlept = false; this.interiors.enter(contact); this.updateNearby(); return; }
    if (contact.id === 'festival') { this.lifeBook(true); return; }
    if (contact.kind === 'shop') {
      this.openShop(contact);
    } else {
      const again = this.progress.greeted.includes(contact.id);
      const reply = storyReunion(this.progress.stories, contact.id, this.storyContext(contact.id)) || residentReply(contact.id, this.progress);
      const result = greet(this.progress, contact.id);
      this.ui.conversation({ ...contact, line: reply || contact.line }, again, result.message, this.progress, () => {
        const current = this.game.life?.contacts().find(c => c.id === contact.id);
        if (!current || !inReach(this.player.position, current, this.game.town.obstacles)) return { ok: false, message: '住人から離れています。一度閉じて、もう一度話しかけてください。' };
        const offer = errandFor(contact.id);
        const destination = this.places.find(s => s.id === offer?.shop);
        if (!destination) return { ok: false, message: '今は配達先を案内できません。別の住人に話しかけてください。' };
        const accepted = acceptErrand(this.progress, contact.id);
        if (accepted.ok) { this.chooseDestination(destination.id); this.changed(accepted.message); this.updateNearby(); }
        return accepted;
      });
      this.ui.addText(dailyGreeting(this.progress.life, contact.id));
      const story = storyOffer(this.progress.stories, contact.id, this.storyContext(contact.id));
      if (story) this.ui.addAction(story.stage === 'offer' ? `小さな物語を聞く：${story.title}` : `物語の続きを話す：${story.title}`, () => this.residentStory(contact.id));
      this.ui.addAction('街の暮らしについて聞く', () => this.ui.addText(this.progress.life.minute >= 1080
        ? 'もう夕方ですね。夜は家で休みます。自宅へは地図から案内できますよ。'
        : this.progress.life.weather === 'rain' ? '雨の日の散歩も好き。お店に入れば、雨宿りできますよ。'
        : '公園の花びらを3枚集めて、住人3人にあいさつすると、桜まつりで記念品をもらえます。1・4・7…日目の9時〜21時です。'));
      if ((this.progress.life.relations[contact.id]?.points ?? 0) >= 8) this.ui.addAction('お気に入りの場所を聞く', () => this.ui.addText('実は、山頂から見える海がいちばん好きです。今度、展望台まで散歩してみてね。'));
      this.game.life?.talkTo(contact.id);
      this.recordMemories();
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
    if (!atFestival) this.bookSections('今日');
    this.ui.addText(clockText(this.progress.life));
    if (!atFestival) {
      this.ui.addText('急がなくて大丈夫。あなたが過ごした時間を、7つの小さな思い出に。好きな順番で見つけられます。');
      this.ui.addText('今日は、どんな時間にしよう。人に会う、景色を探す、家で休む。途中で気が変わっても大丈夫です。');
      if (this.currentPlace()) this.ui.addAction('今いる場所の景色を手帳に残す', () => this.discoveryBook());
      const walk = explorationSuggestion(this.progress.exploration);
      if (walk) {
        this.ui.addText(`選んだ散歩：${walk.title}。${walk.body}`);
        if (walk.destinationId) this.ui.addAction('散歩の続きへ案内', () => this.guideAndClose(walk.destinationId!));
      }
      const ongoing = storyCards(this.progress.stories).find(card => card.stage !== 'completed');
      if (ongoing) this.ui.addText(`物語の続き：${ongoing.residentName}「${ongoing.title}」。${ongoing.nextStep}`);
      const guide = (id: string): void => { this.chooseDestination(id); this.ui.dialog.close(); };
      this.ui.addAction(isEvening(this.progress.life.minute) ? '公園で夜の散歩を楽しむ' : '住人に会いに公園へ', () => guide('plaza'));
      const exploredSea = this.progress.journey.memories.some(memory => memory.id === 'sea');
      this.ui.addAction(exploredSea ? '展望台で街を見渡す' : '海辺で小さな発見を探す', () => guide(exploredSea ? 'summit' : 'beach'));
      if (this.home) this.ui.addAction('自宅へ案内してもらう', () => { guide('home'); this.ui.message('自宅に入って「朝まで休む」を選ぶと次の朝8時へ。夜の散歩を続けても大丈夫です。'); });
      const next = nextJourneySuggestion(this.progress.journey, this.journeyContext());
      this.ui.addText(`迷ったら、こんな寄り道も：${next.body}`);
      this.ui.memoryAlbum(journeyCards(this.progress.journey));
      const completion = journeyCompletion(this.progress.journey);
      if (completion) this.ui.addText(`${completion.title} — ${completion.body}`);
    }
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
    this.ui.addText('走り続けると徐々に加速し、10秒で通常の走行の2倍、20秒で3倍になります。歩く・止まる・会話やメニューを開くと加速はリセット。スマホは「走る」をオンにしてスティックを動かします。');
    this.ui.addText('空腹度は0で満腹、100で空腹。時間がたつと増え、走ると早くお腹が空きます。上部の空腹度か持ち物から飲食でき、自宅では無料の軽食と朝ごはんを用意しています。空腹でも散歩や走行は続けられます。');
  }

  private bookSections(current: string): void {
    this.ui.sectionNav([
      { label: '今日', active: current === '今日', action: () => this.lifeBook() },
      { label: '人の物語', active: current === '人の物語', action: () => this.storyBook() },
      { label: '散歩', active: current === '散歩', action: () => this.explorationBook() },
      { label: '絵はがき', active: current === '絵はがき', action: () => this.postcardBook() },
      { label: '日々の記録', active: current === '日々の記録', action: () => this.recordBook() },
    ]);
  }

  private guideAndClose(id: string): void { this.chooseDestination(id); this.ui.dialog.close(); }

  /** Scene-derived location, not the selected destination or text in a saved card. */
  private currentPlace(): ExplorationPlace | undefined {
    const indoor = this.interiors.current?.id;
    if (indoor) return indoor === 'home' || indoor === 'w-cafe' ? indoor : undefined;
    const broad = this.journeyContext().place;
    if (broad && broad !== 'home') {
      const target = this.places.find(place => place.id === broad);
      if (target && this.walkableSegment(this.player.position, target)) return broad;
    }
    for (const id of ['w-cafe', 'home', 'station'] as const) {
      const target = this.places.find(place => place.id === id);
      if (target && this.arrived(target) && (id !== 'station' || this.walkableSegment(this.player.position, target))) return id;
    }
    return undefined;
  }

  private storyContext(resident?: string): StoryContext {
    const place = this.currentPlace(), life = this.progress.life;
    return { day: life.day, minute: life.minute, weather: life.weather, resident,
      place: place === 'plaza' || place === 'beach' || place === 'station' ? place : undefined,
      resting: !!this.player.resting };
  }

  private discoveryHint(): string | undefined {
    const place = this.currentPlace();
    const destination = this.progress.preferences.destination;
    if (!place || (destination !== null && destination !== place)) return undefined;
    const story = storyCards(this.progress.stories).find(card => card.stage === 'accepted' && card.destinationId === place);
    if (story) return story.nextStep;
    return explorationThemes(this.progress.exploration).find(theme => theme.selected)?.steps
      .find(step => step.place === place && !step.recorded)?.hint;
  }

  private discoveryBook(): void {
    const place = this.currentPlace();
    this.ui.page('この場所で、見つけたこと'); this.bookSections('散歩');
    if (!place) { this.ui.addText('公園や海辺、お店の入口など、気になる場所に近づいてみよう。'); return; }
    const definition = explorationThemes(this.progress.exploration).flatMap(theme => theme.steps).find(step => step.place === place)!;
    this.ui.addText(`${definition.name} — ${definition.hint}`);
    const vista = !this.interiors.indoor ? this.vistas.nearest(this.player.position) : undefined;
    if (vista) this.ui.addAction('手帳を閉じて、景色を眺める', () => {
      this.ui.dialog.addEventListener('close', () => {
        if (!this.vistas.activate(vista.id, this.player.position)) this.ui.message('眺める場所から離れました。案内の絵の近くで、もう一度どうぞ。');
      }, { once: true });
      this.ui.dialog.close();
    });
    const existing = observationCards(this.progress.exploration).find(card => card.id === place);
    if (existing) {
      const now = presentObservation(place, this.progress.life);
      if (now) this.ui.storyCard({ title: 'いま、この場所で', person: definition.name, body: now.body, step: clockText(this.progress.life) });
      this.appendPostcard(existing);
    }
    else this.ui.addAction('景色を手帳に残す', () => {
      if (this.currentPlace() !== place) { this.ui.addText('その場所から離れました。近づいてからもう一度、景色を見つめてみよう。'); return; }
      const result = recordObservation(this.progress.exploration, { ...this.progress.life, place });
      if (!result.ok) { this.ui.addText(result.message); return; }
      this.progress.exploration = result.state; this.changed(result.message);
      this.discoveryBook();
      for (const theme of result.completedThemes) this.ui.storyCard({ title: `${theme.title}を歩き終えて`, person: 'あなたの散歩', body: theme.ending!, step: 'ひとつの道のり', completed: true });
      if (result.completedThemes.length) this.ui.celebration('ひとつの散歩が、思い出に', result.completedThemes[0]!.ending!);
    });
    for (const card of storyCards(this.progress.stories).filter(card => card.stage === 'accepted' && card.destinationId === place)) {
      this.ui.storyCard({ id: card.id, title: card.title, person: card.residentName, body: card.nextStep, step: 2, choice: card.choiceLabel }, [
        { label: card.actionLabel ?? 'ここで確かめてみる', primary: true, action: () => this.observeResidentStory(card.id) },
      ]);
    }
  }

  private observeResidentStory(id: StoryId): void {
    const result = observeStory(this.progress.stories, id, this.storyContext());
    if (!result.ok) { this.ui.addText(result.message); return; }
    this.progress.stories = result.state; this.changed(result.message); this.storyBook();
  }

  private residentStory(id: string, ending?: string): void {
    const current = this.game.life?.contacts().find(contact => contact.id === id);
    if (this.interiors.indoor || !current || !inReach(this.player.position, current, this.game.town.obstacles)) {
      this.ui.message('本人のそばで、物語の続きを話してみよう。'); return;
    }
    const offer = storyOffer(this.progress.stories, id, this.storyContext(id));
    if (!offer) return;
    this.ui.page(offer.title);
    const actions: JournalAction[] = offer.choices.map(choice => ({ label: choice.label, primary: true, action: () => {
      if (!this.game.life?.contacts().some(contact => contact.id === id && inReach(this.player.position, contact, this.game.town.obstacles))) {
        this.ui.addText('話し相手から離れています。そばでもう一度話そう。'); return;
      }
      const result = acceptStory(this.progress.stories, id, choice.id, this.storyContext(id));
      if (!result.ok) { this.ui.addText(result.message); return; }
      this.progress.stories = result.state; this.changed(result.message); this.residentStory(id);
      this.vistas.update(this.progress.stories.arcs.filter(arc => arc.stage === 'completed').map(arc => arc.id));
    } }));
    if (offer.stage === 'observed') actions.push({ label: '見つけたことを伝える', primary: true, action: () => {
      const resident = this.game.life?.contacts().find(contact => contact.id === id);
      if (this.interiors.indoor || !resident || !inReach(this.player.position, resident, this.game.town.obstacles)) {
        this.ui.addText('話し相手から離れています。そばでもう一度話そう。'); return;
      }
      const result = completeStory(this.progress.stories, id, this.storyContext(id));
      if (!result.ok) { this.ui.addText(result.message); return; }
      this.progress.stories = result.state; this.changed('見つけたことを伝えました。相手からの言葉を、手帳に残しました。'); this.residentStory(id, result.message);
      this.ui.celebration('言葉が、誰かに届いた', `${residentName(id)}との物語が、暮らしの手帳に残りました。`);
    } });
    const card = storyCards(this.progress.stories).find(card => card.residentId === id);
    if (card?.destinationId) actions.push({ label: '物語の場所へ案内', action: () => this.guideAndClose(card.destinationId!) });
    this.ui.storyCard({ id: offer.id, title: offer.title, person: `${offer.residentName} · ${offer.portraitLine}`,
      body: ending ?? offer.body, step: offer.stage === 'offer' ? 'はじめまして' : offer.stage === 'accepted' ? '散歩の約束' : offer.stage === 'observed' ? '見つけたこと' : 'その後のふたり',
      choice: card?.choiceLabel, completed: offer.stage === 'completed' }, actions);
    if (offer.choices.length) for (const choice of offer.choices) this.ui.addText(`${choice.label}：${choice.description}`);
    this.ui.addAction(offer.stage === 'offer' ? '今は聞くだけにする' : 'また、あとで話そう', () => this.ui.dialog.close());
    this.ui.addAction('物語を手帳で読む', () => this.storyBook());
  }

  private storyBook(): void {
    this.ui.page('人の物語'); this.bookSections('人の物語');
    this.ui.addText('桜の木陰、海への憧れ、駅の音。この街で出会う人には、それぞれ気になっていることがあります。話しかけて、小さな物語を聞いてみよう。期限も、正解の選択もありません。');
    const cards = storyCards(this.progress.stories);
    if (!cards.length) this.ui.addAction('住人に会いに、公園へ', () => this.guideAndClose('plaza'));
    for (const card of cards) {
      const actions: JournalAction[] = [];
      if (card.stage !== 'completed') {
        actions.push({ label: card.stage === 'observed' ? `${card.residentName}に会いに行く` : '物語の場所へ案内', action: () => this.guideAndClose(card.destinationId ?? card.residentId), primary: true });
        if (card.stage === 'accepted' && this.currentPlace() === card.destinationId) actions.push({ label: card.actionLabel ?? 'ここで確かめる', action: () => this.observeResidentStory(card.id) });
      } else actions.push({ label: `${card.residentName}をまた訪ねる`, action: () => this.guideAndClose(card.residentId) });
      const arc = this.progress.stories.arcs.find(arc => arc.id === card.id)!;
      this.ui.storyCard({ id: card.id, title: card.title, person: card.residentName,
        body: [card.observation ?? card.body, ...(card.ending ? [card.ending] : []), card.nextStep, `${arc.acceptedDay}日目に出会った物語${arc.completedDay ? ` · ${arc.completedDay}日目に伝えた言葉` : ''}`],
        step: card.stage === 'completed' ? 3 : card.stage === 'observed' ? 2 : 1, totalSteps: 3, choice: card.choiceLabel, completed: card.stage === 'completed' }, actions);
    }
    if (cards.length === 3 && cards.every(card => card.stage === 'completed')) {
      this.ui.addText(`桜の街の、三つの声。${cards.map(card => `${card.residentName}と「${card.choiceLabel}」`).join('、')}。同じ街を歩いても、あなたが選んだ言葉が、ここに残りました。また会っても、もう最初の挨拶だけではありません。`);
      this.ui.addAction('今度は、自分の好きな散歩へ', () => this.explorationBook());
    }
  }

  private explorationBook(): void {
    this.ui.page('気分で選ぶ、街の散歩'); this.bookSections('散歩');
    this.ui.addText('好きな順で、景色を三つ。場所に着いたら「この場所を見つめる」から手帳に残そう。途中で変えても、発見した景色はなくなりません。');
    const themes = explorationThemes(this.progress.exploration);
    this.ui.themeCards(themes.map(theme => ({ id: theme.id, title: theme.title, body: theme.body,
      detail: `${theme.progress} / ${theme.total}の景色${theme.complete ? ' · 歩き終えました' : ''}`, selected: theme.selected,
      scene: theme.id === 'horizon' ? 'sea' : theme.id === 'lights' ? 'home' : 'park',
      action: () => { this.progress.exploration = chooseExploration(this.progress.exploration, theme.id); this.changed(`「${theme.title}」を選びました。`); this.explorationBook(); } })));
    const selected = themes.find(theme => theme.selected);
    if (selected) {
      this.ui.addText(selected.ending ?? '次に行く場所も、自分で選べます。');
      for (const step of selected.steps) {
        this.ui.addText(`${step.recorded ? '見つけた景色' : 'これからの発見'}：${step.name}。${step.hint}`);
        this.ui.addAction(`${step.name}へ${step.recorded ? 'また訪ねる' : '案内'}`, () => this.guideAndClose(step.destinationId));
      }
    }
    if (this.currentPlace()) this.ui.addAction('今いる場所を見つめる', () => this.discoveryBook());
    this.ui.addAction('テーマを休んで、自由に歩く', () => {
      this.progress.exploration = chooseExploration(this.progress.exploration, null);
      this.progress.preferences.destination = null; this.destination = undefined; this.route = [];
      this.changed('発見はそのまま手帳に。今日は、予定のない散歩へ。'); this.ui.dialog.close(); this.updateNearby();
    });
  }

  private appendPostcard(card: ReturnType<typeof observationCards>[number]): void {
    const scenes: Record<ExplorationPlace, PostcardScene> = { plaza: 'park', beach: 'sea', summit: 'hill', station: 'station', home: 'home', 'w-cafe': 'town' };
    this.ui.postcard({ ...card, place: card.name, scene: scenes[card.id] }, [
      { label: card.favorite ? 'お気に入りから外す' : '大切な場所にする', pressed: card.favorite, action: () => {
        this.progress.exploration = setFavorite(this.progress.exploration, card.favorite ? null : card.id);
        this.changed(card.favorite ? 'お気に入りを外しました。景色の記録は残ります。' : `${card.name}を、また帰ってきたい場所にしました。`); this.postcardBook();
      } },
      { label: `${card.name}へまた行く`, action: () => this.guideAndClose(card.destinationId) },
    ]);
  }

  private postcardBook(): void {
    this.ui.page('あなたの、景色の絵はがき'); this.bookSections('絵はがき');
    this.ui.addText('初めて立ち止まった日の天気と時間を、街のスケッチに添えて。何度訪ねても、最初の記録はここに残ります。');
    const cards = observationCards(this.progress.exploration);
    if (!cards.length) { this.ui.addText('まだ白いページです。散歩を選んでも、近くの公園で立ち止まっても。気になった景色を、最初の一枚にしよう。'); this.ui.addAction('散歩を選ぶ', () => this.explorationBook()); }
    for (const card of [...cards].sort((a, b) => Number(b.favorite) - Number(a.favorite))) this.appendPostcard(card);
  }

  private depthRecords(): JournalRecord[] {
    const records: JournalRecord[] = observationCards(this.progress.exploration).map(card => ({ id: `place-${card.id}`, title: card.title, body: `${card.name}。${card.body}`, day: card.day, minute: card.minute, kind: 'postcard' }));
    for (const card of storyCards(this.progress.stories)) {
      const arc = this.progress.stories.arcs.find(arc => arc.id === card.id)!;
      records.push({ id: `story-${card.id}-start`, title: `${card.residentName}と、小さな約束`, body: `「${card.title}」で「${card.choiceLabel}」を選びました。`, day: arc.acceptedDay, minute: arc.acceptedMinute, kind: 'story' });
      if (arc.observed) records.push({ id: `story-${card.id}-observed`, title: `「${card.title}」で見つけたこと`, body: card.observation ?? card.body, day: arc.observed.day, minute: arc.observed.minute, kind: 'story' });
      if (arc.completedDay !== undefined) records.push({ id: `story-${card.id}-end`, title: `${card.residentName}に届いた言葉`, body: card.ending ?? card.body, day: arc.completedDay, minute: arc.completedMinute!, kind: 'story' });
    }
    return records.sort((a, b) => b.day - a.day || b.minute - a.minute);
  }

  private recordBook(): void {
    this.ui.page('この街で過ごした日々'); this.bookSections('日々の記録');
    const records = this.depthRecords();
    if (!records.length) this.ui.addText('まだ書き出しの前。誰かの話を聞いたり、景色を見つけたりした時間が、このページにつながっていきます。');
    else this.ui.timeline(records);
    this.ui.addText('何も増えない日があっても大丈夫。街は、いつでも続きを待っています。');
  }

  private resumeSummary(): string {
    const latest = this.depthRecords()[0], story = storyCards(this.progress.stories).find(card => card.stage !== 'completed');
    const walk = explorationSuggestion(this.progress.exploration);
    return `${latest ? `前回の記録：${latest.day}日目「${latest.title}」。` : '選んだ散歩の続きから。'}${story ? `${story.residentName}との続き：${story.nextStep}` : walk && !walk.complete ? `散歩の続き：${walk.body}` : '今度は、お気に入りに戻ったり、新しい過ごし方を選んでも。'}`;
  }

  private resumeBook(): void {
    this.ui.page('おかえりなさい、桜の街へ');
    this.ui.addText(this.resumeSummary());
    const story = storyCards(this.progress.stories).find(card => card.stage !== 'completed');
    const walk = explorationSuggestion(this.progress.exploration);
    if (story) this.ui.addAction('物語の続きへ', () => this.guideAndClose(story.destinationId ?? story.residentId));
    else if (walk?.destinationId) this.ui.addAction('散歩の続きへ', () => this.guideAndClose(walk.destinationId!));
    if (this.progress.exploration.favorite) this.ui.addAction('大切な場所へ戻る', () => this.guideAndClose(this.progress.exploration.favorite!));
    this.ui.addAction('別の過ごし方を選ぶ', () => this.explorationBook());
    this.ui.addAction('そのまま街を歩く', () => this.ui.dialog.close());
  }

  settings(): void {
    const body = this.ui.page('設定とセーブ');
    this.ui.addText('開いている間は時計と移動が止まります。保存先はこの端末のブラウザです。');
    this.ui.addAction('依頼帳を開く', () => this.journal());
    this.ui.addAction('暮らしの手帳を開く', () => this.lifeBook());
    this.ui.addAction('お店案内を開く', () => this.ui.guide(this.shops, shop => this.chooseDestination(shop.id)));
    this.ui.addAction(this.progress.preferences.wayfinding ? '目的地の矢印をオフにする' : '目的地の矢印をオンにする', () => {
      this.progress.preferences.wayfinding = !this.progress.preferences.wayfinding;
      this.changed(this.progress.preferences.wayfinding ? '目的地の矢印をオンにしました。' : '矢印をオフにしました。地図と文字の案内はいつでも使えます。');
      this.updateWayfinder(); this.settings();
    });
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
      if (result.ok) { this.recordMemories({ consumed: id }); this.changed(result.message); }
      return result;
    });
    if (this.interiors.current?.id === 'home') this.ui.addAction('自宅で軽食を食べる（無料）', () => {
      this.eatAtHome(); this.inventory();
    });
    else if (this.home) this.ui.addAction('自宅の軽食へ案内', () => this.guideAndClose('home'));
  }

  private eatAtHome(): void {
    if (this.interiors.current?.id !== 'home') return;
    const result = homeMeal(this.progress);
    this.changed(result.message);
    this.updateNearby();
  }

  journal(): void {
    this.ui.journal(this.progress, () => {
      const offer = this.progress.errand ? errandFor(this.progress.errand.resident) : undefined;
      const destination = this.places.find(s => s.id === offer?.shop);
      if (!destination) { this.ui.message('配達先が見つかりません。依頼を取りやめ、ほかの住人に相談してください。'); return; }
      this.chooseDestination(destination.id);
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
    const places = this.destination && validResident(this.destination.id) ? [...this.places, this.destination] : this.places;
    this.ui.map(p, places, this.destination?.id, offer?.shop, place => {
      this.chooseDestination(place.id);
      this.ui.message(this.interiors.indoor ? `外へ出たら${place.name}への案内を再開します。` : this.route.length || this.arrived(place) ? `${place.name}までの経路を案内します。矢印は次の角、地図には道のりを表示します。` : `${place.name}へ方角で案内します。安全な経路が見つからないため、道に出ると矢印を再計算します。`);
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
      this.ui.message('保存に失敗しました。ブラウザの空き容量と保存設定を確認してください。進行はこのタブだけに残っています。', 0);
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
    if (document.hidden) { this.skipWorldTick = true; this.save(); this.audio.pause(); }
    else if (this.progress.life.sound) void this.audio.configure(true, this.progress.life.volume);
  };
  private readonly storageChanged = (event: StorageEvent): void => {
    if ((event.key !== null && event.key !== SAVE_KEY) || event.storageArea !== localStorage) return;
    this.storageBlocked = true;
    this.ui.saved('別タブで変更あり');
    this.ui.message('別のタブでセーブが変更されました。上書きを防ぐため、このタブの保存を停止しました。ページを再読み込みすると続きから遊べます。', 0);
  };
}
