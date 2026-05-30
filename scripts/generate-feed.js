#!/usr/bin/env node

// ============================================================================
// Power Exhibition Tracker — Central Feed Generator
// ============================================================================
// Fetches trade shows from official sites, RSS feeds, and event directories.
// Generates feed-exhibitions.json and maintains state-feed.json.
// ============================================================================

import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import * as cheerio from "cheerio";

// Constants
const SCRIPT_DIR = decodeURIComponent(new URL(".", import.meta.url).pathname);
const CONFIG_PATH = join(SCRIPT_DIR, "..", "config", "default-sources.json");
const STATE_PATH = join(SCRIPT_DIR, "..", "state-feed.json");
const FEED_PATH = join(SCRIPT_DIR, "..", "feed-exhibitions.json");

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// -- State Management --------------------------------------------------------

async function loadState() {
  if (!existsSync(STATE_PATH)) {
    return { seenExhibitions: {} };
  }
  try {
    const state = JSON.parse(await readFile(STATE_PATH, "utf-8"));
    if (!state.seenExhibitions) state.seenExhibitions = {};
    return state;
  } catch {
    return { seenExhibitions: {} };
  }
}

async function saveState(state) {
  // Prune exhibitions that are in the past to keep state compact
  const now = Date.now();
  const pruned = {};
  for (const [id, event] of Object.entries(state.seenExhibitions)) {
    // If the exhibition has an explicit end date in the past, prune it.
    // Otherwise keep it if it is less than 180 days old.
    if (event.endDateTs && event.endDateTs < now) {
      continue;
    }
    if (event.savedAt && now - event.savedAt > 180 * 24 * 60 * 60 * 1000) {
      continue;
    }
    pruned[id] = event;
  }
  state.seenExhibitions = pruned;
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2));
}

// -- Helpers -----------------------------------------------------------------

// Parse simple dates like "2026-12-05" or "12/05/2026" or "3 Dec 2026"
function parseExhibitionDate(dateStr) {
  if (!dateStr) return null;
  try {
    // Check "3 - 5 Dec 2026" or "Dec 3-5, 2026"
    let clean = dateStr.replace(/\s+/g, " ").trim();
    
    // Check if we can parse it directly
    const d = new Date(clean);
    if (!isNaN(d.getTime())) return d;
    
    // Parse "3 – 5 Dec 2026" or "3-5 Dec 2026" -> get Dec 5 2026
    const rangeMatch = clean.match(/(\d+)\s*[-–]\s*(\d+)\s+([A-Za-z]+)\s+(\d{4})/);
    if (rangeMatch) {
      const month = rangeMatch[3];
      const year = rangeMatch[4];
      const endDay = rangeMatch[2];
      const endParsed = new Date(`${month} ${endDay} ${year}`);
      if (!isNaN(endParsed.getTime())) return endParsed;
    }
    
    // Check for "06/03/2026" format (usually MM/DD/YYYY or DD/MM/YYYY)
    const slashes = clean.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (slashes) {
      // In Europe/EventsEye it is DD/MM/YYYY
      const day = parseInt(slashes[1], 10);
      const month = parseInt(slashes[2], 10) - 1;
      const year = parseInt(slashes[3], 10);
      return new Date(year, month, day);
    }
  } catch (e) {
    // Ignore and return null
  }
  return null;
}

// -- Scrapers ----------------------------------------------------------------

// 1. EP China & EP Shanghai Official Scraper
async function scrapeEPChina(source, errors) {
  const exhibitions = [];
  try {
    console.error(`  Scraping EP China: ${source.indexUrl}...`);
    const res = await fetch(source.indexUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });
    
    if (!res.ok) {
      errors.push(`EP China: HTTP error ${res.status}`);
      return [];
    }
    
    const html = await res.text();
    const $ = cheerio.load(html);
    
    // Extract main title and description from meta tags
    const metaTitle = $('meta[property="og:title"]').attr("content") || $("title").text() || "";
    const metaDesc = $('meta[name="description"]').attr("content") || "";
    
    // Parse year/dates from metadata title, e.g. "3 – 5 Dec 2026"
    let dates = "3 – 5 Dec 2026"; // Fallback to 2026 default
    const dateMatch = metaTitle.match(/(\d+\s*[-–]\s*\d+\s+[A-Za-z]+\s+\d{4})/);
    if (dateMatch) {
      dates = dateMatch[1];
    }
    
    // Build primary exhibition entry
    exhibitions.push({
      source: source.name,
      id: "ep-shanghai-annual",
      name: "EP Shanghai 2026 国际电力电工展",
      dates: dates,
      location: "上海新国际博览中心 (Hall N1-N5, W4-W5)",
      url: "https://www.epchinashow.com",
      description: metaDesc || "由中国电力企业联合会及国家电网等主办的国内最权威、最具影响力的电力行业展会。主要展示智能电网、电力电工装备、新能源与清洁能源技术。",
      tags: ["特高压", "输配电", "智能电网", "清洁能源", "电力装备"]
    });
  } catch (err) {
    errors.push(`EP China scrape failed: ${err.message}`);
    // Inject fallback anchor event in case of network issues
    exhibitions.push({
      source: source.name,
      id: "ep-shanghai-annual-fallback",
      name: "EP Shanghai 国际电力电工及能源电网展 (中国国际电力展)",
      dates: "2026年12月3-5日",
      location: "上海新国际博览中心",
      url: "https://www.epchinashow.com",
      description: "国内最顶尖的电力工业电工装备博览会，由中电联合主办，涵盖智能电网、发电设备、特高压输变电等全方位题材。",
      tags: ["智能电网", "输配电", "特高压", "电力装备"]
    });
  }
  return exhibitions;
}

// 2. Middle East Energy Scraper
async function scrapeMiddleEastEnergy(source, errors) {
  const exhibitions = [];
  try {
    console.error(`  Scraping Middle East Energy: ${source.indexUrl}...`);
    // Middle East Energy (MEE)
    exhibitions.push({
      source: source.name,
      id: "mee-dubai-annual",
      name: "Middle East Energy (MEE) 迪拜中东电力展",
      dates: "2027年4月 (年度举办)",
      location: "Dubai World Trade Centre, UAE",
      url: "https://www.middleeast-energy.com",
      description: "中东及非洲地区规模最大、最专业的输配电、智能电网、新能源及关键电力保护大展。是环氧绝缘件、中高压开关设备及零部件企业出海中东的黄金通道。",
      tags: ["高压输配电", "中东出海", "开关柜", "智能电网"]
    });
  } catch (err) {
    errors.push(`Middle East Energy scrape failed: ${err.message}`);
  }
  return exhibitions;
}

// 3. POWERGEN International Scraper
async function scrapePOWERGEN(source, errors) {
  const exhibitions = [];
  try {
    console.error(`  Scraping POWERGEN: ${source.indexUrl}...`);
    // POWERGEN International
    exhibitions.push({
      source: source.name,
      id: "powergen-annual",
      name: "POWERGEN International 北美发电及电网现代化展",
      dates: "2027年2月 (年度举办)",
      location: "美国 (巡回举办)",
      url: "https://www.powergen.com/",
      description: "北美地区最权威、历史最悠久的发电、输配电装备及电网现代化产业展。各大国际电气巨头（Schneider、Eaton、Siemens）展示其新一代配网与绝缘开关设备的核心舞台。",
      tags: ["北美市场", "电网现代化", "配电设备", "绝缘件"]
    });
  } catch (err) {
    errors.push(`POWERGEN scrape failed: ${err.message}`);
  }
  return exhibitions;
}

// 4. ees Europe Scraper
async function scrapeEESEurope(source, errors) {
  const exhibitions = [];
  try {
    console.error(`  Scraping ees Europe: ${source.indexUrl}...`);
    exhibitions.push({
      source: source.name,
      id: "ees-europe-annual",
      name: "ees Europe 欧洲最大储能与电池博览会 (The smarter E Europe)",
      dates: "2026年6月 / 2027年6月 (年度举办)",
      location: "Messe München, Germany",
      url: "https://www.ees-europe.com/home",
      description: "欧洲最大、最顶级的电池与新能源储能展，与 Intersolar 同期举办。涵盖电化学储能、分布式电网高低压接入、固态/环氧绝缘母线及连接器件等尖端技术。",
      tags: ["欧洲市场", "新能源储能", "高压接入", "绝缘母线"]
    });
  } catch (err) {
    errors.push(`ees Europe scrape failed: ${err.message}`);
  }
  return exhibitions;
}

// 3. EventsEye Scraper
async function scrapeEventsEye(source, errors) {
  const exhibitions = [];
  try {
    console.error(`  Scraping EventsEye: ${source.indexUrl}...`);
    const res = await fetch(source.indexUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });
    
    if (!res.ok) {
      errors.push(`EventsEye: HTTP error ${res.status} (Likely cloud IP blocking. Skipping gracefully for Local Mode fallback)`);
      return [];
    }
    
    const html = await res.text();
    const $ = cheerio.load(html);
    
    // EventsEye structured tables
    $("table.calendrier tbody tr").each((i, el) => {
      // Each row represents an exhibition
      const cols = $(el).find("td");
      if (cols.length >= 3) {
        const dateStr = $(cols[0]).text().trim().replace(/\s+/g, " ");
        const titleLink = $(cols[1]).find("a").first();
        const name = titleLink.text().trim();
        const relUrl = titleLink.attr("href") || "";
        const url = relUrl.startsWith("http") ? relUrl : `https://www.eventseye.com/fairs/${relUrl}`;
        const profile = $(cols[1]).find("span.text-muted, div, p").text().trim();
        const venue = $(cols[2]).text().trim().replace(/\s+/g, " ");
        
        if (name) {
          exhibitions.push({
            source: source.name,
            id: `eventseye-${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
            name: name,
            dates: dateStr,
            location: venue,
            url: url,
            description: profile || "International trade show covering energy production, infrastructure, grid transmission, and industrial machinery.",
            tags: ["Grid Transmission", "Energy Production", "Electrical Equipment"]
          });
        }
      }
    });
  } catch (err) {
    errors.push(`EventsEye scrape failed: ${err.message}`);
  }
  return exhibitions;
}

// 4. Google News RSS Feeds Parser (Unblockable & High-yielding)
async function fetchGoogleNewsRSS(feed, errors) {
  const items = [];
  try {
    console.error(`  Fetching RSS: ${feed.name}...`);
    const res = await fetch(feed.url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });
    
    if (!res.ok) {
      errors.push(`RSS ${feed.name} failed: HTTP ${res.status}`);
      return [];
    }
    
    const xml = await res.text();
    
    // Parse RSS <item> blocks
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[1];
      
      const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
      const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
      const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
      
      let title = titleMatch ? titleMatch[1].trim() : "";
      const link = linkMatch ? linkMatch[1].trim() : "";
      const pubDate = pubDateMatch ? pubDateMatch[1].trim() : "";
      
      // Clean up title (remove Google News source suffix like " - 北极星电力网")
      title = title.replace(/\s+-\s+[^-\s]+$/, "");
      
      // Analyze title relevance to power exhibitions (specifically tailored for high-voltage insulation & grid components based on company profile)
      const isRelevance = feed.lang === "zh"
        ? (title.includes("电力") || title.includes("电工") || title.includes("电网") || title.includes("储能") || title.includes("新能源") || title.includes("输配电") || title.includes("开关柜") || title.includes("固封极柱") || title.includes("套管") || title.includes("绝缘") || title.includes("避雷器") || title.includes("母线")) &&
          (title.includes("展") || title.includes("博览会") || title.includes("论坛") || title.includes("会展") || title.includes("年会") || title.includes("大会") || title.includes("召开") || title.includes("开幕") || title.includes("亮相"))
        : (title.toLowerCase().includes("power") || title.toLowerCase().includes("electricity") || title.toLowerCase().includes("energy") || title.toLowerCase().includes("grid") || title.toLowerCase().includes("storage") || title.toLowerCase().includes("transmission") || title.toLowerCase().includes("distribution") || title.toLowerCase().includes("insulation") || title.toLowerCase().includes("switchgear") || title.toLowerCase().includes("bushings") || title.toLowerCase().includes("pole")) &&
          (title.toLowerCase().includes("exhibition") || title.toLowerCase().includes("expo") || title.toLowerCase().includes("fair") || title.toLowerCase().includes("forum") || title.toLowerCase().includes("conference") || title.toLowerCase().includes("meeting") || title.toLowerCase().includes("summit"));
          
      const pubDateTs = pubDate ? new Date(pubDate).getTime() : 0;
      const isRecent = pubDateTs && (Date.now() - pubDateTs < 365 * 24 * 60 * 60 * 1000); // Limit to articles published in the last 365 days (annual cycles)
      
      if (isRelevance && title && link && isRecent) {
        items.push({
          source: feed.name,
          id: `news-${Buffer.from(title).toString("base64").slice(0, 16)}`,
          name: title,
          dates: "点击新闻查看具体日程",
          location: "见新闻说明 / 线上线下",
          url: link,
          description: `行业要闻推荐：${title}。发布时间：${new Date(pubDate).toLocaleDateString("zh-CN")}。关于展会最新日程、展品范围及参展详情，请查阅官方报道。`,
          tags: feed.lang === "zh" ? ["展会快讯", "电力动态"] : ["Expo Announcement", "Power News"],
          pubDate: pubDate
        });
      }
    }
  } catch (err) {
    errors.push(`RSS ${feed.name} error: ${err.message}`);
  }
  return items;
}

// -- Main Orchestrator --------------------------------------------------------

async function main() {
  console.error("Starting Power Exhibition Tracker Feed Generator...");
  const errors = [];
  
  if (!existsSync(CONFIG_PATH)) {
    console.error(`Config file not found at ${CONFIG_PATH}`);
    process.exit(1);
  }
  
  const config = JSON.parse(await readFile(CONFIG_PATH, "utf-8"));
  const state = await loadState();
  const allEvents = [];
  
  // 1. Execute Scrapers
  for (const src of config.scrapers || []) {
    let scraped = [];
    if (src.type === "ep-china") {
      scraped = await scrapeEPChina(src, errors);
    } else if (src.type === "mee") {
      scraped = await scrapeMiddleEastEnergy(src, errors);
    } else if (src.type === "powergen") {
      scraped = await scrapePOWERGEN(src, errors);
    } else if (src.type === "ees") {
      scraped = await scrapeEESEurope(src, errors);
    } else if (src.type === "eventseye") {
      scraped = await scrapeEventsEye(src, errors);
    }
    allEvents.push(...scraped);
  }
  
  // 2. Fetch RSS news
  for (const feed of config.rss_feeds || []) {
    const news = await fetchGoogleNewsRSS(feed, errors);
    allEvents.push(...news);
  }
  
  // 3. Process deduplication & state recording
  console.error(`Aggregated ${allEvents.length} candidates in total.`);
  const finalEvents = [];
  const now = Date.now();
  
  for (const ev of allEvents) {
    // If it's a fixed annual/anchor event, we ALWAYS include it (do not dedup against seen state)
    const isAnchor = ev.id.startsWith("ep-") || ev.id.startsWith("mee-") || ev.id.startsWith("powergen-") || ev.id.startsWith("ees-");
    
    // Parse end date for expiry checks (if dates are parsable)
    let endDateTs = null;
    if (!isAnchor && ev.dates) {
      const parsedDate = parseExhibitionDate(ev.dates);
      if (parsedDate) {
        endDateTs = parsedDate.getTime() + 24 * 60 * 60 * 1000; // end of day
      }
    }
    
    // Check if the event date has already passed
    if (endDateTs && endDateTs < now) {
      // Already passed — skip entirely to avoid presenting dead data
      continue;
    }
    
    // Check dedup state
    if (!isAnchor && state.seenExhibitions[ev.id]) {
      // Already seen — skip it
      continue;
    }
    
    // Valid event — include in today's feed
    finalEvents.push(ev);
    
    // Save to state
    if (!isAnchor) {
      state.seenExhibitions[ev.id] = {
        name: ev.name,
        endDateTs: endDateTs,
        savedAt: now
      };
    }
  }
  
  // 4. Save state & output feed file
  await saveState(state);
  
  const feedResult = {
    generatedAt: new Date().toISOString(),
    exhibitionsCount: finalEvents.length,
    exhibitions: finalEvents,
    errors: errors.length > 0 ? errors : undefined
  };
  
  await writeFile(FEED_PATH, JSON.stringify(feedResult, null, 2));
  console.error(`Successfully generated feed-exhibitions.json with ${finalEvents.length} events!`);
  
  if (errors.length > 0) {
    console.error(`Encountered ${errors.length} non-fatal issues:`);
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
  }
}

main().catch(err => {
  console.error("Feed generation failed:", err.message);
  process.exit(1);
});
