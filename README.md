# GP08

鎌倉風の日本の街（桜・海・山）でのんびり暮らす、ブラウザ向け 3D ライフシミュレーションゲーム。Babylon.js で作っています。

現在は「段階0」（空のシーン、プレースホルダの家、カメラ操作、テスト基盤）です。

## セットアップ

```bash
npm ci
# 非公開アセット用リポジトリ creativeandcreative9/GP08-assets をこのリポジトリの隣にクローン
#   ../gp08-assets/ に zip が入っている状態にして、展開する
npm run assets:extract     # -> private-assets/seisen/
npm run dev                # http://127.0.0.1:5178/
npm test                   # Playwright スモークテスト
npm run shot               # screenshots/shot.png を保存
```

## 重要なルール（モデルデータの扱い）

- MMD モデルファイルは **非商用利用のライセンス** で提供されています。
- **再配布禁止**。この公開リポジトリには **絶対にコミットしない** でください（`private-assets/`、`*.pmx` などは `.gitignore` 済み）。
- モデルは非公開の `GP08-assets` リポジトリでのみ管理します。ビルド成果物 `dist/` にも含めません（開発・プレビューサーバーが `/private/` で配信するだけです）。
- モデルが写ったスクリーンショットもコミットしないでください。

## クレジット

- モデル：79 吹雪型（艦隊これくしょん）ver 3.2　作：とらはぜ
- 髪テクスチャ：APmod PageBoy【TES4 Mod】
