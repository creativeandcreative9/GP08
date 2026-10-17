import type { Player } from './player';

/** Left thumb moves relative to the camera. The free canvas remains available for camera gestures. */
export function touchControls(player: Player): () => void {
  if (!matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints === 0) return () => {};
  const root = document.createElement('div'); root.className = 'touch-controls';
  const pad = document.createElement('div'); pad.className = 'touch-pad'; pad.setAttribute('role', 'group'); pad.setAttribute('aria-label', '移動スティック');
  const knob = document.createElement('span'); knob.className = 'touch-knob'; pad.append(knob);
  const run = document.createElement('button'); run.type = 'button'; run.textContent = '走る'; run.setAttribute('aria-pressed', 'false');
  let pointer: number | null = null, fast = false, x = 0, z = 0;
  const reset = (): void => { pointer = null; x = z = 0; knob.style.transform = ''; player.setTouch(0, 0); };
  const move = (e: PointerEvent): void => {
    if (e.pointerId !== pointer) return;
    const r = pad.getBoundingClientRect(), dx = (e.clientX - r.left - r.width / 2) / 40, dy = (e.clientY - r.top - r.height / 2) / 40;
    const distance = Math.hypot(dx, dy), scale = Math.max(1, distance);
    x = distance < .12 ? 0 : dx / scale; z = distance < .12 ? 0 : -dy / scale;
    knob.style.transform = `translate(${x * 36}px, ${-z * 36}px)`; player.setTouch(x, z, fast); e.preventDefault();
  };
  pad.addEventListener('pointerdown', e => { if (pointer !== null || document.querySelector('dialog[open]')) return; pointer = e.pointerId; pad.setPointerCapture(pointer); move(e); });
  pad.addEventListener('pointermove', move);
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(event, reset);
  run.addEventListener('click', () => { fast = !fast; run.setAttribute('aria-pressed', String(fast)); player.setTouch(x, z, fast); });
  const observer = new MutationObserver(() => { if (document.querySelector('dialog[open]')) reset(); }); observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
  window.addEventListener('blur', reset); root.append(pad, run); document.body.append(root);
  return () => { reset(); observer.disconnect(); window.removeEventListener('blur', reset); root.remove(); };
}
