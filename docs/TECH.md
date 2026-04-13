# TECH

## Stack

- Runtime: Bun
- Language: TypeScript
- Messaging: `@photon-ai/imessage-kit`
- Agent runtime: `@mastra/core`
- Memory: `@mastra/memory`
- Memory store: `@mastra/libsql`
- Persistence: SQLite via Drizzle-backed repository implementations
- Wallet infra: Turnkey
- Exchange integration: `@nktkas/hyperliquid`
- Validation: `zod`, `@t3-oss/env-core`
- Tests and quality: `vite-plus` (`vp`) + Vitest

## Product Architecture

- One local macOS process owns the message loop.
- One Mastra `general-agent` handles all users.
- Every inbound request is resolved to an user before agent execution.
- Wallet and identity state live in the app DB, not in prompts.
- Turnkey server credentials are required at startup.
- Hyperliquid writes are confirmation-gated and never executed on ambiguous approval.
- MCP toolsets are loaded lazily for onchain / wallet / crypto-heavy requests rather than attached to every request.

## Runtime Flow

### Inbound message flow

1. Photon emits an inbound direct message.
2. `src/main.ts` resolves the sender into an user.
3. Turnkey provisioning runs if the user has no ready primary wallet.
4. Request context is assembled with user and wallet metadata.
5. The Mastra agent runs with per-user memory and built-in tools.
6. The final response is returned as a plain-text iMessage reply.

### Trading flow

1. The user asks for a Hyperliquid action.
2. The relevant write tool computes a deterministic confirmation code.
3. The tool returns `status=confirmation_required` until the exact code appears in the inbound message.
4. After confirmation, the tool signs through the Turnkey-backed wallet runtime and submits to Hyperliquid.

## Source of Truth Rules

- App-user identity and wallet linkage: SQLite repositories
- Conversation context: Mastra memory
- Wallet status, address, signer readiness: DB + tool outputs
- Market and account state: Hyperliquid tool outputs
- Onchain enrichment: optional MCP tool outputs

## Required Environment Contract

These variables are required for normal startup:

- `ANTHROPIC_API_KEY`
- `OWNER_PHONE`
- `TURNKEY_ORGANIZATION_ID`
- `TURNKEY_API_BASE_URL`
- `TURNKEY_API_PUBLIC_KEY`
- `TURNKEY_API_PRIVATE_KEY`

Notable optional variables:

- `DATABASE_URL`
- `IMESSAGE_SCHEDULER_PERSIST_PATH`
- `HYPERLIQUID_NETWORK`
- `BRAVE_API_KEY`
- `ALLIUM_API_KEY`
- `MCP_TIMEOUT_MS`
- `MULTI_USER_MODE`

Hyperliquid network behavior:

- `mainnet`: production Hyperliquid API / trading behavior
- `testnet`: Hyperliquid testnet API / trading behavior with testnet-safe funding guidance

## Verification

Primary quality gate:

```bash
bun run check
```

Useful targeted commands:

```bash
bun run test
bun run test:unit
bun run test:integration
bun run test:e2e
```

## Related Docs

- [PRD.md](./PRD.md)
- [STRUCTURE.md](./STRUCTURE.md)
- [DESIGN.md](./DESIGN.md)
