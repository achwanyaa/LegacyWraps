# Legacy Wraps

Website, 3D wrap studio and shop admin for a premium car-wrap studio in Nairobi.

- **Site** (`/`): hero, film library, services with KES pricing, recent work, FAQ. No 3D on the homepage: the car images are pre-rendered stills, so it loads fast on phones.
- **Studio** (`/studio`): real-time 3D configurator. Pick a car (Mercedes, Mazda, BMW, Land Cruiser, Range Rover, G-Class and more, built to each model's real dimensions), a body film, contrast roof, bonnet, mirrors and rally stripes, wheels, calipers, tint, PPF, ceramic and a Kenyan plate. The estimate updates live in KES. Customers can share a link, save an image or send a quote request with a render attached.
- **Tracker** (`/track/LW-XXXXX`): customers follow their build from request to delivery, with updates posted by the team.
- **Admin** (`/admin`): overview with KPIs and charts, a drag-and-drop pipeline, a bay schedule, a film library and shop settings. Moving a job updates the customer's tracker.

## Stack

| Part | Tech |
| --- | --- |
| Frontend | React 19, React Router, Vite. three.js is code-split into the Studio only |
| API | Express 5 (`server/`), deployed as one Vercel function (`api/index.js`) |
| Data | Supabase Postgres with RLS on and no policies; only the server's service role can access it. Renders live in the public `snapshots` storage bucket |
| Pricing | `shared/catalog.js`, used by both browser and server so the estimate always matches |

## Run locally

```bash
npm install
npm run db:setup   # applies supabase/schema.sql and seeds demo data (first time only)
npm run dev        # http://localhost:5180
```

`.env.local` needs:

```
SUPABASE_ACCESS_TOKEN=...      # only for db:setup (Management API)
SUPABASE_PROJECT_REF=...
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_PASSWORD=...             # optional, used when seeding; default is legacy2026
```

Staff login is at `/admin`. Change the default password in **Admin → Settings** straight away.

## Deploy (Vercel)

Pushing to `main` deploys. In the Vercel project, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as environment variables. `vercel.json` routes `/api/*` to the function and everything else to the SPA.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API + Vite with hot reload on one port |
| `npm run build` | Production build to `dist/` |
| `npm run typecheck` | TypeScript check |
| `npm run db:setup` | Apply schema, seed if empty |
| `npm run db:reset` | Apply schema, wipe and reseed demo data |
| `npm run renders` | Re-render homepage hero stills and job thumbnails with the 3D studio (needs `npm run dev` running and Edge or Chrome installed) |

## Real 3D car models

The Studio uses real car models (CC BY 4.0, credited in the site footer), optimised to 0.5–4 MB each and loaded only when a customer picks that car. Cars without a model show "coming soon" and can still be quoted.

1. `node dev/fetch-models.mjs` downloads the Sketchfab sources listed in that file into `models-src/` (git-ignored, needs `SKETCHFAB_TOKEN` in `.env.local`). Bought models go in `models-src/<model-id>.glb` too.
2. Add a recipe to `dev/build-models.mjs` naming which materials are paint, bonnet, roof, glass, rims and trim. `dev/modellab.html` + `dev/matsheet.mjs` render each material highlighted to find them.
3. `node dev/build-models.mjs [id]` writes `public/models/<id>.glb` and updates `shared/models3d.js`.
4. `npm run renders -- --all-jobs` refreshes homepage stills and job thumbnails.

## Editing content

- **Films and prices:** Admin → Films (KES per sq ft of film).
- **Labour, add-ons, vehicle list:** `shared/catalog.js` (`CLASSES`, `MODELS`, `WHEELS`, `CALIPERS`, `TINT`).
- **Hero slides:** `shared/heroes.js`, then `npm run renders -- --heroes-only`.
- **New vehicle:** add it to `MODELS` with length, width, height and wheelbase plus one of the silhouettes (`sedan`, `wagon`, `suv`, `suvcoupe`, `boxy`, `gwagon`, `pickup`).
