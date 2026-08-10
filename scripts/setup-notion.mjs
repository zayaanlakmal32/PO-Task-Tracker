#!/usr/bin/env node
// One-time setup: creates the "Weekly Task Report Archive" database in Notion
// (used to store weekly snapshots so the app can compute week-over-week deltas)
// and prints the data source ID to paste into NOTION_ARCHIVE_DATA_SOURCE_ID.
//
// Usage:
//   1. Fill in NOTION_TOKEN and NOTION_ARCHIVE_PARENT_PAGE_ID in .env.local
//      (the parent page ID is the 32-char id in the URL of any page you want
//      the archive nested under — share that page with your integration too).
//   2. npm run setup:notion

import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";

// Also load .env.local manually since dotenv/config only reads .env by default.
if (existsSync(".env.local")) {
  const { config } = await import("dotenv");
  config({ path: ".env.local", override: true });
}

const NOTION_VERSION = "2025-09-03";
const token = process.env.NOTION_TOKEN;
const parentPageId = process.env.NOTION_ARCHIVE_PARENT_PAGE_ID;

if (!token) {
  console.error("Missing NOTION_TOKEN. Add it to .env.local first.");
  process.exit(1);
}
if (!parentPageId) {
  console.error(
    "Missing NOTION_ARCHIVE_PARENT_PAGE_ID. Open any Notion page you want the archive nested under, " +
      "copy its ID from the URL, share that page with your integration, and add it to .env.local."
  );
  process.exit(1);
}

const res = await fetch("https://api.notion.com/v1/databases", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    parent: { type: "page_id", page_id: parentPageId },
    title: [{ type: "text", text: { content: "📈 Weekly Task Report Archive" } }],
    properties: {
      Name: { title: {} },
      "Week Start": { date: {} },
      "Week End": { date: {} },
      Pod: {
        select: {
          options: [
            { name: "POD - Eshan", color: "blue" },
            { name: "POD - Vishma", color: "purple" },
            { name: "POD - Ashen", color: "orange" },
            { name: "POD - Rovindu", color: "green" },
            { name: "All PODs", color: "gray" },
          ],
        },
      },
      "Total Tasks": { number: {} },
      Completed: { number: {} },
      "In Progress": { number: {} },
      "Not Started": { number: {} },
      "New Tasks This Week": { number: {} },
      "Pct Completed": { number: {} },
      "Pct In Progress": { number: {} },
      "Pct Not Started": { number: {} },
      "WoW Completion Change": { number: {} },
      "Net Task Change": { number: {} },
      "Generated At": { date: {} },
    },
  }),
});

const body = await res.json();

if (!res.ok) {
  console.error("Failed to create the archive database:", body);
  process.exit(1);
}

const dataSourceId = body.data_sources?.[0]?.id ?? body.id;

console.log("\n✅ Created 'Weekly Task Report Archive' in Notion.");
console.log(`\nAdd this to your .env.local / Vercel environment variables:\n`);
console.log(`NOTION_ARCHIVE_DATA_SOURCE_ID=${dataSourceId}\n`);

