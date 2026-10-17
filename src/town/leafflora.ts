import { blade, css, leaf, type Ctx2D, type Rng } from './paint';
import type { CellName } from './leafcells';
type Painter = (g: Ctx2D, w: number, h: number, r: Rng) => void;
const names: CellName[] = ['tuftA', 'tuftB', 'tuftC', 'clover', 'weed', 'dandelion', 'ivy', 'shrubBloom', 'bedTulip', 'bedPansy', 'bedMarigold', 'bedNemo', 'bedCosmos', 'bedDaisy', 'plantRubber', 'plantSword', 'plantFrond', 'cedar'];
export const FLORA: Partial<Record<CellName, Painter>> = Object.fromEntries(names.map((name, index) => [name, (g: Ctx2D, w: number, h: number, r: Rng): void => {
  if (name === 'cedar') {
    g.fillStyle = '#514a36'; g.fillRect(w * .48, h * .25, w * .04, h * .72);
    for (let level = 0; level < 14; level++) {
      const y = h * (.08 + level * .06), width = w * (.05 + level * .027);
      for (let twig = 0; twig < 10; twig++) {
        const x = w / 2 + (r() - .5) * width * 2, yy = y + r() * h * .06;
        g.fillStyle = css([42 + r() * 24, 81 + r() * 45, 52 + r() * 22]);
        g.beginPath(); g.ellipse(x, yy, width * (.25 + r() * .2), h * .025, (x - w / 2) / w * .7, 0, Math.PI * 2); g.fill();
      }
    }
    return;
  }
  const blooming = name.startsWith('bed') || name === 'dandelion' || name === 'shrubBloom';
  for (let i = 0; i < 25; i++) {
    const x = w * (.15 + r() * .7), y = h * (.25 + r() * .65), length = 20 + r() * 50;
    if (name.startsWith('tuft') || name === 'weed' || name === 'plantSword') blade(g, x, h * .9, x + (r() - .5) * 80, y - length, (r() - .5) * 20, 4 + r() * 5, [35, 85, 40], [140, 185, 83]);
    else {
      g.strokeStyle = css([60, 118, 48]); g.lineWidth = 2; g.beginPath(); g.moveTo(x, h * .9); g.lineTo(x, y); g.stroke();
      leaf(g, x, y + 14, length, length * .5, r() * Math.PI * 2, [65 + r() * 65, 110 + r() * 65, 42 + r() * 35]);
      if (blooming) {
        g.fillStyle = ['#e87c9d', '#bba6de', '#ffcc64', '#b2d9ee', '#f5d0e2', '#fff8df'][index % 6]!;
        for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; g.beginPath(); g.ellipse(x + Math.cos(a) * 7, y + Math.sin(a) * 7, 6, 4, a, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#e9ba55'; g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
      }
    }
  }
}]));
