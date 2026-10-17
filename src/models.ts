/** Models in the private asset pack (private-assets/seisen). Never shipped in the public build. */
export const MODELS = {
  fubuki: 'seisen/清泉吹雪太眉LO.pmx',
  hatsuyuki: 'seisen/清泉初雪太眉LO.pmx',
  shirayuki: 'seisen/清泉白雪LO太眉.pmx',
  miyuki: 'seisen/清泉深雪太眉LO.pmx',
  uranami: 'seisen/清泉浦波太眉LO.pmx',
  mogami: 'seisen/清泉もがみん太眉LO.pmx',
  reiko: 'seisen/清泉玲子太眉LO.pmx',
} as const;

export type ModelKey = keyof typeof MODELS;

export function isModelKey(key: string): key is ModelKey {
  return Object.hasOwn(MODELS, key);
}

/** URL of a file in the private asset pack, served by the dev/preview server. */
export function modelUrl(path: string): string {
  return `/private/${path.split('/').map(encodeURIComponent).join('/')}`;
}
