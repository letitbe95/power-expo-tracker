#!/usr/bin/env node

// ============================================================================
// Power Exhibition Tracker — Remote Feed Synchronizer
// ============================================================================
// Fetches pre-compiled exhibition data from the remote GitHub repository,
// matching the elegant architecture of follow-builders.
// ============================================================================

import { writeFile } from "fs/promises";
import { join } from "path";

const SCRIPT_DIR = decodeURIComponent(new URL(".", import.meta.url).pathname);
const FEED_PATH = join(SCRIPT_DIR, "..", "feed-exhibitions.json");
const REMOTE_URL = "https://raw.githubusercontent.com/letitbe95/power-expo-tracker/main/feed-exhibitions.json";

async function main() {
  console.log("正在从远程 GitHub 仓库拉取最新抓取的展会数据...");
  const res = await fetch(REMOTE_URL);
  if (!res.ok) {
    throw new Error(`无法连接至远程仓库: HTTP ${res.status}`);
  }
  const data = await res.json();
  
  // 保存到本地 feed-exhibitions.json
  await writeFile(FEED_PATH, JSON.stringify(data, null, 2));
  console.log("🎉 成功同步远程 feed-exhibitions.json 到本地！");
}

main().catch(err => {
  console.error("同步失败:", err.message);
  process.exit(1);
});
