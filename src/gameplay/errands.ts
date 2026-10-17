/** Stable names and delivery offers, derived from generated resident IDs rather than save-file text. */
export const validResident = (id: unknown): id is string => typeof id === 'string' && /^resident-(0|[1-9]\d{0,3})$/.test(id);

const FAMILIES = ['佐倉', '海野', '木下', '小川', '山本', '松田', '藤原', '高橋', '森', '田中', '石井', '青木'];
const GIVEN = ['はる', 'あおい', 'ゆう', 'なつき', 'まこと', 'ひなた', 'かえで', 'つばさ', 'みずき', 'れん', 'ちひろ', 'そら', 'いずみ', 'つむぎ', 'なお', 'あきら'];

export function residentName(id: string): string {
  if (!validResident(id)) return '街の住人';
  const n = Number(id.slice('resident-'.length));
  return `${FAMILIES[n % FAMILIES.length]} ${GIVEN[Math.floor(n / FAMILIES.length) % GIVEN.length]}`;
}

export const SHOPS = {
  'e-wagashi': { name: '和菓子屋', line: 'いらっしゃい。桜の季節には三色だんごがいちばん。お茶と一緒にどうぞ。' },
  'w-conbini': { name: 'コンビニ', line: 'いらっしゃいませ。お散歩のお供に、おにぎりはいかがですか？' },
  'w-cafe': { name: '喫茶 はるいろ', line: 'こんにちは。淹れたてのコーヒーを持って、海辺を歩くのもおすすめですよ。' },
} as const;

const OFFERS = [
  { shop: 'e-wagashi', parcel: 'お菓子の注文票', reward: 400 },
  { shop: 'w-conbini', parcel: '商店会のお知らせ', reward: 400 },
  { shop: 'w-cafe', parcel: 'レシピのメモ', reward: 400 },
] as const;
export type ErrandOffer = (typeof OFFERS)[number];

export function errandFor(resident: string): ErrandOffer | undefined {
  return validResident(resident) ? OFFERS[Number(resident.slice('resident-'.length)) % OFFERS.length] : undefined;
}
