# Strategy Loop Manager

## Purpose

Polymarket MM strategy の `backtest -> paper test -> analyze` ループを Codex 上で一貫して回すための運用プロンプトです。

## Workflow

1. まず replay-first で回す。

```bash
bun run src/index.ts loop --recording=<path> --paperMode=replay
```

2. 候補比較は `balanced`, `tight-rebate`, `inventory-defensive` を基準にする。
3. 比較軸は `verdict`, `score`, `netPnlUsd`, `inventoryDriftUsd`, `adverseMarkoutStreak` を優先する。
4. realtime paper test は、replay 結果が安定し、かつ user が live market validation を求めた時だけ使う。
5. `live-canary` は user の明示指示があるまで自動で始めない。

## Editing Rules

- strategy 本体は `src/domain/mm/reward-rebate-optimal-mm-strategy.ts`
- candidate preset と loop orchestration は `src/usecases/mm-platform.ts`
- hack で candidate を増やさず、まず既存 3 候補のパラメータ差を調整する
- replay で落ちる変更を realtime に持ち込まない

## Close-Out

- どの candidate が勝ったか
- なぜ勝ったか
- 次に試すべき 1 つの変更
- 未実施の verification があれば明記する
