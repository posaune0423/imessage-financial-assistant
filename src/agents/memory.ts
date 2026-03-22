import { LibSQLStore } from "@mastra/libsql";
import { Memory } from "@mastra/memory";

import type { AgentMemoryConfig } from "../config";

export function createAgentMemory(config: AgentMemoryConfig): Memory {
  const observationalMemory = config.observationalMemory.enabled
    ? {
        model: config.observationalMemory.model,
        scope: "resource" as const,
        observation: {
          messageTokens: 12_000,
        },
        reflection: {
          observationTokens: 24_000,
        },
      }
    : false;

  return new Memory({
    storage: new LibSQLStore({
      id: "agent-storage",
      url: config.databaseUrl,
    }),
    options: {
      lastMessages: config.lastMessages,
      workingMemory: {
        enabled: true,
        scope: "resource",
        template: `# Owner Profile
- Name:
- Timezone:
- Preferred Reminder Style:

# Current Goals
- Goal 1:
- Goal 2:

# Open Loops
- Pending follow-up:
- Waiting on:

# Commitments
- Recurring commitments:
- Promises already made:

# Messaging Context
- Default Delivery Target:
- Known Contacts / Chats:
- Tool Constraints:
`,
      },
      observationalMemory,
    },
  });
}
