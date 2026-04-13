# PRD — iMessage-First Hyperliquid Trading Agent

**Version**: 2.0  
**Date**: 2026-04-13  
**Status**: Active draft

## Product Summary

This product lets a general user interact with Hyperliquid through iMessage.

The user experience should feel simple:

- send a natural-language message in iMessage
- let the agent understand intent
- provision or reuse the user's wallet automatically
- read market or account state when asked
- require explicit confirmation before any signed trading action

The system is built around four core pieces:

- `@photon-ai/imessage-kit` as the iMessage transport
- `@mastra/core` as the agent runtime
- `Turnkey` for wallet provisioning and signing infrastructure
- `Hyperliquid` for trading and account state

## Problem

Crypto trading tools are still too fragmented for a normal user:

- wallet setup is separate from the chat surface
- account state lives in one UI and execution in another
- signing flows are often too low-level for non-technical users
- most agent demos still assume a web UI instead of a native messaging interface

This product collapses those steps into a single iMessage conversation while keeping explicit confirmation on any signed action.

## Target Users

### Primary

- general users who want a simple chat interface for Hyperliquid access
- users who are comfortable sending plain-text instructions but do not want to manage a custom trading UI

### Secondary

- builders maintaining or extending the trading-agent runtime
- developers experimenting with iMessage-native agent workflows for wallet-aware products

## Product Principles

- `iMessage-first`: the chat surface is the product interface, not a fallback transport
- `wallet-light UX`: wallet creation should happen automatically when the app can safely do it
- `plain-text clarity`: every reply must work well inside iMessage
- `agent orchestration, not hidden magic`: reads can be direct, writes must be explicit
- `source of truth in app storage`: user and wallet state must come from the app DB and tool outputs, not conversation memory

## Core User Journey

1. A user sends a direct message in iMessage.
2. The app resolves `sender` and `chatId` into a stable user.
3. If the user has no primary wallet, the app provisions one through Turnkey.
4. The Mastra agent receives the request with the user's wallet and resource context.
5. For market or account reads, the agent responds with the relevant Hyperliquid data.
6. For signed actions, the agent returns a compact execution summary and a deterministic confirmation code.
7. The action is submitted only after the user sends the explicit confirmation code.

## P0 Requirements

### 1. iMessage as the primary interface

- inbound messages come from Photon on macOS
- the agent replies in iMessage-safe text with simple inline emphasis allowed when it materially improves readability
- the system supports normal direct-message interaction without a separate web app

### 2. Stable user identity resolution

- every inbound request resolves to an user before agent execution
- the app supports multiple users by mapping `sender` / `chatId` to a stable `resourceKey`

### 3. Automatic Turnkey wallet provisioning

- first contact should create or reuse a primary wallet
- wallet linkage must be persisted in the app DB
- runtime startup must fail fast when required Turnkey server credentials are absent

### 4. Hyperliquid read access

- the agent can inspect market snapshots
- the agent can inspect the current user's account summary, open orders, and recent fills

### 5. Hyperliquid write access with confirmation gating

- place order
- cancel order
- modify order
- update leverage
- every write action requires an explicit confirmation code in chat

### 6. Per-user memory

- conversation memory must remain scoped to the user, not to raw phone formatting
- working memory may assist the agent, but the DB remains the source of truth for wallet state

## P1 Requirements

- richer account reporting and portfolio summaries
- more explicit owner / operator workflows for proactive alerts
- deeper onchain context through optional MCP toolsets such as Allium
- better recovery and ownership-verification flows for higher-risk actions

## Non-Goals

- a generic agent starter template
- a browser-based frontend
- a multi-process exchange execution platform
- third-party wallet import
- strategy automation without explicit product design for safety and controls

## Success Criteria

- a first-time user can send an iMessage and receive a wallet-backed response without manual wallet setup
- the same user is resolved to the same user and wallet context across later messages
- Hyperliquid read requests return data grounded in tools rather than guessed responses
- Hyperliquid write requests never execute on vague confirmation such as "ok" or "yes"
- docs and implementation both describe the repository as a trading agent, not as a generic assistant template

## Reference

For the deeper architecture and implementation rationale, see:

- [DESIGN.md](./DESIGN.md)
- [TECH.md](./TECH.md)
- [specs/issue-001-turnkey-hyperliquid-agent-design.md](./specs/issue-001-turnkey-hyperliquid-agent-design.md)
