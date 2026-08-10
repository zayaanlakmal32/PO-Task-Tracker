# POD Task Dashboard

A small internal dashboard that reads your **Client_Task Tracker** Notion database and
shows, per POD: total tasks, % completed, % in progress, % not started, and a
week-over-week growth/decline indicator — plus a **Generate Report** button that
downloads a PDF (or CSV) snapshot for Ronath.

## What this does and doesn't do

- Reads task Status/Due date/Pod/PO live from Notion — nothing is duplicated or
  cached beyond the page load.
- Buckets tasks into a week by their **Due date** (configurable — see
  `WEEK_BASIS` below).
- Every time you click **Generate Report**, it writes a snapshot of that
  week's numbers into a small archive database in Notion. That's what makes
  next week's "vs last week" comparison possible — the very first report for
  any pod will show "n/a (first report)" for the WoW numbers, which is
  expected.
- It does **not** touch content boards, G-Drive links, strategy decks, or
  anything else on the Project Tracker — only Status/Due date/Pod/PO on the
  task tracker, plus a new archive database it creates for itself.

## 1. Create a Notion integration token

1. Go to [notion.so/profile/integrations](https://www.notion.so/profile/integrations)
   → **New integration** → give it a name (e.g. "POD Task Dashboard") →
   Internal → Submit.
2. Copy the **Internal Integration Secret** (starts with `ntn_` or `secret_`).
   This is your `NOTION_TOKEN`.
3. Share these with the integration (each database → `•••` menu → **Connect
   to** → pick your integration):
   - **Client_Task Tracker** — the task data itself.
   - **📊 Project Tracker** — needed because each task's Pod/PO are rollups
     pulled from there; without this the rollups come back empty.
4. You do **not** need to share content boards, strategy decks, or any
   individual client's linked resources — this app never reads those.

## 2. Get the data source IDs

Open each database in Notion, copy the URL. The ID is the part after
`collection://` if you fetch it through an MCP tool, or you can just use the
values already filled into `.env.example` — they match this workspace's
Client_Task Tracker and Project Tracker as of when this app was generated. If
your workspace structure changes, re-fetch the database to get fresh IDs.

## 3. Local setup

```bash
cp .env.example .env.local
# fill in NOTION_TOKEN (from step 1)
# NOTION_TASK_DATA_SOURCE_ID and NOTION_PROJECT_DATA_SOURCE_ID are prefilled

npm install
```

### Create the weekly snapshot archive (one-time)

The archive database (used for WoW deltas) doesn't exist yet — this script
creates it for you:

1. In `.env.local`, set `NOTION_ARCHIVE_PARENT_PAGE_ID` to the ID of any
   Notion page you want it nested under (open the page, copy the ID from the
   URL), and share that page with your integration.
2. Run:
   ```bash
   npm run setup:notion
   ```
3. Copy the `NOTION_ARCHIVE_DATA_SOURCE_ID` it prints into `.env.local` (and
   later into your Vercel project's environment variables).

### Run it locally

```bash
npm run dev
```

Open http://localhost:3000.

## 4. Deploy to Vercel

1. Push this project to a GitHub repo (or run `vercel` from this folder with
   the [Vercel CLI](https://vercel.com/docs/cli) if you'd rather not use
   GitHub).
2. Import the repo in [vercel.com/new](https://vercel.com/new).
3. In the project's **Settings → Environment Variables**, add everything from
   `.env.example` with your real values (`NOTION_TOKEN`,
   `NOTION_TASK_DATA_SOURCE_ID`, `NOTION_PROJECT_DATA_SOURCE_ID`,
   `NOTION_ARCHIVE_DATA_SOURCE_ID`, and optionally `DASHBOARD_PASSWORD`,
   `WEEK_BASIS`, `TZ_OFFSET_MINUTES`).
4. Deploy.

## Configuration reference

| Env var | Required | Purpose |
|---|---|---|
| `NOTION_TOKEN` | yes | Your internal integration secret |
| `NOTION_TASK_DATA_SOURCE_ID` | yes | Client_Task Tracker data source |
| `NOTION_PROJECT_DATA_SOURCE_ID` | yes | Project Tracker data source (for Pod/PO rollups) |
| `NOTION_ARCHIVE_DATA_SOURCE_ID` | for WoW deltas | Created by `npm run setup:notion` |
| `NOTION_ARCHIVE_PARENT_PAGE_ID` | only for setup script | Where the archive DB gets created |
| `WEEK_BASIS` | no (default `due_date`) | `due_date` or `created` — how tasks are bucketed into a week |
| `TZ_OFFSET_MINUTES` | no (default `330`, Asia/Colombo) | Week boundaries are Monday–Sunday in this timezone |
| `DASHBOARD_PASSWORD` | no | If set, gates the whole dashboard behind a simple shared password |

## Notes on the growth/decline metric

Ronath asked for "a metric to show the growth or decline of the project
during the week," left to our judgment. This app tracks two things together,
since either alone can be misleading:

- **WoW completion change** — this week's % Done vs last week's, in
  percentage points. Shows whether the team is finishing tasks faster or
  slower.
- **Net task change** — tasks completed minus new tasks added this week.
  Positive means the team is working down the backlog; negative means new
  work is outpacing completions even if the completion *percentage* looks
  fine.

Both are on the dashboard and in the generated report. If you'd rather use a
single number (e.g. the Project Tracker's existing Overall % field), that's a
small change in `src/lib/metrics.ts`.
