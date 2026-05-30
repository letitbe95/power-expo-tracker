#!/usr/bin/env node

// ============================================================================
// Power Exhibition Tracker — Prepare Digest
// ============================================================================
// Aggregates config, generated feeds, and prompt instructions.
// Outputs a single unified JSON to stdout for the LLM to consume.
// ============================================================================

import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const USER_DIR = join(homedir(), ".power-expo-tracker");
const CONFIG_PATH = join(USER_DIR, "config.json");

const SCRIPT_DIR = decodeURIComponent(new URL(".", import.meta.url).pathname);
const LOCAL_FEED_PATH = join(SCRIPT_DIR, "..", "feed-exhibitions.json");
const PROMPTS_DIR = join(SCRIPT_DIR, "..", "prompts");

const PROMPT_FILES = [
  "summarize-exhibitions.md",
  "digest-intro.md",
  "translate.md"
];

async function main() {
  const errors = [];

  // 1. Read user config
  let config = {
    language: "zh",
    sectors: ["all"],
    delivery: { method: "stdout" }
  };
  
  if (existsSync(CONFIG_PATH)) {
    try {
      config = JSON.parse(await readFile(CONFIG_PATH, "utf-8"));
    } catch (err) {
      errors.push(`Could not read user config: ${err.message}`);
    }
  }

  // 2. Read local generated feeds
  let feedResult = { exhibitions: [] };
  if (existsSync(LOCAL_FEED_PATH)) {
    try {
      feedResult = JSON.parse(await readFile(LOCAL_FEED_PATH, "utf-8"));
    } catch (err) {
      errors.push(`Could not read feed file: ${err.message}`);
    }
  } else {
    errors.push(`Feed file not found at ${LOCAL_FEED_PATH}. Please run fetch-remote-feed.js first.`);
  }

  // 3. Load prompts (Priority: User Customized > Project default)
  const prompts = {};
  const userPromptsDir = join(USER_DIR, "prompts");

  for (const filename of PROMPT_FILES) {
    const key = filename.replace(".md", "").replace(/-/g, "_");
    const userPath = join(userPromptsDir, filename);
    const localPath = join(PROMPTS_DIR, filename);

    // Priority 1: User customized prompt
    if (existsSync(userPath)) {
      try {
        prompts[key] = await readFile(userPath, "utf-8");
        continue;
      } catch (err) {
        errors.push(`Could not read user customized prompt ${filename}: ${err.message}`);
      }
    }

    // Priority 2: Local project default prompt
    if (existsSync(localPath)) {
      try {
        prompts[key] = await readFile(localPath, "utf-8");
      } catch (err) {
        errors.push(`Could not read default prompt ${filename}: ${err.message}`);
      }
    } else {
      errors.push(`Prompt file not found: ${filename}`);
    }
  }

  // 4. Output the combined payload
  const payload = {
    status: "ok",
    generatedAt: new Date().toISOString(),
    config: {
      language: config.language || "zh",
      sectors: config.sectors || ["all"],
      delivery: config.delivery || { method: "stdout" }
    },
    exhibitions: feedResult.exhibitions || [],
    stats: {
      totalCount: feedResult.exhibitions?.length || 0,
      feedGeneratedAt: feedResult.generatedAt || null
    },
    prompts,
    errors: errors.length > 0 ? errors : undefined
  };

  console.log(JSON.stringify(payload, null, 2));
}

main().catch(err => {
  console.error(JSON.stringify({
    status: "error",
    message: err.message
  }));
  process.exit(1);
});
