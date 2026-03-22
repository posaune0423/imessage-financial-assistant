import { IMessageSDK } from "@photon-ai/imessage-kit";

import { env } from "../src/env";

const sdk = new IMessageSDK();

try {
  await sdk.send(env.OWNER_PHONE, "Hello from the simple iMessage + Mastra template.");
} finally {
  await sdk.close();
}
