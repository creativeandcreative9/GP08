# GP08 リポジトリのルール（AI セッション向け）

- Babylon.js + Vite + TypeScript(strict) のブラウザ 3D ゲーム。公開リポジトリ。
- **モデルファイル（.pmx/.pmd/.vmd/.vpd、テクスチャ、zip）を絶対にコミット・コピーしない。** `public/` や `dist/` にも置かない。
- モデルが写ったスクリーンショットもコミットしない（`screenshots/` は ignore 済み）。
- 非公開アセットは `../gp08-assets` にあり、`npm run assets:extract` で `private-assets/` に展開する。開発・プレビュー時は `/private/...` で配信される（`vite.config.ts` の `privateAssets`、`GP08_PRIVATE_DIR` で場所を変更可）。
- `private-assets/` を移動・変更・削除しない。
- シーン構築は `src/scene.ts` の `createScene()` に追加する。デバッグ用フックは `window.__gp08`（`ready` / `frames` / `errors`）。

## 変更の確認方法

1. `npm run typecheck`
2. `npm test`
3. `npm run shot` を実行し、`screenshots/shot.png` を実際に見て確認する（`--query "?a=b"` `--wait` `--out` が使える）。

見た目の変更は `npm run eval -- --tag <日付>_<名前>` で比較カット5枚（`?view=ref1`〜`ref5`）を撮り、`docs/20261016_visual_eval.md` のルーブリックで採点する。

描画品質は `?gfx=high`（太陽の影・ブルーム・トーンマッピング）と `?gfx=low`（太陽の影と後処理なし、材質側の色調整は共通）。指定がないときは、ソフトウェア描画（ヘッドレスの SwiftShader など）なら low、GPU があれば high。`npm run eval` は high で撮る（1フレーム数秒かかるので待つ）。

ヘッドレス Chromium は GPU がないため、SwiftShader のフラグ（`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`）で起動する。`playwright install` は実行しない（`/opt/pw-browsers` に導入済み）。

## MMD モデル（babylon-mmd）

- 読み込みは `src/mmd.ts`。`?model=fubuki` などで非公開パックのモデルを表示する（キーは `MODELS` 参照）。
- `babylon-mmd/esm/Loader/mmdModelLoader` は `pmxLoader` より**先に** import する（後だとマテリアルが作られず灰色になる）。
- `vite.config.ts` の `optimizeDeps.exclude` に `babylon-mmd` と `@babylonjs/core` を入れておく（事前バンドルすると wasm のパスが壊れ、Babylon が二重に読み込まれて .pmx ローダーが見つからなくなる）。
- 物理は単一スレッド版（`MmdWasmInstanceTypeSPR`）。COOP/COEP ヘッダー不要。
- ワールドは MMD 単位（1 単位 ≒ 8 cm、重力 −98）で作る。
- 吹雪モデルは `909236cf3f194c11acca`（ファイル名が途中で切れている）と `u.jpg`（パックに無い）の 2 つのテクスチャ参照が 404 になる。見た目への影響は小さい。
