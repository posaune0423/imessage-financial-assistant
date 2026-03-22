# TECH

## Stack

- Runtime: Bun
- Language: TypeScript
- Messaging: `@photon-ai/imessage-kit`
- Agent: `@mastra/core`
- Memory: `@mastra/memory`
- Storage: `@mastra/libsql`
- Env validation: `@t3-oss/env-core`
- Validation: `zod`
- Tests: Vitest through `vite-plus`

## Runtime Principles

- keep the message loop synchronous and obvious
- use one Mastra agent instance
- use one SQLite-backed LibSQL store
- keep heartbeat separate from incoming message handling
- prefer pure helpers where behavior needs tests
- avoid extra abstraction unless it removes real duplication

## Test Principles

- unit tests stay pure
- integration tests exercise local module composition
- e2e tests cover message-loop behavior with fakes
- quality gate is `vp check` plus `bun run test`
