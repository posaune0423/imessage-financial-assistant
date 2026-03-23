<div align="center">

# imessage-financial-assistant

**A compact iMessage-first personal agent template built with Mastra on macOS.**

[![CI](https://github.com/posaune0423/imessage-financial-assistant/actions/workflows/ci.yml/badge.svg)](https://github.com/posaune0423/imessage-financial-assistant/actions/workflows/ci.yml)
[![Bun](https://img.shields.io/badge/Bun-1.3+-000?logo=bun&logoColor=fff)](https://bun.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=fff)](https://www.typescriptlang.org/)
[![Mastra](https://img.shields.io/badge/Mastra-Agent-111827)](https://mastra.ai)
[![Anthropic](https://img.shields.io/badge/Anthropic-Claude-D97706)](https://platform.claude.com/docs/en/home)
[![Brave Search](https://img.shields.io/badge/Brave-Search%20API-F97316)](https://brave.com/search/api/)

[Repository](https://github.com/posaune0423/imessage-financial-assistant) · [Mastra](https://mastra.ai) · [Photon iMessage Kit](https://github.com/photon-hq/imessage-kit)

</div>

## Overview

`imessage-financial-assistant` is a small, inspectable template for running an AI assistant through iMessage. It listens to direct messages from a configured owner phone number, responds with a Mastra agent, persists conversation memory in SQLite/LibSQL, and can proactively act outside the chat loop through heartbeat, reminder, scheduled-message, and MCP-backed workflows.

This repository is intentionally narrow in scope: one user, one local macOS runtime, one agent process, and a codebase that is easy to read and modify.

## Agent Capabilities

| Capability              | What it does                                                                      | Notes                                                          |
| ----------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Direct iMessage replies | Handles inbound owner messages and sends plain-text replies back over iMessage.   | Runs on local macOS via `@photon-ai/imessage-kit`.             |
| Memory                  | Persists conversation context and recent thread history.                          | Backed by `@mastra/memory` and `@mastra/libsql`.               |
| Heartbeat               | Runs periodic proactive checks and stays silent when there is nothing to report.  | Returns `HEARTBEAT_OK` for no-op cycles.                       |
| Reminder                | Creates follow-up reminders from relative, natural-language, or exact timestamps. | Supports listing and cancellation.                             |
| Schedule                | Queues one-time or recurring iMessages for future delivery.                       | Supports list, reschedule, and cancel flows.                   |
| MCP                     | Connects external toolsets when domain-specific capabilities are needed.          | Includes Allium MCP wiring as the built-in example.            |
| Web access              | Searches or fetches live web content for current information.                     | `brave-search` is optional; `brave-fetch` is always available. |

## Tech Stack

| Layer               | Technology                                                           | Purpose                                       |
| ------------------- | -------------------------------------------------------------------- | --------------------------------------------- |
| Runtime             | [Bun](https://bun.com)                                               | App runtime, scripts, package management      |
| Language            | [TypeScript](https://www.typescriptlang.org/)                        | Typed application code                        |
| Agent runtime       | [Mastra](https://mastra.ai) (`@mastra/core`)                         | Agent orchestration, tool execution           |
| LLM provider        | [Anthropic API](https://platform.claude.com/docs/en/home)            | Claude model access for the main agent        |
| Messaging transport | [@photon-ai/imessage-kit](https://github.com/photon-hq/imessage-kit) | iMessage receive/send, scheduler, reminders   |
| Memory              | `@mastra/memory`                                                     | Conversation memory layer                     |
| Storage             | `@mastra/libsql`                                                     | SQLite/LibSQL-backed persistence              |
| Web search          | [Brave Search API](https://brave.com/search/api/)                    | Optional live search tool                     |
| MCP client          | `@mastra/mcp`                                                        | Remote toolset connectivity                   |
| Example MCP server  | [Allium MCP](https://mcp.allium.so)                                  | Optional onchain / blockchain toolset example |
| Validation          | `zod`, `@t3-oss/env-core`                                            | Runtime-safe env and input validation         |
| Tests / quality     | `vite-plus` (`vp`) + Vitest                                          | Lint, typecheck, unit/integration/e2e tests   |

## Architecture

```text
iMessage DM -> IMessageSDK watcher -> Mastra agent -> tools / MCP -> iMessage reply
                                      |                |
                                      |                +-> Brave Search / Brave Fetch
                                      |
                                      +-> SQLite / LibSQL memory
                                      +-> Heartbeat engine
                                      +-> Scheduler / reminders
```

## Requirements

| Requirement            | Notes                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| macOS                  | The transport depends on the local Messages database and AppleScript-compatible iMessage automation.                                                                                       |
| [Bun](https://bun.com) | Repository runtime and package manager (`bun@1.3.10`).                                                                                                                                     |
| TypeScript             | Peer dependency (`^5`).                                                                                                                                                                    |
| Full Disk Access       | Terminal / IDE needs access so `@photon-ai/imessage-kit` can read local Messages data. See the upstream [permission guide](https://github.com/photon-hq/imessage-kit#granting-permission). |
| Anthropic API key      | Required for the default Claude-backed agent.                                                                                                                                              |

## Quick Start

```bash
git clone https://github.com/posaune0423/imessage-financial-assistant.git
cd imessage-financial-assistant
bun install
```

Create a `.env` file with the values you need:

```bash
# required
ANTHROPIC_API_KEY=...
OWNER_PHONE=+819012345678

# optional
ANTHROPIC_MODEL=anthropic/claude-haiku-4-5
DATABASE_URL=file:./data/agent.db
IMESSAGE_SCHEDULER_PERSIST_PATH=./data/imessage-scheduler.json
HEARTBEAT_INTERVAL_MS=3600000
HEARTBEAT_ACTIVE_START=08:00
HEARTBEAT_ACTIVE_END=22:00
LOG_LEVEL=info
BRAVE_API_KEY=
ALLIUM_API_KEY=
MCP_TIMEOUT_MS=60000
```

Then start the agent:

```bash
bun run dev
```

For a production-style run:

```bash
bun run start
```

## Optional Integrations

### Brave Search

Set `BRAVE_API_KEY` to enable the live `brave-search` tool. This is intended for requests that depend on current information. The repository also includes `brave-fetch` for fetching page contents from a known URL.

### Anthropic API

The default model is `anthropic/claude-haiku-4-5`, configured through `ANTHROPIC_MODEL`. Any compatible Anthropic-backed model string can be supplied through the same environment variable.

### MCP

Set `ALLIUM_API_KEY` to enable the built-in Allium MCP server at `https://mcp.allium.so`. Additional MCP servers should be added under [`src/agents/mcp/`](src/agents/mcp/) and wired through [`src/agents/mcp/index.ts`](src/agents/mcp/index.ts).

## Development

Run the main quality gate:

```bash
bun run check
```

Common commands:

```bash
bun run fmt
bun run lint
bun run test
bun run test:unit
bun run test:integration
bun run test:e2e
```

Current automated coverage includes:

- unit tests for env/config wiring, scheduler persistence, helpers, and MCP runtime behavior
- integration tests for built-in tools, agent docs, and heartbeat behavior
- e2e tests for direct-message routing, progress replies, scheduling logs, and failure handling

## Repository Layout

```text
docs/                  product and technical reference
src/agents/            agent prompts, heartbeat engine, memory, MCP, tools
src/agents/tools/      iMessage, scheduling, reminder, and Brave tool definitions
src/agents/mcp/        MCP server definitions and runtime wiring
src/main.ts            application entrypoint
tests/                 unit, integration, and e2e coverage
```

## CI

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs `bun run check` and `bun run test` on pushes to `main` and pull requests.

---

<div align="center">

<sub>Personal / educational project. Respect privacy, local device security, and Apple's platform terms when automating Messages.</sub>

</div>
