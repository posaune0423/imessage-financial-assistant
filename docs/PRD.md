# PRD — iMessage × Mastra General Agent Template

**Version**: 1.0  
**Date**: 2026-03-21  
**Status**: Draft

---

## 1. What We Are Building

iMessage を UI として使う **汎用エージェントテンプレート**。  
ユーザーは iPhone/Mac から普通に iMessage を送ると AI が返信する。  
エージェントは会話記憶を持ち、ユーザーが何もしていなくても定期的にバックグラウンドで動き続ける。

**技術スタック**

| レイヤー  | ライブラリ                          | 役割                 |
| --------- | ----------------------------------- | -------------------- |
| Transport | `@photon-ai/imessage-kit`           | iMessage の送受信    |
| Agent     | `@mastra/core`                      | LLM エージェント実行 |
| Memory    | `@mastra/memory` + `@mastra/libsql` | 会話記憶の永続化     |
| Runtime   | Bun + TypeScript                    | 実行環境             |

---

## 2. Why

AI エージェントの典型的な問題は「チャット UI を開かないと何も起きない」こと。

このテンプレートを使うと：

- **慣れた UI**: 新しいアプリ不要、iMessage で使える
- **記憶あり**: 先週の話を覚えている
- **プロアクティブ**: 何か起きたら向こうから連絡してくる

---

## 3. 対象ユーザー

**一次ターゲット**: 自分用 AI アシスタントを作りたい開発者  
このテンプレートを fork して自分のユースケースに拡張する。

---

## 4. コア機能（P0）

### 4.1 iMessage で対話できる

```
User → [iMessage DM] → Agent → [iMessage DM] → User
```

- `sdk.startWatching({ onDirectMessage })` でメッセージを受信
- `agent.generate(text, { memory })` で応答を生成
- `sdk.send(sender, reply)` で返信
- 自分自身のメッセージには反応しない（`isFromMe: false` でフィルタ）
- `OWNER_PHONE` を設定した場合はその番号からのメッセージのみ受け付ける

### 4.2 会話を記憶する

- `resource` = 送信者の電話番号（ユーザー識別子）
- `thread` = `"default"`（メインの会話スレッド）
- 直近 20 メッセージの履歴を context に含める
- Working Memory でユーザー名・好みなどを永続保持する
- DB は `./data/agent.db`（LibSQL/SQLite ファイル）

### 4.3 Heartbeat で自律的に動く

- 設定した間隔（デフォルト 60 分）でエージェントが定期チェックを走らせる
- `HEARTBEAT.md` に書いたチェックリストを読んでエージェントのプロンプトに渡す
- **何もなければ `HEARTBEAT_OK` とだけ返す → メッセージを送らない（サイレント）**
- 何かあれば `OWNER_PHONE` に iMessage を送る
- アクティブ時間帯（デフォルト `08:00-22:00`）以外はスキップ

---

## 5. 拡張機能（P1）

### 5.1 Built-in Tools

エージェントが使えるツールを最初から同梱する：

| Tool ID        | 説明                                       |
| -------------- | ------------------------------------------ |
| `get-datetime` | 現在日時・タイムゾーンを返す               |
| `send-message` | エージェントが能動的に iMessage を送信する |
| `set-reminder` | Heartbeat state にリマインダーを保存する   |
| `web-search`   | Web 検索（スタブ。API キーがあれば動く）   |

### 5.2 Cron ワークフロー（スタブ）

- Mastra Workflow の `cron` プロパティで定期タスクのスタブを同梱
- デフォルト: 毎朝 9 時に日次サマリーを生成して送信するワークフロー
- Inngest を使う場合はそのまま接続できる設計

---

## 6. 対象外

- グループチャット対応
- マルチユーザー・マルチテナント
- Web UI / ダッシュボード
- 本番向け高可用性構成
- Privy ウォレット・オンチェーン機能

---

## 7. 環境変数

```bash
# 必須
ANTHROPIC_API_KEY=sk-ant-...
OWNER_PHONE=+819012345678         # エージェントが対話・通知する電話番号

# 任意（デフォルト値あり）
HEARTBEAT_INTERVAL_MS=3600000     # 1時間
HEARTBEAT_ACTIVE_START=08:00
HEARTBEAT_ACTIVE_END=22:00
DATABASE_URL=file:./data/agent.db
```

---

## 8. 完了基準（Definition of Done）

以下が全て満たされたらテンプレートとして完成：

- [ ] iMessage を送ると 10 秒以内に返信が来る
- [ ] 2 回目の会話で 1 回目の内容を参照できる
- [ ] `HEARTBEAT_OK` のときは iMessage が飛ばない
- [ ] 何かある heartbeat は iMessage に届く
- [ ] `bun run dev` 一発で起動する
- [ ] `bun run typecheck` がエラーゼロ
- [ ] `.env.example`・`HEARTBEAT.md`・`SOUL.md` が同梱されている

---

## 9. 開発フェーズ

```
Phase 1 (Day 1-2)  プロジェクトセットアップ + iMessage ↔ Agent 往復
Phase 2 (Day 3-4)  Memory 永続化 + Working Memory
Phase 3 (Day 5-6)  Heartbeat エンジン
Phase 4 (Day 7)    Built-in Tools + Cron スタブ
Phase 5 (Day 8)    README + 動作確認 + ドキュメント整備
```
