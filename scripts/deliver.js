#!/usr/bin/env node

// ============================================================================
// Power Exhibition Tracker — Delivery Script
// ============================================================================
// Dispatches the compiled digest to various channels.
// Supports: stdout, telegram, email, feishu webhook, wecom webhook.
// ============================================================================

import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { config as loadEnv } from "dotenv";

const USER_DIR = join(homedir(), ".power-expo-tracker");
const CONFIG_PATH = join(USER_DIR, "config.json");
const ENV_PATH = join(USER_DIR, ".env");

async function getDigestText() {
  const args = process.argv.slice(2);

  // Check --message
  const msgIdx = args.indexOf("--message");
  if (msgIdx !== -1 && args[msgIdx + 1]) {
    return args[msgIdx + 1];
  }

  // Check --file
  const fileIdx = args.indexOf("--file");
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    return await readFile(args[fileIdx + 1], "utf-8");
  }

  // Read from stdin
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

// 1. Telegram Dispatcher
async function sendTelegram(text, token, chatId) {
  const MAX_LEN = 4000;
  const chunks = [];
  let remaining = text;
  
  while (remaining.length > 0) {
    if (remaining.length <= MAX_LEN) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n", MAX_LEN);
    if (splitAt < MAX_LEN * 0.5) splitAt = MAX_LEN;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }

  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: "Markdown",
        disable_web_page_preview: true
      })
    });

    if (!res.ok) {
      const err = await res.json();
      if (err.description && err.description.includes("can't parse")) {
        // Fallback to plain text if markdown fails
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: chunk,
            disable_web_page_preview: true
          })
        });
      } else {
        throw new Error(`Telegram API error: ${err.description}`);
      }
    }
    if (chunks.length > 1) await new Promise(r => setTimeout(r, 500));
  }
}

// 2. Email Dispatcher (Resend)
async function sendEmail(text, apiKey, toEmail) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      from: "Power Exhibition Tracker <exhibitions@resend.dev>",
      to: [toEmail],
      subject: `⚡️ 电力行业展会雷达速递 — ${new Date().toLocaleDateString("zh-CN", {
        year: "numeric", month: "long", day: "numeric", weekday: "long"
      })}`,
      text: text
    })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Resend Email API error: ${err.message || JSON.stringify(err)}`);
  }
}

// 3. Feishu (Lark) Webhook Dispatcher
async function sendFeishu(text, webhookUrl) {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      msg_type: "interactive",
      card: {
        header: {
          title: {
            tag: "plain_text",
            content: "⚡️ 电力行业展会雷达速递"
          },
          template: "orange"
        },
        elements: [
          {
            tag: "markdown",
            content: text
          }
        ]
      }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Feishu Webhook error: ${errText}`);
  }
}

// 4. WeCom (Enterprise WeChat) Webhook Dispatcher
async function sendWeCom(text, webhookUrl) {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      msgtype: "markdown",
      markdown: {
        content: text
      }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`WeCom Webhook error: ${errText}`);
  }
}

// -- Main Dispatcher ---------------------------------------------------------

async function main() {
  loadEnv({ path: ENV_PATH });

  let config = {};
  if (existsSync(CONFIG_PATH)) {
    config = JSON.parse(await readFile(CONFIG_PATH, "utf-8"));
  }

  const delivery = config.delivery || { method: "stdout" };
  const digestText = await getDigestText();

  if (!digestText || digestText.trim().length === 0) {
    console.log(JSON.stringify({ status: "skipped", reason: "Empty digest text" }));
    return;
  }

  try {
    switch (delivery.method) {
      case "telegram": {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = delivery.chatId;
        if (!token) throw new Error("TELEGRAM_BOT_TOKEN not found in .env");
        if (!chatId) throw new Error("delivery.chatId not found in config.json");
        await sendTelegram(digestText, token, chatId);
        console.log(JSON.stringify({ status: "ok", method: "telegram", message: "Sent to Telegram" }));
        break;
      }

      case "email": {
        const apiKey = process.env.RESEND_API_KEY;
        const toEmail = delivery.email;
        if (!apiKey) throw new Error("RESEND_API_KEY not found in .env");
        if (!toEmail) throw new Error("delivery.email not found in config.json");
        await sendEmail(digestText, apiKey, toEmail);
        console.log(JSON.stringify({ status: "ok", method: "email", message: `Sent to ${toEmail}` }));
        break;
      }

      case "feishu": {
        const webhookUrl = delivery.feishuWebhookUrl || process.env.FEISHU_WEBHOOK_URL;
        if (!webhookUrl) throw new Error("Feishu Webhook URL not found in config or env");
        await sendFeishu(digestText, webhookUrl);
        console.log(JSON.stringify({ status: "ok", method: "feishu", message: "Sent to Feishu group" }));
        break;
      }

      case "wecom": {
        const webhookUrl = delivery.wecomWebhookUrl || process.env.WECOM_WEBHOOK_URL;
        if (!webhookUrl) throw new Error("WeCom Webhook URL not found in config or env");
        await sendWeCom(digestText, webhookUrl);
        console.log(JSON.stringify({ status: "ok", method: "wecom", message: "Sent to WeCom group" }));
        break;
      }

      case "stdout":
      default:
        console.log(digestText);
        break;
    }
  } catch (err) {
    console.log(JSON.stringify({
      status: "error",
      method: delivery.method,
      message: err.message
    }));
    process.exit(1);
  }
}

main();
