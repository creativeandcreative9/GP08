/** Ground-plane coordinates, deliberately independent of the 3D engine. */
export interface WayfinderPoint { x: number; z: number }

export interface WayfinderState {
  enabled: boolean;
  /** False while a modal is open or the game is otherwise not being played. */
  visible: boolean;
  indoors?: boolean;
  target: { id: string; name: string } | undefined;
  player: WayfinderPoint;
  /** The next collision-checked walking waypoint, never a shortcut through a building. */
  waypoint: WayfinderPoint | undefined;
  /** Camera target minus camera position, projected onto the ground. */
  cameraForward: WayfinderPoint;
  /** Remaining length of the walking route, already converted to metres. */
  distanceMetres: number;
  arrived: boolean;
  arrivalHint?: string;
}

/** Clockwise radians from screen-up; a waypoint behind the camera points down. */
export function cameraRelativeBearing(player: WayfinderPoint, waypoint: WayfinderPoint, forward: WayfinderPoint): number | undefined {
  const dx = waypoint.x - player.x, dz = waypoint.z - player.z;
  if (![dx, dz, forward.x, forward.z].every(Number.isFinite)
    || Math.hypot(dx, dz) < .001 || Math.hypot(forward.x, forward.z) < .001) return undefined;
  // The game's movement uses the same right vector: (forward.z, -forward.x).
  return Math.atan2(dx * forward.z - dz * forward.x, dx * forward.x + dz * forward.z);
}

/** Keep an unwrapped angle so crossing south never causes a full CSS rotation. */
export function smoothBearing(current: number | undefined, target: number, seconds: number): number {
  if (!Number.isFinite(target)) return current !== undefined && Number.isFinite(current) ? current : 0;
  if (current === undefined || !Number.isFinite(current)) return target;
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  const elapsed = Number.isFinite(seconds) ? Math.min(.25, Math.max(0, seconds)) : 0;
  return current + delta * (1 - Math.exp(-12 * elapsed));
}

const DIRECTIONS = ['前へ', '右前へ', '右へ', '右後ろへ', '後ろへ', '左後ろへ', '左へ', '左前へ'] as const;

/** Passive HUD: it never consumes a pointer, key, camera gesture, or focus. */
export class Wayfinder {
  readonly root: HTMLElement;
  private readonly needle: HTMLElement;
  private readonly title: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly reducedMotion: MediaQueryList;
  private angle: number | undefined;
  private destinationId: string | undefined;

  constructor(parent: HTMLElement = document.body) {
    this.root = document.createElement('aside');
    this.root.className = 'life-wayfinder';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', '徒歩の道案内');
    // Distances and bearing change continuously; avoid announcing every walking frame.
    this.root.setAttribute('aria-live', 'off');
    const compass = document.createElement('span');
    compass.className = 'life-wayfinder-compass';
    compass.setAttribute('aria-hidden', 'true');
    this.needle = document.createElement('span');
    this.needle.className = 'life-wayfinder-needle';
    this.needle.innerHTML = '<svg viewBox="0 0 32 32" focusable="false" aria-hidden="true"><path d="M16 3 27 26 16 21 5 26Z"/></svg>';
    const check = document.createElement('span');
    check.className = 'life-wayfinder-check';
    check.textContent = '✓';
    compass.append(this.needle, check);
    const copy = document.createElement('span');
    copy.className = 'life-wayfinder-copy';
    this.title = document.createElement('strong');
    this.title.className = 'life-wayfinder-title';
    this.detail = document.createElement('span');
    this.detail.className = 'life-wayfinder-detail';
    copy.append(this.title, this.detail);
    this.root.append(compass, copy);
    parent.append(this.root);
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  }

  update(state: WayfinderState, deltaSeconds = 1 / 60): void {
    const shown = state.enabled && state.visible && !state.indoors && !!state.target
      && (state.arrived || !!state.waypoint);
    if (!shown || !state.target) {
      this.root.hidden = true;
      this.angle = undefined;
      return;
    }
    if (this.destinationId !== state.target.id) this.angle = undefined;
    this.destinationId = state.target.id;
    const bearing = state.waypoint ? cameraRelativeBearing(state.player, state.waypoint, state.cameraForward) : undefined;
    // A camera looking straight down may briefly have no ground heading. Retain the
    // last valid direction; without one, wait rather than inventing a route direction.
    if (!state.arrived && bearing === undefined && this.angle === undefined) {
      this.root.hidden = true;
      return;
    }
    this.root.dataset.destination = state.target.id;
    this.root.dataset.state = state.arrived ? 'arrived' : 'walking';
    this.root.hidden = false;
    if (this.title.textContent !== state.target.name) this.title.textContent = state.target.name;
    if (bearing !== undefined) {
      this.angle = this.reducedMotion.matches ? bearing : smoothBearing(this.angle, bearing, deltaSeconds);
      this.needle.style.transform = `rotate(${this.angle}rad)`;
    }
    let detail: string;
    if (state.arrived) {
      detail = state.arrivalHint ? `到着 · ${state.arrivalHint}` : '到着しました';
    } else {
      const angle = bearing ?? this.angle ?? 0;
      const direction = DIRECTIONS[((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8];
      const distance = Number.isFinite(state.distanceMetres) ? Math.max(0, state.distanceMetres) : 0;
      const metres = distance < 1 ? 'すぐ近く' : `あと ${Math.ceil(distance).toLocaleString('ja-JP')} m`;
      detail = `${metres} · ${direction}`;
    }
    if (this.detail.textContent !== detail) this.detail.textContent = detail;
  }

  dispose(): void { this.root.remove(); }
}
