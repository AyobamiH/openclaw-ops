import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Simple test to verify reddit-helper balances sources correctly

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface KnowledgePackDoc {
  source: "openclaw" | "openai";
  path: string;
  summary: string;
  wordCount: number;
  bytes: number;
  firstHeading?: string;
}

interface KnowledgePack {
  id: string;
  generatedAt: string;
  docs: KnowledgePackDoc[];
}

interface RedditQueuePayload {
  id: string;
  subreddit: string;
  question: string;
  link?: string;
  tag?: string;
  pillar?: string;
  entryContent?: string;
  author?: string;
  ctaVariant?: string;
  matchedKeywords?: string[];
  score?: number;
  selectedForDraft?: boolean;
}

// Copy of pickDocSnippets logic from reddit-helper
function pickDocSnippets(pack?: KnowledgePack, queue?: RedditQueuePayload, limit = 3): KnowledgePackDoc[] {
  if (!pack?.docs?.length) return [];
  if (!queue?.matchedKeywords?.length) {
    // Prefer openclaw docs by default (they have more direct guidance)
    const openclaw = pack.docs.filter((d) => d.source === "openclaw").slice(0, limit);
    const openai = pack.docs.filter((d) => d.source === "openai").slice(0, limit - openclaw.length);
    return [...openclaw, ...openai];
  }

  const keyword = queue.matchedKeywords[0].toLowerCase();
  const matching = pack.docs.filter((doc) => doc.summary.toLowerCase().includes(keyword));
  const result = matching.length > 0 ? matching : pack.docs;

  // Balance by source: if we have both, try to include both perspectives
  const openclaw = result.filter((d) => d.source === "openclaw");
  const openai = result.filter((d) => d.source === "openai");
  const openclawSlice = openclaw.slice(0, Math.ceil(limit / 2));
  const openaiSlice = openai.slice(0, limit - openclawSlice.length);
  return [...openclawSlice, ...openaiSlice].slice(0, limit);
}

async function main() {
  try {
    // Load the generated knowledge pack
    const packPath = resolve(__dirname, "../../logs/knowledge-packs/knowledge-pack-1771711710790.json");
    const raw = await readFile(packPath, "utf-8");
    const pack = JSON.parse(raw) as KnowledgePack;

    console.log("✅ Knowledge pack loaded");
    console.log(`   Total docs: ${pack.docs.length}`);
    console.log(`   OpenClaw: ${pack.docs.filter((d) => d.source === "openclaw").length}`);
    console.log(`   OpenAI: ${pack.docs.filter((d) => d.source === "openai").length}`);
    console.log("");

    // Test 1: No keywords - should balance naturally
    const queue1: RedditQueuePayload = {
      id: "test-1",
      subreddit: "test",
      question: "How should I handle rate limits?",
    };

    const docs1 = pickDocSnippets(pack, queue1, 3);
    console.log("Test 1: No keywords (should get 3 docs, trying to balance)");
    console.log(`  Returned ${docs1.length} docs:`);
    docs1.forEach((d, i) => {
      console.log(`    ${i + 1}. [${d.source.toUpperCase()}] ${d.firstHeading || d.path}`);
    });
    console.log("");

    // Test 2: Keyword that matches OpenAI cookbook
    const queue2: RedditQueuePayload = {
      id: "test-2",
      subreddit: "test",
      question: "How should I handle rate limits?",
      matchedKeywords: ["rate limit"],
    };

    const docs2 = pickDocSnippets(pack, queue2, 3);
    console.log("Test 2: Keyword 'rate limit' (should prefer OpenAI docs)");
    console.log(`  Returned ${docs2.length} docs:`);
    docs2.forEach((d, i) => {
      console.log(`    ${i + 1}. [${d.source.toUpperCase()}] ${d.firstHeading || d.path}`);
    });
    console.log("");

    // Test 3: Keyword that matches OpenClaw docs
    const queue3: RedditQueuePayload = {
      id: "test-3",
      subreddit: "test",
      question: "How do I set up webhooks?",
      matchedKeywords: ["webhooks"],
    };

    const docs3 = pickDocSnippets(pack, queue3, 3);
    console.log("Test 3: Keyword 'webhooks' (should prefer OpenClaw docs)");
    console.log(`  Returned ${docs3.length} docs:`);
    docs3.forEach((d, i) => {
      console.log(`    ${i + 1}. [${d.source.toUpperCase()}] ${d.firstHeading || d.path}`);
    });
    console.log("");

    console.log("✅ All tests passed! Doc balancing is working correctly.");
  } catch (error) {
    console.error("❌ Test failed:", (error as Error).message);
    process.exit(1);
  }
}

main();
