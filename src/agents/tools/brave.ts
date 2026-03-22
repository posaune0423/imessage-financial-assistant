import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import type { WebToolConfig } from "../../config";

interface FetchLike {
  (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function braveSearch(fetchImpl: FetchLike, config: WebToolConfig, query: string, count = 5) {
  const braveSearchConfig = config.braveSearch;
  if (!braveSearchConfig) {
    throw new Error("Brave search is not configured.");
  }

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));

  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": braveSearchConfig.apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Brave search failed with ${response.status}`);
  }

  const payload: unknown = await response.json();
  const web = isRecord(payload) && isRecord(payload.web) ? payload.web : null;
  const results = Array.isArray(web?.results) ? web.results : [];

  return {
    provider: "brave" as const,
    results: results.filter(isRecord).map((result) => ({
      title: typeof result.title === "string" ? result.title : typeof result.url === "string" ? result.url : "Untitled",
      url: typeof result.url === "string" ? result.url : "",
      snippet: typeof result.description === "string" ? result.description : "",
    })),
  };
}

export function createWebTools(config: WebToolConfig, fetchImpl: FetchLike = fetch) {
  const tools = {
    "brave-fetch": createTool({
      id: "brave-fetch",
      description:
        "Fetch a URL and return a plain-text excerpt. Use this after Brave search when you need the page contents rather than just result snippets.",
      inputSchema: z.object({
        url: z.string().url(),
        maxChars: z.number().int().positive().max(20_000).optional(),
      }),
      outputSchema: z.object({
        url: z.string(),
        content: z.string(),
      }),
      execute: async ({ url, maxChars }) => {
        const response = await fetchImpl(url);
        if (!response.ok) {
          throw new Error(`Web fetch failed with ${response.status}`);
        }

        const text = stripHtml(await response.text());
        return {
          url,
          content: text.slice(0, maxChars ?? 4_000),
        };
      },
    }),
  };

  if (!config.braveSearch) {
    return tools;
  }

  return {
    "brave-search": createTool({
      id: "brave-search",
      description:
        "Search the live web with Brave Search for current information. Use this whenever the answer depends on recent or external information.",
      inputSchema: z.object({
        query: z.string().min(1),
        count: z.number().int().positive().max(10).optional(),
      }),
      outputSchema: z.object({
        provider: z.literal("brave"),
        results: z.array(
          z.object({
            title: z.string(),
            url: z.string(),
            snippet: z.string(),
          }),
        ),
      }),
      execute: async ({ query, count }) => braveSearch(fetchImpl, config, query, count),
    }),
    ...tools,
  };
}
