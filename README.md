# DungeonThing

A drag-and-drop dungeon builder for D&D. Each grid cell is 5 feet, so a character with 30 ft of movement covers 6 cells.

Live site: https://macakuaya.github.io/DungeonThing/

---

## What v1 does

- A left sidebar with four 4x4 colored tiles.
- A 30x30 grid canvas (snaps tiles to whole cells).
- Drag a tile from the sidebar onto the grid. It snaps to the nearest cell.

That's the foundation. Real shapes (room, corridor, T-junction, cross), rotation, deletion, and multiplayer come next.

---

## Run it on your Mac (local development)

You need **Node.js 20+** installed. If you don't have it, install from https://nodejs.org or via Homebrew: `brew install node`.

```bash
cd ~/Documents/Personal/DungeonThing
npm install        # one time, after cloning
npm run dev        # opens http://localhost:5173
```

Vite reloads the page in your browser the moment you save any file. That's the "server refreshes on update" behavior you wanted — no manual restart needed.

To stop the dev server, press `Ctrl + C` in the terminal.

---

## Push your changes (and auto-deploy)

Every push to `main` triggers a GitHub Action that rebuilds and republishes the site. Roughly one minute after pushing, https://macakuaya.github.io/DungeonThing/ updates.

```bash
git add .
git commit -m "describe what changed"
git push
```

You can watch the deploy run under the **Actions** tab on GitHub.

---

## Short share links + social previews (Supabase)

The Share button now creates a short link by saving map state in Supabase and copying a URL like:

`https://<your-project>.supabase.co/functions/v1/share-card?id=abc12345`

That URL has Open Graph/Twitter meta tags, so Discord/WhatsApp/X can show a preview card with image.

### 1) Create a Supabase project

- Go to https://supabase.com and create a new project.

### 2) Run the SQL migration

- In Supabase, open **SQL Editor**.
- Run the SQL file from this repo:
  - `supabase/migrations/20260525_create_shared_maps.sql`

This creates:
- `shared_maps` table for saved map payloads
- `share-previews` public storage bucket for preview images
- policies for public read/create access

### 3) Deploy the Edge Function

Install Supabase CLI if needed:

```bash
brew install supabase/tap/supabase
```

Then from the project root:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase functions deploy share-card --no-verify-jwt
```

Set function secret for app redirect URL:

```bash
supabase secrets set PUBLIC_APP_URL=https://macakuaya.github.io/DungeonThing/
```

### 4) Configure local env vars

Copy `.env.example` to `.env` and fill:

```bash
cp .env.example .env
```

- `VITE_SUPABASE_URL` = your project URL (e.g. `https://xxxx.supabase.co`)
- `VITE_SUPABASE_ANON_KEY` = anon public key
- `VITE_SHARE_CARD_URL` = `https://<project-ref>.supabase.co/functions/v1/share-card`
- `VITE_PUBLIC_APP_URL` = `https://macakuaya.github.io/DungeonThing/`

Restart `npm run dev` after editing `.env`.

### 5) Configure GitHub Actions secrets

In GitHub repo settings (**Settings → Secrets and variables → Actions**), add:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SHARE_CARD_URL`
- `VITE_PUBLIC_APP_URL`

The deploy workflow already reads these secrets during build.

---

## One-time GitHub Pages setup (do this once on github.com)

After the first push, you need to flip two switches in your repo settings:

1. **Settings → Pages → Source: GitHub Actions**
   (Not "Deploy from a branch". The new Actions-based source is what our workflow uses.)
2. **Settings → Actions → General → Workflow permissions: Read and write permissions**

After that, push to `main` and your site will be live at the URL above.

---

## Project structure

```
.github/workflows/deploy.yml   # auto-deploy to GitHub Pages
src/
  components/
    Sidebar.tsx                # left rail of source tiles
    DraggableTile.tsx          # an entry in the sidebar
    Grid.tsx                   # the 30x30 droppable canvas
    PlacedTile.tsx             # a tile rendered on the grid
  tiles.ts                     # tile catalogue + grid constants
  App.tsx                      # DndContext + state
  main.tsx, index.css, App.css
vite.config.ts                 # base path for GitHub Pages
```

If you only want to add or change tiles, open `src/tiles.ts`.

---

## Tech stack

- [Vite](https://vite.dev/) + [React 19](https://react.dev/) + TypeScript
- [@dnd-kit/core](https://dndkit.com/) for drag-and-drop
- Plain CSS Grid for the canvas (we can swap in Konva.js later if needed)

---

## What's next (planned)

- Proper tile shapes (room, corridor, T-junction, cross, dead-end) with non-square cell masks.
- Rotate / delete placed tiles.
- Save & load maps as JSON (Tiled-compatible format is on the table).
- Multiplayer: login + 6-player real-time sessions via [Supabase](https://supabase.com/) realtime channels. The static site stays on GitHub Pages; only the data layer goes through Supabase.
