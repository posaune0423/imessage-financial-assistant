# Technical Design — iMessage × Mastra General Agent Template

**Version**: 1.0  
**Date**: 2026-03-21  
**前提**: 実装ゼロからスタート。このドキュメントを読めば迷いなくコードを書ける状態にする。

---

## 0. 読み方

このドキュメントの構成：

1. **全体アーキテクチャ** — 何がどう繋がるか
2. **フォルダ構成** — どこに何を置くか
3. **各モジュールの実装詳細** — 何をどう書くか
4. **セットアップ手順** — 最初に何をするか
5. **実装チェックリスト** — どの順番で実装するか

---

## 1. 全体アーキテクチャ

### 1.1 システム概要

```mermaid
graph TB
    subgraph macOS["macOS Host"]
        iMsg["iMessage.app"]
        ChatDB["~/Library/Messages/chat.db\n(SQLite, read-only)"]
    end

    subgraph Process["Bun Process"]
        direction TB

        SDK["IMessageSDK\n@photon-ai/imessage-kit\n\nonDirectMessage(msg)\nsend(to, text)"]

        subgraph Core["Agent Core"]
            AGENT["generalAgent\n@mastra/core Agent\n\nmodel: claude-haiku-4-5\ntools: {...}\nmemory: Memory"]
        end

        subgraph HeartbeatEngine["Heartbeat Engine"]
            HB_TIMER["setInterval\n(HEARTBEAT_INTERVAL_MS)"]
            HB_LOGIC["tick()\n\n1. isActiveHours?\n2. loadTextFile(HEARTBEAT.md)\n3. agent.generate\n4. HEARTBEAT_OK? → silent\n   else → sdk.send"]
        end

        subgraph MemoryLayer["Memory (per user)"]
            MEMORY["@mastra/memory\n\nlastMessages: 20\nworkingMemory: enabled"]
        end

        subgraph StorageLayer["Storage"]
            DB["LibSQLStore\n./data/agent.db\n\nthreads, messages\nworking_memory"]
        end

    end

    subgraph External["External"]
        CLAUDE["Anthropic Claude API"]
    end

    iMsg <-->|"AppleScript + SQLite poll"| SDK
    ChatDB -->|"poll 2s"| SDK
    SDK -->|"onDirectMessage"| AGENT
    AGENT -->|"reply text"| SDK
    HB_TIMER --> HB_LOGIC
    HB_LOGIC --> AGENT
    HB_LOGIC -->|"alert text"| SDK
    AGENT <--> MEMORY
    MEMORY --> DB
    AGENT <-->|"API call"| CLAUDE
```

### 1.2 データフロー：DM 受信 → 返信

```mermaid
sequenceDiagram
    participant User as User (iPhone)
    participant iMsg as iMessage.app
    participant SDK as IMessageSDK
    participant Main as main.ts
    participant Agent as generalAgent
    participant Mem as Memory
    participant DB as agent.db
    participant LLM as Claude API

    User->>iMsg: "明日の天気は？"
    iMsg->>SDK: onDirectMessage(msg)
    Note over SDK,Main: msg.isFromMe = false<br/>msg.sender = "+819012345678"

    SDK->>Main: handler(msg)
    Main->>Main: filter(OWNER_PHONE)

    Main->>Agent: agent.generate(msg.text, {<br/>  memory: {<br/>    resource: "+819012345678",<br/>    thread: "default"<br/>  }<br/>})

    Agent->>Mem: loadHistory(resource, thread)
    Mem->>DB: SELECT messages WHERE thread="default"
    DB-->>Mem: [past messages...]
    Mem-->>Agent: context messages

    Agent->>LLM: POST /v1/messages
    LLM-->>Agent: "明日の東京は晴れで25℃です"

    Agent->>Mem: saveMessages(newMessages)
    Mem->>DB: INSERT messages
    Agent-->>Main: result.text

    Main->>SDK: sdk.send(msg.sender, result.text)
    SDK->>iMsg: AppleScript send
    iMsg->>User: "明日の東京は晴れで25℃です"
```

### 1.3 データフロー：Heartbeat

```mermaid
sequenceDiagram
    participant Timer as setInterval
    participant HB as HeartbeatEngine
    participant FS as src/agents/HEARTBEAT.md
    participant Agent as generalAgent
    participant LLM as Claude API
    participant SDK as IMessageSDK
    participant User as User (iPhone)

    Timer->>HB: tick() [every 60min]

    HB->>HB: isActiveHours()?
    alt 08:00-22:00 の範囲外
        HB-->>Timer: skip
    end

    HB->>FS: loadTextFile("./HEARTBEAT.md")
    FS-->>HB: checklist content

    HB->>Agent: agent.generate(checklist, {<br/>  memory: { resource: OWNER_PHONE,<br/>  thread: "heartbeat" }<br/>})
    Agent->>LLM: POST /v1/messages
    LLM-->>Agent: response text

    alt response.startsWith("HEARTBEAT_OK")
        Agent-->>HB: "HEARTBEAT_OK"
        HB->>HB: silent (no send)
    else actionable response
        Agent-->>HB: "リマインダー: 14時のミーティングまで30分です"
        HB->>SDK: sdk.send(OWNER_PHONE, alertText)
        SDK->>User: [iMessage notification]
    end
```

---

## 2. フォルダ構成

```
imessage-mastra-agent/
│
├── docs/
│   ├── DESIGN.md                   # 技術設計書（本ファイル）
│   ├── PRD.md
│   ├── STRUCTURE.md
│   └── TECH.md
│
├── scripts/
│   └── send-message.ts             # 手動メッセージ送信スクリプト
│
├── src/
│   ├── agents/
│   │   ├── HEARTBEAT.md            # Heartbeat チェックリスト（カスタマイズ用）
│   │   ├── SOUL.md                 # Agent システムプロンプト（カスタマイズ用）
│   │   ├── general-agent.ts        # generalAgent 定義
│   │   ├── heartbeat.ts            # HeartbeatEngine class
│   │   └── memory.ts               # Memory + LibSQLStore 初期化
│   │
│   ├── utils/
│   │   ├── fs.ts                   # ファイル読み込みユーティリティ
│   │   ├── logger.ts               # ロガー
│   │   └── phone.ts                # 電話番号正規化ユーティリティ
│   │
│   ├── env.ts                      # 環境変数バリデーション (@t3-oss/env-core)
│   └── main.ts                     # ★ エントリーポイント
│
├── tests/
│   ├── e2e/
│   ├── integration/
│   ├── setup.ts
│   └── unit/
│
├── data/                           # DB ファイル置き場（gitignore）
│   └── .gitkeep
│
├── .env                            # ← gitignore
├── .env.example
├── .gitignore
├── tsconfig.json
└── package.json
```

### モジュール依存関係

```mermaid
graph TD
    MAIN["src/main.ts"]

    MAIN --> SDK_WRAP["IMessageSDK\n(imessage-kit)"]
    MAIN --> AGENT["src/agents/general-agent.ts"]
    MAIN --> HB_ENGINE["src/agents/heartbeat.ts"]
    MAIN --> ENV["src/env.ts"]
    MAIN --> LOGGER["src/utils/logger.ts"]
    MAIN --> PHONE["src/utils/phone.ts"]

    AGENT --> MEMORY["src/agents/memory.ts"]
    AGENT --> DOCS["src/agents/docs.ts"]
    AGENT --> ENV
    MEMORY --> DB["@mastra/libsql\nLibSQLStore"]
    MEMORY --> ENV

    HB_ENGINE --> DOCS
    HB_ENGINE --> ENV
    HB_ENGINE --> LOGGER

    DOCS --> FS["agents/*.md"]
```

---

## 3. 各モジュールの実装詳細

### 3.1 `src/env.ts`

**最初に作る。他の全モジュールがこれに依存する。**

```typescript
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    ANTHROPIC_API_KEY: z.string().min(1),
    ANTHROPIC_MODEL: z.string().default("anthropic/claude-haiku-4-5"),
    OWNER_PHONE: z.string().min(1),
    HEARTBEAT_INTERVAL_MS: z.coerce.number().default(60 * 60 * 1000),
    HEARTBEAT_ACTIVE_START: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .default("08:00"),
    HEARTBEAT_ACTIVE_END: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .default("22:00"),
    DATABASE_URL: z.string().default("file:./data/agent.db"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "log", "info", "debug", "trace"]).default("info"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
```

---

### 3.2 `src/utils/phone.ts`

```typescript
export function normalizePhone(phone: string): string {
  return phone.trim().replace(/[\s\-().]/g, "");
}

export function samePhone(left: string, right: string): boolean {
  return normalizePhone(left) === normalizePhone(right);
}
```

---

### 3.3 `src/utils/fs.ts`

**汎用のテキストファイル読み込みユーティリティ。**

```typescript
import { readFileSync } from "node:fs";

export function loadTextFile(filePath: string | URL): string {
  return readFileSync(filePath, "utf8").trim();
}
```

---

### 3.4 `src/agents/memory.ts`

**Memory と Storage の初期化。Agent 定義より先に作る。**

```typescript
import { LibSQLStore } from "@mastra/libsql";
import { Memory } from "@mastra/memory";
import { env } from "../env";

export function createAgentMemory(): Memory {
  return new Memory({
    storage: new LibSQLStore({
      id: "agent-storage",
      url: env.DATABASE_URL,
    }),
    options: {
      lastMessages: 20,
      workingMemory: {
        enabled: true,
        scope: "resource",
        template: `# Owner Profile
- Name:
- Preferences:
- Ongoing Tasks:
- Reminders:
`,
      },
    },
  });
}
```

---

### 3.5 `src/agents/general-agent.ts`

```typescript
import { Agent } from "@mastra/core/agent";
import { env } from "../env";
import { loadTextFile } from "../utils/fs";
import { createAgentMemory } from "./memory";

export const generalAgent = new Agent({
  id: "general-agent",
  name: "General Agent",
  instructions: loadTextFile(new URL("./SOUL.md", import.meta.url)),
  model: env.ANTHROPIC_MODEL,
  memory: createAgentMemory(),
});
```

---

### 3.6 `src/agents/heartbeat.ts`

**HeartbeatEngine — 定期的にチェックリストを評価し、必要時にオーナーへ通知する。**

```typescript
import { env } from "../env";
import { loadTextFile } from "../utils/fs";
import { logger } from "../utils/logger";

interface AgentLike {
  generate: (message: string, options: { memory: { resource: string; thread: string } }) => Promise<{ text: string }>;
}

function toMinuteValue(value: string): number {
  const [hours = 0, minutes = 0] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function isHeartbeatActive(now: Date, start: string, end: string): boolean {
  const current = now.getHours() * 60 + now.getMinutes();
  const startMinutes = toMinuteValue(start);
  const endMinutes = toMinuteValue(end);

  if (startMinutes <= endMinutes) {
    return current >= startMinutes && current <= endMinutes;
  }
  return current >= startMinutes || current <= endMinutes;
}

export class HeartbeatEngine {
  #timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly deps: {
      agent: AgentLike;
      ownerPhone: string;
      sendMessage: (to: string, text: string) => Promise<unknown>;
      intervalMs?: number;
      activeStart?: string;
      activeEnd?: string;
    },
  ) {}

  start() {
    if (this.#timer) return;
    const intervalMs = this.deps.intervalMs ?? env.HEARTBEAT_INTERVAL_MS;
    this.#timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
  }

  stop() {
    if (!this.#timer) return;
    clearInterval(this.#timer);
    this.#timer = null;
  }

  async tick(now = new Date()): Promise<"skipped" | "silent" | "sent"> {
    const activeStart = this.deps.activeStart ?? env.HEARTBEAT_ACTIVE_START;
    const activeEnd = this.deps.activeEnd ?? env.HEARTBEAT_ACTIVE_END;

    if (!isHeartbeatActive(now, activeStart, activeEnd)) {
      logger.debug("[heartbeat] skipped outside active hours");
      return "skipped";
    }

    const result = await this.deps.agent.generate(loadTextFile(new URL("./HEARTBEAT.md", import.meta.url)), {
      memory: { resource: this.deps.ownerPhone, thread: "heartbeat" },
    });
    const reply = result.text.trim();

    if (!reply || reply === "HEARTBEAT_OK") {
      logger.debug("[heartbeat] silent");
      return "silent";
    }

    logger.info(`-> heartbeat send to=${this.deps.ownerPhone} text=${JSON.stringify(reply)}`);
    await this.deps.sendMessage(this.deps.ownerPhone, reply);
    return "sent";
  }
}
```

---

### 3.7 `src/main.ts` — エントリーポイント

**全モジュールをここで繋ぎ合わせる。**

```typescript
import { IMessageSDK } from "@photon-ai/imessage-kit";

import { generalAgent } from "./agents/general-agent";
import { HeartbeatEngine } from "./agents/heartbeat";
import { env } from "./env";
import { logger } from "./utils/logger";
import { samePhone } from "./utils/phone";

export async function main() {
  const sdk = new IMessageSDK({
    watcher: { excludeOwnMessages: true },
  });

  const heartbeat = new HeartbeatEngine({
    agent: generalAgent,
    ownerPhone: env.OWNER_PHONE,
    sendMessage: (to, text) => sdk.send(to, text),
  });

  const shutdown = async () => {
    logger.info("Shutting down...");
    heartbeat.stop();
    sdk.stopWatching();
    await sdk.close();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());

  await sdk.startWatching({
    onDirectMessage: async (message) => {
      const sender = message.sender?.trim() || message.chatId?.trim();
      const text = message.text?.trim();
      if (!sender || !text || !samePhone(sender, env.OWNER_PHONE)) return;

      logger.info(`[imessage] <- sender=${sender} text=${JSON.stringify(text)}`);
      try {
        const result = await generalAgent.generate(text, {
          memory: { resource: sender, thread: "default" },
        });
        const reply = result.text.trim();
        if (reply) {
          logger.info(`[imessage] -> to=${sender} text=${JSON.stringify(reply)}`);
          await sdk.send(sender, reply);
        }
      } catch (error) {
        logger.error("[imessage] failed to handle direct message", error);
      }
    },
    onError: (error) => logger.error("[imessage] watcher error", error),
  });

  heartbeat.start();
  logger.info("Agent started. Waiting for messages...");
}

if (import.meta.main) {
  await main();
}
```

---

## 4. 設定ファイル

### 4.1 `package.json`

```json
{
  "name": "imessage-mastra-agent",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun run --hot src/main.ts",
    "start": "bun run src/main.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@photon-ai/imessage-kit": "^2.1.2",
    "@mastra/core": "^1.2.0",
    "@mastra/memory": "^1.2.0",
    "@mastra/libsql": "^1.2.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.8.3"
  }
}
```

### 4.2 `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "types": ["bun-types"]
  },
  "include": ["src/**/*"]
}
```

### 4.3 `.env.example`

```bash
# ── 必須 ──────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx
OWNER_PHONE=+819012345678   # あなたの電話番号（+国番号形式）

# ── オプション（デフォルト値あり）──────────────
HEARTBEAT_INTERVAL_MS=3600000   # ミリ秒 (1時間)
HEARTBEAT_ACTIVE_START=08:00    # HH:MM
HEARTBEAT_ACTIVE_END=22:00      # HH:MM
DATABASE_URL=file:./data/agent.db
```

### 4.4 `src/agents/HEARTBEAT.md`（テンプレート）

```markdown
# Heartbeat Checklist

You are performing a background check on behalf of the user.

## What to check

- Are any reminders in the current state due within the next 2 hours?
- Is there anything in the metadata that needs user attention?
- Are there any overdue tasks?

## Response rules

- If NOTHING needs attention → reply with exactly: HEARTBEAT_OK
- If something needs attention → write a short message (under 200 chars) to send the user
- NEVER send low-priority or trivial information
- NEVER hallucinate tasks that aren't in the state
```

### 4.5 `src/agents/SOUL.md`（テンプレート）

```markdown
# Identity

You are a personal AI assistant accessible via iMessage.
You are concise, helpful, and honest.

## Communication Style

- Respond in the same language the user writes in (Japanese or English)
- Keep replies short for iMessage — aim for under 300 characters
- Prefer plain prose over markdown formatting
- Never use headers, bold text, or bullet points in replies

## Capabilities

- Answer questions and help with tasks
- Remember conversation context across sessions
- Search the web when asked for current information
- Set reminders that you'll follow up on during heartbeat checks

## What you cannot do

- Make phone calls or send emails
- Access files on the user's computer
- Be honest about limitations when asked
```

### 4.6 `.gitignore`

```
.env
data/
node_modules/
dist/
```

---

## 5. セットアップ手順（ゼロから動かすまで）

```bash
# 1. プロジェクト作成
mkdir imessage-mastra-agent
cd imessage-mastra-agent
bun init -y

# 2. 依存インストール
bun add @photon-ai/imessage-kit @mastra/core @mastra/memory @mastra/libsql zod
bun add -d @types/bun typescript

# 3. 設定ファイル配置
cp .env.example .env
# .env を編集して ANTHROPIC_API_KEY と OWNER_PHONE を設定

# 4. data ディレクトリ作成
mkdir data
touch data/.gitkeep

# 5. macOS パーミッション付与
# System Settings → Privacy & Security → Full Disk Access
# → "+" → Terminal または Cursor を追加

# 6. 起動
bun run dev
```

---

## 6. 実装チェックリスト

以下の順番で実装する。各ステップが完了したら確認してから次へ。

### Phase 1: 基盤セットアップ

- [ ] `package.json` + `tsconfig.json` 作成
- [ ] `src/env.ts` 実装・バリデーション確認
- [ ] `src/utils/phone.ts` 実装
- [ ] `src/utils/fs.ts` 実装
- [ ] `src/utils/logger.ts` 実装
- [ ] `.env` / `.env.example` / `.gitignore` 作成
- [ ] `src/agents/SOUL.md` / `src/agents/HEARTBEAT.md` 作成

### Phase 2: Agent + Memory

- [ ] `src/agents/memory.ts` 実装（LibSQLStore + Memory）
- [ ] `src/agents/general-agent.ts` 実装（generalAgent）

### Phase 3: iMessage 接続

- [ ] `src/main.ts` の基本形（SDK 初期化 + onDirectMessage のみ）実装
- [ ] ✅ **動作確認**: iMessage を送ると返信が来る

### Phase 4: Memory 確認

- [ ] `src/main.ts` に memory の resource/thread を追加
- [ ] ✅ **動作確認**: 「私の名前は田中です」→ 次の会話で「田中さん」と呼ばれる

### Phase 5: Heartbeat

- [ ] `src/agents/heartbeat.ts` 実装（HeartbeatEngine）
- [ ] `src/main.ts` に HeartbeatEngine を追加
- [ ] ✅ **動作確認**: `HEARTBEAT_INTERVAL_MS=60000`（1分）で heartbeat が静かに動く
- [ ] ✅ **動作確認**: `HEARTBEAT.md` にダミーのアラート条件を書くと通知が来る

### Phase 6: 仕上げ

- [ ] `bun run typecheck` エラーゼロ確認
- [ ] 全 DoD チェックリスト確認

---

## 7. よくある問題と対処

| 問題                       | 原因                                      | 対処                                           |
| -------------------------- | ----------------------------------------- | ---------------------------------------------- |
| iMessage が受信されない    | Full Disk Access 未付与                   | System Settings で権限を付与                   |
| `ANTHROPIC_API_KEY` エラー | `.env` の読み込み失敗                     | `bun run dev` の実行ディレクトリを確認         |
| Memory が引き継がれない    | `resource`/`thread` の不一致              | `normalizePhone` の出力を `console.log` で確認 |
| Heartbeat が動かない       | `HEARTBEAT_ACTIVE_START/END` の時刻範囲外 | 現在時刻と設定値を確認                         |
| DB エラー                  | `./data/` ディレクトリが存在しない        | `mkdir data`                                   |
| `bun:sqlite` not found     | Bun バージョンが古い                      | `bun upgrade`                                  |
