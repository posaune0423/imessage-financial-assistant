# STRUCTURE

## Purpose

This document fixes where code belongs in the trading-agent codebase so the repository stays easy to reason about as the Hyperliquid and Turnkey surface grows.

## Current Layout

```text
.
├── docs/
│   ├── DESIGN.md
│   ├── PRD.md
│   ├── STRUCTURE.md
│   ├── TECH.md
│   └── specs/
├── scripts/
├── src/
│   ├── agents/
│   │   ├── HEARTBEAT.md
│   │   ├── SOUL.md
│   │   ├── general-agent.ts
│   │   ├── heartbeat.ts
│   │   ├── memory.ts
│   │   ├── request-context.ts
│   │   ├── mcp/
│   │   └── tools/
│   ├── domain/
│   │   ├── trading/
│   │   ├── users/
│   │   └── wallets/
│   ├── lib/
│   │   ├── hyperliquid/
│   │   └── turnkey/
│   ├── repositories/
│   │   ├── interfaces/
│   │   └── sqlite/
│   ├── utils/
│   ├── config.ts
│   ├── di.ts
│   ├── env.ts
│   └── main.ts
├── tests/
│   ├── e2e/
│   ├── integration/
│   ├── setup.ts
│   └── unit/
└── data/  # gitignored runtime state
```

## Placement Rules

### `docs/`

Human-facing product and technical reference.

- `PRD.md`: product intent and scope
- `TECH.md`: compact technical truth
- `DESIGN.md`: end-to-end architecture and flows
- `STRUCTURE.md`: repository layout rules
- `specs/`: deeper issue or feature specs

### `src/agents/`

Agent-facing runtime assets and orchestration code.

- prompts and markdown instructions
- Mastra agent construction
- heartbeat engine
- request-context helpers
- tool definitions
- MCP runtime wiring

### `src/domain/`

Application business logic that should not depend on SDK constructors or raw SQL.

- user resolution rules
- wallet-domain behavior
- trading confirmation rules

### `src/lib/`

External-system adapters.

- Turnkey client, provisioning, signing, ownership-auth helpers
- Hyperliquid service and interfaces

### `src/repositories/`

Persistence boundary.

- `interfaces/`: repository contracts
- `sqlite/`: Drizzle schema and SQLite implementations

### `src/utils/`

Thin, reusable helpers only.

- logging
- phone normalization
- file loading
- process locking

### `src/main.ts`

Transport entrypoint and orchestration only.

- inbound message handling
- request-context assembly
- direct-message routing
- agent invocation
- reply handling

It should not own business rules that belong in `domain/` or external adapter setup that belongs behind `di.ts`.

### `src/di.ts`

Dependency composition root.

- repository setup
- Turnkey and Hyperliquid adapter wiring
- agent and tool runtime construction
- SDK construction

## Rules for New Code

- Put trading or wallet decisions in `src/domain`, not inside agent tools.
- Put exchange or wallet SDK details in `src/lib`, not inside `src/main.ts`.
- Put app-owned persistence schema in `src/repositories/sqlite`.
- Keep agent tools thin: they should call domain services or adapters, not instantiate SDKs directly.
- Keep docs aligned to the trading-agent concept. Do not reintroduce the old generic-template framing.
