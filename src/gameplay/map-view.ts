import { COAST, LOTS, MOUNTAIN_FOOT, PLAZA, PX, RAILWAY, ROADS, STATION, type WorldXZ } from '../town/layout';
import { worldToMap, type MapPlace } from './map';

const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, text = ''): SVGElementTagNameMap[K] => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  node.textContent = text;
  return node;
};
const points = (values: readonly (readonly [number, number])[]): string => values.map(p => p.join(',')).join(' ');

/** A schematic built from the same layout as the town. No model or map image assets. */
export function townMap(player: WorldXZ, places: readonly MapPlace[], destination?: string, delivery?: string, route: readonly WorldXZ[] = []): SVGSVGElement {
  const p = worldToMap(player);
  // Expand for an outlying player instead of pinning a false position to the edge.
  const left = Math.min(-180, p.x - 65), top = Math.min(-30, p.y - 65);
  const right = Math.max(1450, p.x + 65), bottom = Math.max(1120, p.y + 65);
  const map = svg('svg', {
    viewBox: `${left} ${top} ${right - left} ${bottom - top}`, class: 'life-map',
    role: 'img', 'aria-label': '街の地図。北が上。青は現在地、番号は目的地一覧に対応。',
  });
  map.append(svg('rect', { x: left, y: top, width: right - left, height: bottom - top, fill: '#f0e9d8' }));
  map.append(svg('polygon', { points: `${left},${top} ${right},${top} ${right},70 ${points([...COAST].reverse())} ${left},255`, fill: '#aed9de' }));
  map.append(svg('polyline', { points: points(COAST), fill: 'none', stroke: '#f5d69e', 'stroke-width': 23 }));
  map.append(svg('polygon', { points: `${left},580 ${points(MOUNTAIN_FOOT)} ${left},${bottom}`, fill: '#a9bf94' }));
  for (const lot of LOTS) map.append(svg('rect', {
    x: lot.x - lot.w / 2, y: lot.y - lot.d / 2, width: lot.w, height: lot.d, rx: 5,
    fill: lot.kind === 'park' ? '#bdd0a3' : lot.kind === 'public' ? '#b7c7cd' : '#d5c6b4',
  }));
  map.append(svg('ellipse', { cx: PLAZA.x, cy: PLAZA.y, rx: PLAZA.rx, ry: PLAZA.ry, fill: '#c5d6ae' }));
  for (const road of ROADS) map.append(svg('polyline', {
    points: points(road.points), fill: 'none', stroke: '#fffdf5', 'stroke-width': road.width / PX + 3,
    'stroke-linejoin': 'round',
  }));
  map.append(svg('polyline', { points: points(RAILWAY), fill: 'none', stroke: '#69756b', 'stroke-width': 8 }));
  map.append(svg('polyline', { points: points(RAILWAY), fill: 'none', stroke: '#f0e9d8', 'stroke-width': 4, 'stroke-dasharray': '10 10' }));
  map.append(svg('rect', { x: STATION.x0, y: STATION.y0, width: STATION.x1 - STATION.x0, height: STATION.y1 - STATION.y0, rx: 6, fill: '#819a9a' }));
  for (const [label, x, y] of [['海', 700, 90], ['桜の公園', 650, 555], ['住宅街', 1070, 920], ['山', 65, 750]] as const) {
    map.append(svg('text', { x, y, 'text-anchor': 'middle', class: 'life-map-label' }, label));
  }
  map.append(svg('text', { x: 1350, y: 500, 'text-anchor': 'middle', class: 'life-map-label' }, '↑ 北'));
  const scale = 100 / (0.08 * PX);
  map.append(svg('path', { d: `M 1000 1040 v 10 h ${scale} v -10`, fill: 'none', stroke: '#455e54', 'stroke-width': 3 }));
  map.append(svg('text', { x: 1000 + scale / 2, y: 1085, 'text-anchor': 'middle', class: 'life-map-label' }, '100m'));
  if (route.length > 1) map.append(svg('polyline', { points: route.map(worldToMap).map(p => `${p.x},${p.y}`).join(' '), fill: 'none', stroke: '#356b59', 'stroke-width': 6, 'stroke-linejoin': 'round', 'data-route': '' }));
  places.forEach((place, i) => {
    const point = worldToMap(place);
    const group = svg('g', { 'data-place': place.id });
    group.append(svg('title', {}, `${i + 1} ${place.name}${place.id === delivery ? '（配達先）' : ''}`));
    if (place.id === destination) group.append(svg('circle', { cx: point.x, cy: point.y, r: 35, fill: 'none', stroke: '#356b59', 'stroke-width': 5 }));
    group.append(svg('circle', { cx: point.x, cy: point.y, r: 24, fill: place.id === delivery ? '#9a4f36' : place.kind === 'shop' ? '#596c47' : '#627b83', stroke: '#fffdf5', 'stroke-width': 4 }));
    group.append(svg('text', { x: point.x, y: point.y + 10, 'text-anchor': 'middle', class: 'life-map-number' }, String(i + 1)));
    map.append(group);
  });
  const current = svg('g', { 'data-current': '', transform: `translate(${p.x} ${p.y})` });
  current.append(svg('title', {}, '現在地'), svg('circle', { r: 17, fill: '#236db1', stroke: '#fff', 'stroke-width': 5 }));
  map.append(current);
  return map;
}
