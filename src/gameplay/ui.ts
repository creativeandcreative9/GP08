import { ITEMS, ITEM_IDS, type ActionResult, type ItemId, type Progress } from './state';
import type { Contact } from './world';
import { errandFor, residentName, SHOPS } from './errands';
import type { WorldXZ } from '../town/layout';
import type { MapPlace } from './map';
import { townMap } from './map-view';
import { JOURNEY_IDS } from './journey';
import './ui.css';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
};

export interface UIActions {
  interact(): void;
  inventory(): void;
  journal(): void;
  guide(): void;
  map(): void;
  save(): void;
  life(): void;
  settings(): void;
  modal(open: boolean): void;
}

export interface ContextHint {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export interface MemoryCard {
  id?: string;
  title: string;
  body: string;
  detail?: string;
  unlocked: boolean;
  day?: number;
  minute?: number;
}

export type PostcardScene = 'park' | 'sea' | 'hill' | 'town' | 'home' | 'station';
export type PostcardWeather = 'clear' | 'cloudy' | 'rain';
export interface JournalAction {
  label: string;
  action(): void;
  primary?: boolean;
  disabled?: boolean;
  pressed?: boolean;
}
export interface JournalSection { label: string; active: boolean; action(): void }
export interface StoryCard {
  id?: string;
  title: string;
  person: string;
  body: string | readonly string[];
  step: string | number;
  totalSteps?: number;
  choice?: string;
  completed?: boolean;
}
export interface Postcard {
  id: string;
  title: string;
  body: string;
  day: number;
  minute: number;
  scene: PostcardScene;
  weather?: PostcardWeather;
  favorite?: boolean;
  place?: string;
  subtitle?: string;
  /** Available to the caller for navigation; raw world coordinates are not player-facing copy. */
  position?: WorldXZ;
}
export interface WalkTheme {
  id: string;
  title: string;
  body: string;
  detail?: string;
  selected?: boolean;
  scene?: PostcardScene;
  action(): void;
}
export interface JournalRecord {
  id?: string;
  title: string;
  body: string;
  day: number;
  minute: number;
  kind?: 'memory' | 'story' | 'walk' | 'postcard' | 'rest';
}

const journalTime = (minute: number): string => {
  const hour = String(Math.floor(minute / 60)).padStart(2, '0');
  return `${hour}:${String(Math.floor(minute % 60)).padStart(2, '0')}`;
};
const journalDate = (day: number, minute: number): string => `${day}日目 ${journalTime(minute)}`;
const WEATHER_COPY: Record<PostcardWeather, string> = { clear: '晴れ', cloudy: '曇り', rain: '雨' };
let journalId = 0;

/** A decorative sketch, not a captured game image. All geometry is local, with no image requests. */
function postcardSketch(scene: PostcardScene, weather: PostcardWeather = 'clear', night = false): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 360 140');
  svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  svg.classList.add('life-postcard-sketch'); svg.dataset.scene = scene;
  svg.dataset.weather = weather; if (night) svg.dataset.night = '';
  const shape = (tag: 'path' | 'rect' | 'circle' | 'ellipse', attributes: Record<string, string | number>): void => {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    svg.append(node);
  };
  shape('rect', { width: 360, height: 140, fill: 'var(--postcard-sky)' });
  shape('circle', { cx: 290, cy: 29, r: night ? 12 : 16, fill: 'var(--postcard-sun)' });
  if (night) shape('circle', { cx: 295, cy: 25, r: 10, fill: 'var(--postcard-sky)' });
  if (weather !== 'clear') for (const [cx, cy, rx] of [[65, 25, 43], [108, 29, 38], [245, 41, 60]]) {
    shape('ellipse', { cx, cy, rx, ry: 10, fill: 'var(--postcard-cloud)' });
  }
  shape('path', { d: 'M0 88 Q50 60 100 82 T205 73 T360 87 V140 H0Z', fill: 'var(--postcard-distance)' });
  const cherry = (x: number, y: number, size = 1): void => {
    shape('path', { d: `M${x} ${y + 52 * size}v-${37 * size}m0 ${16 * size}l-${19 * size} -${24 * size}m${19 * size} ${14 * size}l${20 * size} -${26 * size}`, fill: 'none', stroke: '#6d625a', 'stroke-width': 4 * size, 'stroke-linecap': 'round' });
    for (const [dx, dy, r] of [[-25, 1, 22], [0, -8, 27], [25, 0, 22], [0, 13, 22]]) {
      shape('circle', { cx: x + dx * size, cy: y + dy * size, r: r * size, fill: 'var(--postcard-petal)' });
    }
    shape('ellipse', { cx: x - 10 * size, cy: y - 12 * size, rx: 24 * size, ry: 9 * size, fill: '#ffffff38' });
  };
  if (scene === 'sea') {
    shape('path', { d: 'M0 82H360V140H0Z', fill: 'var(--postcard-water)' });
    shape('path', { d: 'M0 114 Q91 92 190 115 T360 124V140H0Z', fill: 'var(--postcard-sand)' });
    shape('path', { d: 'M0 109 Q91 87 190 110 T360 119M36 92h50m41 6h35m63-7h56', fill: 'none', stroke: '#fffdf6aa', 'stroke-width': 2 });
    shape('path', { d: 'M129 44q7-8 14 0q7-8 14 0M185 33q5-6 10 0q5-6 10 0', fill: 'none', stroke: '#fffdf8', 'stroke-width': 2, 'stroke-linecap': 'round' });
    shape('path', { d: 'M264 128q7-16 14 0Z', fill: '#efc7b5', stroke: '#c19786', 'stroke-width': 1 });
  } else if (scene === 'hill') {
    shape('path', { d: 'M0 116 65 61l62 43 77-67 79 75 77-45v73H0Z', fill: 'var(--postcard-green)' });
    shape('path', { d: 'M0 140 93 101l58 39m36 0 70-58 103 58', fill: 'var(--postcard-distance)' });
    shape('path', { d: 'M126 140q25-27 57-21t40-34', fill: 'none', stroke: 'var(--postcard-sand)', 'stroke-width': 10 });
    shape('path', { d: 'M29 113h87m-76-9v36m32-36v36m33-36v36', fill: 'none', stroke: '#8c7562', 'stroke-width': 4 });
  } else if (scene === 'home') {
    shape('rect', { x: 109, y: 58, width: 142, height: 74, rx: 2, fill: 'var(--postcard-wall)' });
    shape('path', { d: 'M92 61 180 17l88 44Z', fill: 'var(--postcard-roof)' });
    shape('rect', { x: 164, y: 88, width: 29, height: 44, fill: '#977b65' });
    for (const x of [126, 209]) shape('rect', { x, y: 80, width: 24, height: 24, rx: 2, fill: 'var(--postcard-window)' });
    shape('path', { d: 'M0 130Q90 112 165 133h31q80-28 164-4v11H0Z', fill: 'var(--postcard-green)' });
    shape('path', { d: 'M163 140 170 132h16l10 8Z', fill: 'var(--postcard-sand)' });
    cherry(53, 72, .7); cherry(306, 96, .45);
  } else if (scene === 'station') {
    shape('rect', { x: 18, y: 75, width: 255, height: 42, rx: 8, fill: '#fff8e7' });
    shape('rect', { x: 18, y: 103, width: 255, height: 6, fill: '#cc859a' });
    for (let x = 35; x < 255; x += 38) shape('rect', { x, y: 82, width: 26, height: 14, rx: 2, fill: '#8aaeb0' });
    shape('path', { d: 'M0 123H360V140H0Z', fill: '#b1b8b3' });
    shape('path', { d: 'M18 128h324', fill: 'none', stroke: '#e7c975', 'stroke-width': 4 });
    shape('path', { d: 'M12 40h294l35 14H0Z', fill: 'var(--postcard-roof)' });
    shape('path', { d: 'M31 54v70m241-70v70', fill: 'none', stroke: '#7b8580', 'stroke-width': 5 });
    cherry(331, 67, .65);
  } else if (scene === 'town') {
    shape('path', { d: 'M0 116H360V140H0Z', fill: '#c5c8bd' });
    for (const [x, y, width, height] of [[12, 60, 65, 57], [84, 43, 63, 74], [155, 68, 68, 49]]) {
      shape('rect', { x, y, width, height, fill: 'var(--postcard-wall)' });
      shape('path', { d: `M${x - 5} ${y + 2}l${width / 2 + 5} -16l${width / 2 + 5} 16Z`, fill: 'var(--postcard-roof)' });
      for (let wx = x + 11; wx < x + width - 10; wx += 25) shape('rect', { x: wx, y: y + 16, width: 13, height: 18, fill: 'var(--postcard-window)' });
    }
    shape('path', { d: 'M256 21v103m-12-88h24M0 29q125 31 256 7t104-4', fill: 'none', stroke: '#797c78', 'stroke-width': 2 });
    cherry(313, 86, .7);
  } else {
    shape('path', { d: 'M0 111Q110 94 200 112T360 109V140H0Z', fill: 'var(--postcard-green)' });
    shape('path', { d: 'M153 140q23-32 57-37t51-5', fill: 'none', stroke: 'var(--postcard-sand)', 'stroke-width': 17 });
    cherry(83, 55, 1); cherry(295, 77, .68);
    shape('path', { d: 'M128 104h48m-48 8h48m-42-15v28m35-28v28', fill: 'none', stroke: '#90735d', 'stroke-width': 4, 'stroke-linecap': 'round' });
  }
  if (weather === 'rain') for (let x = 15; x < 360; x += 28) shape('path', { d: `M${x} 19l-7 18m18 31-7 18m15 25-7 18`, fill: 'none', stroke: '#d8edf67a', 'stroke-width': 1.5 });
  return svg;
}

/** DOM-only interface: native dialogs supply focus trapping and Escape support. */
export class GameUI {
  readonly root = el('section', '', 'life-ui');
  readonly dialog = el('dialog', '', 'life-dialog');
  private readonly clock = el('span', '', 'life-clock');
  private readonly money = el('strong');
  private readonly goal = el('div', '', 'life-goal');
  private readonly navigation = el('p', '', 'life-navigation');
  private readonly restStatus = el('p', '', 'life-rest-status');
  private readonly context = el('aside', '', 'life-context');
  private readonly milestone = el('section', '', 'life-celebration');
  private currentHint: ContextHint | null = null;
  private hintKey = '';
  private celebrationTimer: ReturnType<typeof setTimeout> | undefined;
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly prompt: HTMLButtonElement;
  private readonly notice = el('p', '', 'life-notice');
  private readonly saveStatus = el('span', '自動保存待ち', 'life-save-status');
  private readonly title = el('h2');
  private readonly content = el('div', '', 'life-dialog-content');
  private readonly dialogKicker = el('p', '桜の街の手帳', 'life-dialog-kicker');
  private readonly close: HTMLButtonElement;

  constructor(private readonly actions: UIActions) {
    this.root.setAttribute('aria-label', '街歩き');
    const bar = el('div', '', 'life-bar');
    const identity = el('div', '', 'life-identity');
    const name = el('span', '桜の街で、ひと休み', 'life-brand');
    const status = el('div', '', 'life-status');
    status.append(this.clock, this.money);
    identity.append(name, status);
    const toolbar = el('nav', '', 'life-toolbar');
    toolbar.setAttribute('aria-label', '街歩きのメニュー');
    for (const [label, action, secondary] of [
      ['持ち物 [I]', actions.inventory, false], ['依頼帳 [J]', actions.journal, true], ['地図 [M]', actions.map, false],
      ['お店案内', actions.guide, true], ['暮らし', actions.life, false], ['設定', actions.settings, false], ['保存', actions.save, true],
    ] as const) {
      const button = this.button(label, action);
      if (secondary) button.classList.add('life-secondary');
      toolbar.append(button);
    }
    bar.append(identity, toolbar, this.saveStatus);
    this.prompt = this.button('近くの人やお店に話しかける [E]', actions.interact);
    this.prompt.className = 'life-interact';
    this.prompt.disabled = true;
    this.notice.setAttribute('role', 'status');
    this.notice.setAttribute('aria-live', 'polite');
    this.notice.setAttribute('aria-atomic', 'true');
    this.title.id = 'life-dialog-title';
    this.dialog.setAttribute('aria-labelledby', this.title.id);
    this.close = this.button('閉じる [Esc]', () => this.dialog.close());
    this.close.className = 'life-close';
    this.dialog.append(this.dialogKicker, this.title, this.content, this.close);
    this.dialog.addEventListener('close', () => {
      this.actions.modal(false);
      this.prompt.focus({ preventScroll: true });
    });
    this.context.hidden = true;
    this.context.setAttribute('aria-label', '街歩きのヒント');
    this.context.setAttribute('aria-live', 'polite');
    this.context.setAttribute('aria-atomic', 'true');
    this.milestone.hidden = true;
    this.milestone.setAttribute('role', 'status');
    this.milestone.setAttribute('aria-live', 'polite');
    this.milestone.setAttribute('aria-atomic', 'true');
    const sidebar = el('div', '', 'life-sidebar');
    sidebar.append(this.context, this.goal, this.navigation, this.restStatus);
    this.root.append(bar, sidebar, this.milestone, this.prompt, this.notice, this.dialog);
    document.body.append(this.root);
  }

  private button(label: string, action: () => void): HTMLButtonElement {
    const button = el('button', label);
    button.type = 'button';
    button.addEventListener('click', action);
    return button;
  }

  update(p: Progress): void {
    this.money.textContent = `所持金 ${p.money.toLocaleString('ja-JP')}円`;
    const offer = p.errand ? errandFor(p.errand.resident) : undefined;
    if (offer && p.errand) {
      this.goal.replaceChildren(el('strong', '街のおつかい'), el('p', `${residentName(p.errand.resident)}からのお願い`),
        el('p', `${offer.parcel} → ${SHOPS[offer.shop].name}`), el('small', `お礼：${offer.reward}円 · 依頼帳 [J] で詳細`));
      return;
    }
    this.goal.replaceChildren(el('strong', p.rewarded ? 'はじめての街歩き 達成！' : 'はじめての街歩き'));
    if (p.rewarded) {
      this.goal.append(el('p', 'ここからは、あなたの歩幅で。気になる景色や住人に会いにいこう。'),
        el('small', `思い出 ${p.journey.memories.length} / ${JOURNEY_IDS.length} · 暮らしでアルバムを開く`),
        el('small', `おつかい完了：${p.completedErrands.length}件 · 依頼帳 [J]`));
      return;
    }
    const completed = Number(p.greeted.length > 0) + Number(p.boughtDango) + Number(p.ateDango);
    const progress = el('div', '', 'life-goal-progress');
    progress.setAttribute('aria-label', `街歩きの達成 ${completed} / 3`);
    for (let i = 0; i < 3; i++) progress.append(el('span', '', i < completed ? 'complete' : ''));
    this.goal.append(progress);
    const steps = el('ol');
    let next = true;
    for (const [done, text] of [[p.greeted.length > 0, '住人にあいさつする'], [p.boughtDango, '和菓子屋で三色だんごを買う'], [p.ateDango, '持ち物からだんごを食べる']] as const) {
      const item = el('li', text);
      if (done) item.className = 'complete';
      else if (next) { item.className = 'current'; next = false; }
      steps.append(item);
    }
    this.goal.append(steps, el('small', '達成のお祝い：500円 · おつかいは住人に相談'));
  }

  nearby(contact: Contact | undefined, bench?: string): void {
    const text = bench ? `${bench}に座る [E]` : contact ? `${contact.name}${contact.kind === 'shop' ? 'で買い物' : 'と話す'} [E]` : '人やお店、ベンチに近づこう [E]';
    if (this.prompt.textContent !== text) this.prompt.textContent = text;
    this.prompt.disabled = !contact && !bench;
  }

  resting(name?: string): void {
    const text = name ? `${name}でひと休み中。I：おやつ · E / Esc：立ち上がる · マウス：景色を眺める` : '';
    if (this.restStatus.textContent !== text) this.restStatus.textContent = text;
    if (name) {
      if (this.prompt.textContent !== '立ち上がる [E]') this.prompt.textContent = '立ち上がる [E]';
      this.prompt.disabled = false;
    }
  }

  navigate(text: string): void { if (this.navigation.textContent !== text) this.navigation.textContent = text; }
  message(text: string, duration = 8000): void {
    clearTimeout(this.noticeTimer);
    this.notice.textContent = text;
    if (text && duration > 0) this.noticeTimer = setTimeout(() => { this.notice.textContent = ''; }, duration);
  }
  saved(text: string): void { if (this.saveStatus.textContent !== text) this.saveStatus.textContent = text; }

  /** Optional guidance stays beside the world and never takes movement or focus away. */
  contextHint(hint: ContextHint | null): void {
    this.currentHint = hint;
    const key = hint ? JSON.stringify([hint.title, hint.body, hint.actionLabel, hint.secondaryLabel]) : '';
    if (this.hintKey === key) return;
    this.hintKey = key;
    this.context.hidden = !hint;
    this.context.replaceChildren();
    if (!hint) return;
    this.context.append(el('small', 'このあとの過ごし方', 'life-context-kicker'), el('h3', hint.title), el('p', hint.body));
    const actions = el('div', '', 'life-context-actions');
    if (hint.actionLabel) {
      const action = this.button(hint.actionLabel, () => this.currentHint?.onAction?.());
      action.className = 'life-primary';
      actions.append(action);
    }
    if (hint.secondaryLabel) actions.append(this.button(hint.secondaryLabel, () => this.currentHint?.onSecondary?.()));
    this.context.append(actions);
  }

  /** A small memory announcement; the walk carries on underneath it. */
  celebration(title: string, body: string): void {
    clearTimeout(this.celebrationTimer);
    this.milestone.replaceChildren(el('small', 'この街の、ひとつの思い出', 'life-celebration-kicker'), el('strong', title), el('p', body));
    this.milestone.hidden = false;
    this.celebrationTimer = setTimeout(() => { this.milestone.hidden = true; }, 7000);
  }

  /** Can be appended to any journal page without changing its actions or focus. */
  memoryAlbum(cards: readonly MemoryCard[]): void {
    const album = el('div', '', 'life-memory-album');
    for (const card of cards) {
      const entry = el('article', '', `life-memory-card${card.unlocked ? ' discovered' : ''}`);
      if (card.id) entry.dataset.memory = card.id;
      entry.append(el('small', card.unlocked ? '思い出に残りました' : 'これから出会う景色'), el('h3', card.title), el('p', card.body));
      if (card.unlocked && card.day !== undefined) {
        const time = card.minute === undefined ? '' : ` ${String(Math.floor(card.minute / 60)).padStart(2, '0')}:${String(Math.floor(card.minute % 60)).padStart(2, '0')}`;
        entry.append(el('small', `${card.day}日目${time}`, 'life-memory-date'));
      }
      if (card.detail) entry.append(el('small', card.detail));
      album.append(entry);
    }
    this.content.append(album);
  }

  /** Page navigation uses ordinary buttons, not incomplete ARIA tabs. */
  sectionNav(items: readonly JournalSection[]): HTMLElement {
    const nav = el('nav', '', 'life-section-nav');
    nav.setAttribute('aria-label', '手帳のページ');
    for (const item of items) {
      const button = this.button(item.label, () => {
        item.action();
        // The owner may synchronously rebuild the page. Keep keyboard focus on
        // the same section without moving it to the underlying game controls.
        queueMicrotask(() => {
          if (!this.dialog.open) return;
          const next = [...this.content.querySelectorAll<HTMLButtonElement>('.life-section-nav button')]
            .find(candidate => candidate.textContent === item.label);
          if (next) { this.content.scrollTop = 0; next.focus({ preventScroll: true }); }
        });
      });
      if (item.active) button.setAttribute('aria-current', 'page');
      nav.append(button);
    }
    this.content.append(nav);
    return nav;
  }

  /** A short chapter is readable independently of its choices and progress. */
  storyCard(story: StoryCard, actions: readonly JournalAction[] = []): HTMLElement {
    const card = el('article', '', `life-journal-card life-story-card${story.completed ? ' is-complete' : ''}`);
    card.dataset.journalKey = `story:${story.id ?? story.title}`;
    const heading = el('h3', story.title);
    heading.id = `life-journal-heading-${++journalId}`;
    card.setAttribute('aria-labelledby', heading.id);
    const person = el('div', '', 'life-story-person');
    const seal = el('span', story.person.trim().slice(0, 1) || '街', 'life-story-seal');
    seal.setAttribute('aria-hidden', 'true');
    const attribution = el('div');
    attribution.append(el('small', 'この街で暮らすひと'), el('strong', story.person));
    person.append(seal, attribution);
    const step = typeof story.step === 'number'
      ? `第${story.step}章${story.totalSteps === undefined ? '' : ` / ${story.totalSteps}`}` : story.step;
    const caption = el('div', '', 'life-story-caption');
    caption.append(el('small', step), el('span', story.completed ? '思い出になった物語' : 'ふたりの、次のひととき'));
    card.append(person, caption, heading);
    const paragraphs = typeof story.body === 'string' ? story.body.split(/\n\s*\n/) : story.body;
    const prose = el('div', '', 'life-story-prose');
    for (const paragraph of paragraphs) if (paragraph.trim()) prose.append(el('p', paragraph));
    card.append(prose);
    if (story.choice) {
      const choice = el('div', '', 'life-story-choice');
      choice.append(el('small', 'あなたが選んだこと'), el('p', story.choice));
      card.append(choice);
    }
    this.journalActions(card, actions);
    this.content.append(card);
    return card;
  }

  /** Illustrated memories remain text-readable; the sketch is decorative. */
  postcard(memory: Postcard, actions: readonly JournalAction[] = []): HTMLElement {
    const card = el('article', '', `life-journal-card life-postcard${memory.favorite ? ' is-favorite' : ''}`);
    card.dataset.journalKey = `postcard:${memory.id}`;
    card.dataset.postcard = memory.id;
    const heading = el('h3', memory.title);
    heading.id = `life-journal-heading-${++journalId}`;
    card.setAttribute('aria-labelledby', heading.id);
    const artwork = el('div', '', 'life-postcard-art');
    artwork.append(postcardSketch(memory.scene, memory.weather, memory.minute < 360 || memory.minute >= 1080));
    artwork.append(el('span', memory.place || '街歩きの一枚', 'life-postcard-place'), el('small', '風景のスケッチ', 'life-postcard-art-note'));
    const body = el('div', '', 'life-postcard-copy');
    const metadata = el('div', '', 'life-postcard-meta');
    metadata.append(el('small', `${journalDate(memory.day, memory.minute)}${memory.weather ? ` · ${WEATHER_COPY[memory.weather]}` : ''}`));
    if (memory.favorite) metadata.append(el('span', '大切な一枚', 'life-postcard-favorite'));
    body.append(metadata, heading);
    if (memory.subtitle) body.append(el('p', memory.subtitle, 'life-postcard-subtitle'));
    body.append(el('p', memory.body, 'life-postcard-description'));
    card.append(artwork, body);
    this.journalActions(body, actions, card.dataset.journalKey);
    this.content.append(card);
    return card;
  }

  /** A few distinct invitations; the caller decides availability and selection. */
  themeCards(themes: readonly WalkTheme[]): HTMLElement {
    const choices = el('div', '', 'life-theme-cards');
    choices.setAttribute('aria-label', '散歩のテーマを選ぶ');
    for (const theme of themes) {
      const button = this.button('', () => {
        const scroll = this.content.scrollTop;
        theme.action();
        this.restoreJournalFocus(`theme:${theme.id}`, 0, scroll);
      });
      button.className = 'life-theme-card';
      button.dataset.journalKey = `theme:${theme.id}`;
      button.setAttribute('aria-pressed', String(!!theme.selected));
      const art = el('span', '', 'life-theme-art');
      art.append(postcardSketch(theme.scene ?? 'park'));
      const copy = el('span', '', 'life-theme-copy');
      copy.append(el('small', theme.selected ? '今日の散歩に選択中' : 'こんな時間はいかが'), el('strong', theme.title), el('span', theme.body));
      if (theme.detail) copy.append(el('small', theme.detail, 'life-theme-detail'));
      button.append(art, copy);
      choices.append(button);
    }
    this.content.append(choices);
    return choices;
  }

  /** Preserve the caller's chronology; the UI never sorts or invents events. */
  timeline(records: readonly JournalRecord[]): HTMLElement {
    const timeline = el('section', '', 'life-journal-timeline');
    timeline.setAttribute('aria-label', '街で過ごした時間の記録');
    const kinds = { memory: '思い出', story: '住人との物語', walk: '散歩', postcard: '絵はがき', rest: 'ひと休み' };
    let day: number | undefined;
    let list: HTMLOListElement | undefined;
    for (const record of records) {
      if (!list || day !== record.day) {
        day = record.day;
        const group = el('section', '', 'life-timeline-day');
        const heading = el('h3', `${day}日目`, 'life-timeline-day-title');
        heading.id = `life-journal-heading-${++journalId}`;
        group.setAttribute('aria-labelledby', heading.id);
        list = el('ol', '', 'life-timeline-events');
        group.append(heading, list);
        timeline.append(group);
      }
      const item = el('li');
      if (record.id) item.dataset.record = record.id;
      const when = el('div', '', 'life-timeline-when');
      when.append(el('small', journalTime(record.minute)));
      if (record.kind) when.append(el('span', kinds[record.kind]));
      item.append(when, el('h4', record.title), el('p', record.body));
      list.append(item);
    }
    if (!records.length) timeline.append(el('p', 'まだ記録はありません。気になる場所へ、ひと歩きしてみよう。', 'life-timeline-empty'));
    this.content.append(timeline);
    return timeline;
  }

  private journalActions(parent: HTMLElement, actions: readonly JournalAction[], key = parent.dataset.journalKey): void {
    if (!actions.length) return;
    const controls = el('div', '', 'life-journal-actions');
    actions.forEach((action, index) => {
      const button = this.button(action.label, () => {
        const scroll = this.content.scrollTop;
        action.action();
        if (key) this.restoreJournalFocus(key, index, scroll);
      });
      button.disabled = !!action.disabled;
      if (action.primary) button.classList.add('life-primary');
      if (action.pressed !== undefined) button.setAttribute('aria-pressed', String(action.pressed));
      controls.append(button);
    });
    parent.append(controls);
  }

  private restoreJournalFocus(key: string, actionIndex: number, scroll: number): void {
    queueMicrotask(() => {
      if (!this.dialog.open) return;
      const card = [...this.content.querySelectorAll<HTMLElement>('[data-journal-key]')]
        .find(candidate => candidate.dataset.journalKey === key);
      const button = card?.matches('button') ? card as HTMLButtonElement : card?.querySelectorAll<HTMLButtonElement>('.life-journal-actions button')[actionIndex];
      if (button && !button.disabled) { this.content.scrollTop = scroll; button.focus({ preventScroll: true }); }
    });
  }

  private open(title: string): void {
    this.dialog.classList.remove('life-dialog-map');
    this.title.textContent = title;
    this.dialogKicker.textContent = '桜の街の手帳';
    this.content.replaceChildren();
    this.actions.modal(true);
    if (!this.dialog.open) this.dialog.showModal();
  }

  page(title: string): HTMLElement { this.open(title); return this.content; }
  addText(text: string): void { this.content.append(el('p', text)); }
  addAction(label: string, action: () => void): void { this.content.append(this.button(label, action)); }
  time(text: string): void { if (this.clock.textContent !== text) this.clock.textContent = text; }
  promptText(text: string, enabled = true): void { this.prompt.textContent = text; this.prompt.disabled = !enabled; }

  conversation(contact: Contact, again: boolean, result: string, p: Progress, accept: () => ActionResult): void {
    this.open(contact.name);
    this.dialogKicker.textContent = again ? '顔なじみとの、ひととき' : 'この街で出会ったひと';
    this.content.append(el('p', p.completedErrands.includes(contact.id)
      ? `届けてくれてありがとう。とても助かりました！ ${contact.line}`
      : again ? `また会いましたね。${contact.line}` : contact.line));
    if (result) this.content.append(el('p', result));
    const request = el('section', '', 'life-request');
    const status = el('p');
    status.setAttribute('role', 'status');
    const refresh = (): void => {
      request.replaceChildren();
      if (p.completedErrands.includes(contact.id)) return;
      const offer = errandFor(contact.id);
      if (!offer) return;
      request.append(el('h3', 'ちょっとお願いしてもいい？'));
      if (p.errand?.resident === contact.id) {
        request.append(el('p', `${SHOPS[offer.shop].name}へ${offer.parcel}をお願いします。店先で渡してもらえれば、お礼を受け取れますよ。`));
      } else if (p.errand) {
        request.append(el('p', '今のおつかいが終わったら、私のお願いも聞いてもらえますか？'));
      } else {
        request.append(el('p', `${SHOPS[offer.shop].name}へ、この${offer.parcel}を届けてもらえませんか？ お礼は${offer.reward}円です。立て替えは必要ありません。`));
        request.append(this.button('おつかいを引き受ける', () => {
          const outcome = accept();
          status.textContent = outcome.message;
          if (outcome.ok) { refresh(); this.close.focus(); }
        }));
      }
    };
    refresh();
    this.content.append(request, status);
    this.close.focus();
  }

  shop(contact: Contact, p: Progress, purchase: (id: ItemId) => ActionResult, deliver: () => ActionResult): void {
    this.open(contact.name);
    this.dialogKicker.textContent = '今日の小さな楽しみ';
    this.content.append(el('p', contact.line));
    const result = el('p');
    result.setAttribute('role', 'status');
    const buttons: { id: ItemId; button: HTMLButtonElement }[] = [];
    const delivery = el('section', '', 'life-request');
    const offer = p.errand ? errandFor(p.errand.resident) : undefined;
    if (offer?.shop === contact.id && p.errand) {
      delivery.append(el('h3', 'おつかいのお届け'), el('p', `${residentName(p.errand.resident)}から預かった${offer.parcel}`));
      delivery.append(this.button(`${offer.parcel}を渡す · お礼${offer.reward}円`, () => {
        const outcome = deliver();
        result.textContent = outcome.message;
        if (outcome.ok) { delivery.remove(); this.close.focus(); }
        refresh();
      }));
      this.content.append(delivery);
    }
    const refresh = (): void => {
      for (const { id, button } of buttons) {
        const item = ITEMS[id];
        button.disabled = p.money < item.price || p.inventory[id] >= 99;
        button.textContent = `${item.name}を買う · ${item.price}円（所持 ${p.inventory[id]}個）`;
      }
    };
    const list = el('div', '', 'life-products');
    for (const id of ITEM_IDS.filter(id => ITEMS[id].shop === contact.id)) {
      const button = this.button('', () => { result.textContent = purchase(id).message; refresh(); });
      buttons.push({ id, button });
      list.append(button);
    }
    refresh();
    this.content.append(list, el('small', '持ち物が99個になるか、お金が足りない商品は購入できません。'), result);
    this.close.focus();
  }

  journal(p: Progress, navigate: () => void, cancel: () => ActionResult): void {
    this.open('依頼帳');
    const body = el('div');
    const status = el('p');
    status.setAttribute('role', 'status');
    const refresh = (): void => {
      body.replaceChildren();
      const offer = p.errand ? errandFor(p.errand.resident) : undefined;
      if (p.errand && offer) {
        body.append(el('h3', '配達中'), el('p', `依頼主：${residentName(p.errand.resident)}`),
          el('p', `預かり物：${offer.parcel}`), el('p', `配達先：${SHOPS[offer.shop].name}の店先`),
          el('p', `お礼：${offer.reward}円`), el('small', '店先でEを押して「渡す」を選びます。預かり物は買い物の持ち物とは別に保管しています。'));
        const controls = el('div', '', 'life-products');
        controls.append(this.button('配達先へ案内', navigate), this.button('この依頼を取りやめる', () => {
          status.textContent = cancel().message;
          refresh();
          this.close.focus();
        }));
        body.append(controls);
      } else {
        body.append(el('p', '今は配達中のおつかいはありません。住人に話しかけると依頼を受けられます。'),
          el('small', 'おつかいは1件ずつ。1人の住人からの依頼は1回までです。立て替えのお金がなくても始められます。'));
      }
      body.append(el('h3', `おつかい完了：${p.completedErrands.length}件`));
      if (p.completedErrands.length) {
        const list = el('ul');
        for (const id of p.completedErrands.slice(-5).reverse()) {
          const completed = errandFor(id)!;
          list.append(el('li', `${residentName(id)} → ${SHOPS[completed.shop].name} · ${completed.reward}円`));
        }
        body.append(list);
      }
    };
    refresh();
    this.content.append(body, status);
    this.close.focus();
  }

  inventory(p: Progress, use: (id: ItemId) => ActionResult): void {
    this.open('持ち物');
    const list = el('div', '', 'life-products');
    const empty = el('p', 'まだ何も持っていません。お店でおやつを買ってみよう。');
    const result = el('p');
    result.setAttribute('role', 'status');
    const refresh = (): void => {
      list.replaceChildren();
      for (const id of ITEM_IDS.filter(id => p.inventory[id] > 0)) {
        const item = ITEMS[id];
        list.append(this.button(`${item.name}を${item.verb}（${p.inventory[id]}個）`, () => {
          result.textContent = use(id).message;
          refresh();
          this.close.focus();
        }));
      }
      empty.hidden = ITEM_IDS.some(id => p.inventory[id] > 0);
    };
    refresh();
    this.content.append(empty, list, result);
    this.close.focus();
  }

  guide(shops: readonly Contact[], choose: (shop: Contact) => void): void {
    this.open('お店案内');
    this.content.append(el('p', 'お店を選ぶと、歩く方向と距離を表示します。店先に近づいて E キーで買い物できます。'));
    const list = el('div', '', 'life-products');
    for (const shop of shops) list.append(this.button(`${shop.name}へ案内`, () => { choose(shop); this.dialog.close(); }));
    this.content.append(list, el('small', '方向は直線の目安です。建物や線路を避け、道・踏切を通って歩いてください。'));
    this.close.focus();
  }

  map(player: WorldXZ, places: readonly MapPlace[], destination: string | undefined, delivery: string | undefined, choose: (place: MapPlace) => void, route: readonly WorldXZ[] = []): void {
    this.open('街の地図');
    this.dialog.classList.add('life-dialog-map');
    this.content.append(el('p', '青い点が現在地。目的地を選ぶと、歩く方向と直線距離を案内します。'));
    const layout = el('div', '', 'life-map-layout');
    const drawing = el('div');
    drawing.append(townMap(player, places, destination, delivery, route), el('small', '青：現在地 · 緑の輪：案内中 · 茶：配達先'));
    const list = el('div', '', 'life-map-places');
    list.setAttribute('aria-label', '目的地を選ぶ');
    for (const [i, place] of places.entries()) {
      const active = place.id === destination, errand = place.id === delivery;
      const button = this.button(`${i + 1}. ${place.name}${errand ? '（配達先）' : ''}へ案内`, () => { choose(place); this.dialog.close(); });
      button.setAttribute('aria-pressed', String(active));
      if (errand) button.classList.add('life-map-delivery');
      list.append(button);
    }
    layout.append(drawing, list);
    this.content.append(layout, el('p', '緑の線が計算できた歩行経路です。建物を避け、道・踏切を通って歩こう。経路がないときは道に出て目的地を選び直してください。'),
      el('small', '地図は概略図です。寄り道してもおつかいは続けられます。配達先へは依頼帳 [J] から案内を戻せます。'));
    this.close.focus();
  }

  dispose(): void { clearTimeout(this.celebrationTimer); clearTimeout(this.noticeTimer); this.dialog.close(); this.root.remove(); }
}
