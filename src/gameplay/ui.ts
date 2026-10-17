import { ITEMS, ITEM_IDS, type ActionResult, type ItemId, type Progress } from './state';
import type { Contact } from './world';
import { errandFor, residentName, SHOPS } from './errands';
import type { WorldXZ } from '../town/layout';
import type { MapPlace } from './map';
import { townMap } from './map-view';

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

/** DOM-only interface: native dialogs supply focus trapping and Escape support. */
export class GameUI {
  readonly root = el('section', '', 'life-ui');
  readonly dialog = el('dialog', '', 'life-dialog');
  private readonly clock = el('span', '', 'life-clock');
  private readonly money = el('strong');
  private readonly goal = el('div', '', 'life-goal');
  private readonly navigation = el('p', '', 'life-navigation');
  private readonly restStatus = el('p', '', 'life-rest-status');
  private readonly prompt: HTMLButtonElement;
  private readonly notice = el('p', '', 'life-notice');
  private readonly saveStatus = el('span', '自動保存待ち', 'life-save-status');
  private readonly title = el('h2');
  private readonly content = el('div');
  private readonly close: HTMLButtonElement;

  constructor(private readonly actions: UIActions) {
    this.root.setAttribute('aria-label', '街歩き');
    const bar = el('div', '', 'life-bar');
    const name = el('span', '桜の街で、ひと休み', 'life-brand');
    bar.append(name, this.clock, this.money);
    for (const [label, action, secondary] of [
      ['持ち物 [I]', actions.inventory, false], ['依頼帳 [J]', actions.journal, true], ['地図 [M]', actions.map, false],
      ['お店案内', actions.guide, true], ['暮らし', actions.life, true], ['設定', actions.settings, false], ['保存', actions.save, true],
    ] as const) {
      const button = this.button(label, action);
      if (secondary) button.classList.add('life-secondary');
      bar.append(button);
    }
    bar.append(this.saveStatus);
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
    this.dialog.append(this.title, this.content, this.close);
    this.dialog.addEventListener('close', () => {
      this.actions.modal(false);
      this.prompt.focus({ preventScroll: true });
    });
    const sidebar = el('div', '', 'life-sidebar');
    sidebar.append(this.goal, this.navigation, this.restStatus);
    this.root.append(bar, sidebar, this.prompt, this.notice, this.dialog);
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
      this.goal.append(el('p', '住人のおつかいで、お散歩しながらおこづかいを稼ごう。'), el('small', `おつかい完了：${p.completedErrands.length}件 · 依頼帳 [J]`));
      return;
    }
    const steps = el('ol');
    for (const [done, text] of [[p.greeted.length > 0, '住人にあいさつする'], [p.boughtDango, '和菓子屋で三色だんごを買う'], [p.ateDango, '持ち物からだんごを食べる']] as const) {
      const item = el('li', `${done ? '✓' : '○'} ${text}`);
      if (done) item.className = 'complete';
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
  message(text: string): void { this.notice.textContent = text; }
  saved(text: string): void { if (this.saveStatus.textContent !== text) this.saveStatus.textContent = text; }

  private open(title: string): void {
    this.dialog.classList.remove('life-dialog-map');
    this.title.textContent = title;
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

  dispose(): void { this.dialog.close(); this.root.remove(); }
}
