<div align="center">

# imessage-financial-assistant

**An iMessage-first Hyperliquid trading agent built with Photon, Mastra, Turnkey, and Hyperliquid.**

[![CI](https://github.com/posaune0423/imessage-financial-assistant/actions/workflows/ci.yml/badge.svg)](https://github.com/posaune0423/imessage-financial-assistant/actions/workflows/ci.yml)
[![Bun](https://img.shields.io/badge/Bun-1.3+-000?logo=bun&logoColor=fff)](https://bun.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=fff)](https://www.typescriptlang.org/)
[![Mastra](https://img.shields.io/badge/Mastra-Agent-111827)](https://mastra.ai)

[Repository](https://github.com/posaune0423/imessage-financial-assistant) · [Photon iMessage Kit](https://github.com/photon-hq/imessage-kit) · [Turnkey](https://www.turnkey.com/) · [Hyperliquid](https://hyperliquid.xyz/)

</div>

## Overview

`imessage-financial-assistant` is a macOS-hosted agent that lets a user interact with Hyperliquid from the most familiar possible interface: iMessage.

The product concept is straightforward:

1. A user sends a plain-text iMessage.
2. Photon receives the message from the local Messages runtime.
3. The app resolves that sender into an internal user and wallet context.
4. Turnkey provisions or reuses the user's wallet infrastructure.
5. A Mastra agent decides which tools to call.
6. Hyperliquid read or write actions are executed, and the result is returned as a plain-text iMessage reply.

This repository is no longer a generic assistant template. It is a purpose-built trading agent codebase centered on `iMessage -> agent -> wallet -> Hyperliquid`.

## Why iMessage

- No new UI to learn. The user stays inside Messages.
- Wallet lifecycle can stay invisible until it matters.
- Confirmation-driven trading fits plain-text chat surprisingly well.
- A local macOS runtime keeps the transport simple and inspectable.

## Current Capabilities

| Area                     | What the app does today                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| User resolution          | Maps `sender` and `chatId` to a stable user and `resourceKey` before every agent run.       |
| Wallet provisioning      | Creates or reuses a primary Turnkey-backed wallet on first contact.                         |
| Wallet visibility        | Exposes wallet status and primary address through built-in tools.                           |
| Hyperliquid reads        | Supports market snapshots, user summary, open orders, and recent fills.                     |
| Hyperliquid writes       | Supports place, cancel, modify, and leverage-update flows with explicit confirmation codes. |
| Agent memory             | Persists per-user conversation memory in SQLite / LibSQL through Mastra memory.             |
| iMessage operations      | Supports direct replies plus scheduling, reminders, and outbound iMessage tools.            |
| Optional onchain context | Can lazily attach Allium MCP toolsets for wallet / onchain / crypto-heavy requests.         |

## Trading Flow

For read-only requests, the agent can answer directly from wallet and Hyperliquid tools.

For signed actions, the app uses a confirmation gate:

1. The user asks to place, cancel, modify, or update leverage.
2. The tool returns a deterministic confirmation code and a compact execution summary.
3. The user must send the explicit code back in iMessage.
4. Only then does the app submit the Hyperliquid action.

This keeps the UX chat-native without allowing vague confirmations such as "ok" or "yes" to execute a trade.

## Architecture

```text
iMessage
  -> @photon-ai/imessage-kit watcher
  -> message router in src/main.ts
  -> user resolution + request context
  -> Mastra general-agent
  -> wallet / Hyperliquid / iMessage / MCP tools
  -> Turnkey + Hyperliquid + SQLite
  -> plain-text iMessage reply
```

The core architectural split is:

- `src/domain`: user and wallet business rules
- `src/lib`: Turnkey and Hyperliquid adapters
- `src/repositories/sqlite`: SQLite-backed source of truth for users and wallets
- `src/agents`: prompts, memory, heartbeat, MCP runtime, and tool definitions

## Requirements

| Requirement                | Notes                                                                   |
| -------------------------- | ----------------------------------------------------------------------- |
| macOS                      | Photon depends on the local Messages runtime.                           |
| Bun                        | This repo uses `bun@1.3.10`.                                            |
| Full Disk Access           | Required so Photon can access Messages data on macOS.                   |
| Anthropic API key          | Required for the default Mastra agent model.                            |
| Turnkey server credentials | Required at startup for wallet provisioning and signing infrastructure. |

`OWNER_PHONE` is still required, but it is no longer the inbound access gate. It remains the default owner target for proactive notifications and owner-scoped runtime behavior.

## Quick Start

```bash
git clone https://github.com/posaune0423/imessage-financial-assistant.git
cd imessage-financial-assistant
bun install
cp .env.example .env
```

Set the required environment variables:

```bash
ANTHROPIC_API_KEY=...
OWNER_PHONE=+819012345678
TURNKEY_ORGANIZATION_ID=...
TURNKEY_API_BASE_URL=https://api.turnkey.com
TURNKEY_API_PUBLIC_KEY=...
TURNKEY_API_PRIVATE_KEY=...
```

Common optional variables:

```bash
ANTHROPIC_MODEL=anthropic/claude-sonnet-4-6
DATABASE_URL=file:./data/agent.db
IMESSAGE_SCHEDULER_PERSIST_PATH=./data/imessage-scheduler.json
HEARTBEAT_INTERVAL_MS=3600000
HEARTBEAT_ACTIVE_START=08:00
HEARTBEAT_ACTIVE_END=22:00
HYPERLIQUID_NETWORK=mainnet
MULTI_USER_MODE=true
LOG_LEVEL=info
BRAVE_API_KEY=
ALLIUM_API_KEY=
MCP_TIMEOUT_MS=60000
```

Hyperliquid network modes:

- `mainnet`: default production behavior with mainnet API endpoints
- `testnet`: Hyperliquid testnet endpoints plus testnet-safe onboarding copy and trading context

This repository's testnet mode is Hyperliquid-focused. It does not add a separate Arbitrum Sepolia funding flow.

Turnkey server credentials are validated at startup. If the required Turnkey variables are missing or empty, the process fails before the message loop starts.

Then run the app:

```bash
bun run dev
```

## Status

This branch is aligned around the trading-agent concept rather than the original generic-template framing.

The codebase already contains the core trading path:

- multi-user request resolution
- automatic Turnkey wallet provisioning
- Hyperliquid read tools
- confirmation-gated Hyperliquid write tools

The main work on this branch is to keep implementation and documentation consistent as the product direction sharpens.

## Development

Main quality gate:

```bash
bun run check
```

Common commands:

```bash
bun run test
bun run test:unit
bun run test:integration
bun run test:e2e
bun run lint
bun run fmt:check
```

## Repository Layout

```text
docs/                  product and technical reference
src/agents/            agent prompts, memory, heartbeat, MCP, tool definitions
src/domain/            user and wallet business rules
src/lib/               Turnkey and Hyperliquid adapters
src/repositories/      SQLite persistence and repository interfaces
src/main.ts            message-loop entrypoint
tests/                 unit, integration, and e2e coverage
```

## Related Docs

- [docs/PRD.md](docs/PRD.md)
- [docs/TECH.md](docs/TECH.md)
- [docs/STRUCTURE.md](docs/STRUCTURE.md)
- [docs/DESIGN.md](docs/DESIGN.md)
- [docs/specs/issue-001-turnkey-hyperliquid-agent-design.md](docs/specs/issue-001-turnkey-hyperliquid-agent-design.md)

---

<div align="center">

<sub>Personal / experimental project. Respect privacy, local device security, exchange risk, and platform terms when automating Messages and trading actions.</sub>

</div>
