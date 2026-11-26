# AGENTS.md: Legacy Wraps

Read this first. It is the handover for any AI agent or developer picking up this repo: what the product is, what is built, the rules, and what comes next. Keep it current: update the "Status" and "Roadmap" sections whenever you finish or change something.

Last updated: 26 Nov 2026.

## What this is

Legacy Wraps is a new premium car-wrap studio in Nairobi, Kenya (vinyl colour change, paint protection film, window tint, ceramic coating). This repo is the shop's system:

- a **public website** with a car configurator (the "Studio") that brings in leads;
- a **staff console** (`/admin`) that runs the shop: leads, quotes, customers, bookings, bays, payments;
- a **customer tracker** (`/track/<token>`) where customers follow their car.

**End goal (from the owner): a full shop ERP, "like a hospital system".** Money in and out, tax estimates, stock, staff roles and pay, and an owner who can see the shop running from anywhere on his phone. The first release is the lead-to-delivery flow; ERP modules follow one at a time (see Roadmap). The client knows the project runs a month or more.

Users: two to five staff, plus the owner. Customers never get accounts. Most enquiries come from Instagram, then WhatsApp, calls and walk-ins. Customers browse on phones on mobile data, often inside Instagram's in-app browser. Deposits are paid on site.

## Rules (do not break)

- **Commits:** author `achwanyaa <264656709+achwanyaa@users.noreply.github.com>`. No `Co-Authored-By` lines. Nothing may show the name or email "sajimholdings".
- **Deploy:** push to `main` on github.com/achwanyaa/LegacyWraps. Vercel builds automatically (project `legacy-wraps`, scope `achwanyaas-projects`; use `npx vercel ... --scope achwanyaas-projects`). After a push, confirm the deploy is Ready and `https://legacy-wraps.vercel.app/api/films` returns 200.
- **Secrets:** never commit `.env.local`, never print secret values, never send them to outside services.
- **Raw 3D models** stay in git-ignored `models-src/` and never ship to the browser (model licences forbid it). Only rendered images are published.
- **Money:** buying models, paid plans, AI credits or tools (ManyChat etc.) needs the owner's explicit yes each time.
- **Spin checkpoint:** no models bought and no other cars converted until the owner has compared the G 63 spin with the current 3D view on a phone.
- **Database changes** go in a new numbered file in `supabase/migrations/`, applied with `npm run db:setup` (idempotent; safe to run twice). Keep changes additive so the deployed code keeps working before the new code ships.
- **Don't guess business rules** (pricing formula, no-show rule, tax rates). Ask; see Open questions.
- **Editing code from scripts:** don't use JS `String.replace` or `sed` when the new text contains `$` or backslashes (it silently corrupted files once). Use an exact-text editor or `indexOf`/`slice` splicing, then check `git diff`.

## Accounts

Everything currently runs on the **developer's mock-up accounts** (GitHub, Vercel, Supabase project `rbjcwkgxytbdrxepycth`, Kaggle). Before launch they move to accounts registered with **a company email owned by the shop**: Vercel project transfer, Supabase project transfer, domain registered by the shop, Meta Business/Instagram and Google Business Profile in the shop's name. The developer is invited as a team member; the owner keeps passwords and two-step verification. Vercel's paid plan is needed for commercial use and Supabase's paid plan for backups and no idle pausing (confirm prices before signing up).

Client-facing brief (pitch, timeline, accounts, questions): https://claude.ai/artifact/Kfh7WTHjo8Z5L5azTZGUZW

## Stack and layout

| Part | Where | Notes |
| --- | --- | --- |
| Front end | `src/` | React 19, React Router, Vite 8, TypeScript. three.js only in the Studio |
| API | `server/api.js`, `server/db.js` | Express 5, deployed as one Vercel function (`api/index.js`), 15 s limit, 4 MB body limit |
| Database | Supabase Postgres | RLS on, no policies: only the server's service-role key reads or writes |
| Schema | `supabase/schema.sql` (baseline) + `supabase/migrations/NNN_*.sql` | Applied by `server/setup.js` through the Supabase Management API; tracked in `schema_migrations`; the jobs status rule is regenerated from `STATUSES` on every run |
| Shared logic | `shared/catalog.js` | Car catalogue (`MODELS`), films/finishes, `estimate()`, `STATUSES`, `LEAD_SOURCES`, `SERVICES`, `normPhone()`. Used by browser and server so prices always agree |
| Admin UI | `src/pages/admin/` | `Admin.tsx` (shell, nav, sign-in), `me.ts` (signed-in staff context), `Overview`, `Leads`, `Pipeline`, `Customers`, `Schedule`, `Films`, `SettingsPage`, `JobDrawer` |
| Studio (3D) | `src/pages/Studio.tsx`, `src/three/` | Real-time 3D for six cars (`shared/models3d.js`, GLBs in `public/models/`) |
| Spin view (new) | `src/spin/`, `render/`, `dev/pack-spin.mjs` | Pre-rendered layers recoloured in the browser; not wired into the Studio yet |

Run locally: `npm install`, then `npm run dev` (http://localhost:5180). `npm run typecheck`, `npm run build`, `npm run db:setup`. Screenshots: `node dev/pages.mjs <outPrefix> <path...>` (desktop + phone; append `!` for full page; `LOGIN_USER=<username> LOGIN=<password>` to sign in). On Windows run it from PowerShell, because Git Bash rewrites `/admin` into a file path. There are no automated tests; verification has been scripted API checks against the local server plus screenshots, with test data removed afterwards.

## Status: what is built and live

### Website and Studio
- Public site: hero, film library, services with KES prices, recent work, FAQ.
- Studio: real-time 3D configurator for six cars (G 63, GLE Coupe, Range Rover Sport, Mazda Atenza, CX-5, Prado). Pick film, contrast roof and bonnet, wheels, calipers, tint, PPF, ceramic, plate. Live estimate in KES. Share, save image, or send a quote request with a render attached. The other 23 catalogue cars show "coming soon".
- Quote form accepts a phone **or** an email, and passes `utm_*` link values through so Instagram links tag the lead.
- Loader fix: the "Loading 0%" overlay no longer sticks.

### Staff console
- **Sign-in and roles:** each person has their own account (`staff` table). Roles today: `owner` and `staff`. The original shared password became the `owner` account (username `owner`; a blank username also signs in as owner). Owners manage staff in Settings. Only owners change settings, add/remove staff, delete jobs or films, edit or remove payments, and see the Instagram intake key. Sessions are signed cookies carrying the staff id; removing someone's access takes effect within a minute.
- **Change trail:** `audit_log` records who changed jobs, films, settings, staff, quotes and payments, with before and after values. Job updates on the tracker record which staff member posted them.
- **Leads page:** all open requests and quotes. Flags: new and not replied, no reply after N hours (setting), follow-up due. One-tap WhatsApp or call marks the lead contacted and schedules the next follow-up. Quick "Add lead" form for DMs, calls and walk-ins (name, phone, source, service, car).
- **Instagram intake:** `POST /api/leads` with header `x-lw-key` (owner reads or rotates it at `/api/admin/intake-key`). Creates a lead tagged `instagram` and returns the private tracker link.
- **Customers:** one record per phone number (else email). Phones stored as `+2547XXXXXXXX` (`normPhone` in JS, `lw_norm_phone()` in SQL). Customers page shows cars, jobs, open jobs and spend. Editing a job's phone re-links it to the right customer.
- **Quotes:** saved per job with a frozen snapshot of the estimate and prices used. "Save and send on WhatsApp" opens a ready message. A new quote replaces the open one. Won/Lost buttons; Lost closes the job with a reason.
- **Statuses:** inquiry, quoted, booked, in_bay, curing, ready, delivered, plus closed exits `lost` (with reason) and `no_show`.
- **Bookings:** each service has a standard number of bay days (Settings), and a job can override it. A bay cannot be double-booked (409 with a clear message). The schedule draws real job lengths.
- **Payments:** deposit, part payment, balance or refund, by cash, M-Pesa, bank or card, with a reference; duplicate M-Pesa codes are refused. Staff record; only owners edit or remove. Jobs with payments cannot be deleted. The job drawer shows price, paid and balance.
- **Overview:** opens with the owner's five answers (cars in the bays, arrivals today, unanswered leads, money taken today, who still owes), plus takings this week and month, money due from booked cars, and takings by service. "Today" is Nairobi time. Note: the demo jobs have no payments, so "still owed" shows about KES 5M until real data replaces the demo.
- **Tracker:** each job has a 32-character `track_token`. The customer's link `/track/<token>` shows car, price and install date. A bare `LW-XXXXX` code only shows the stage (rate limited) with a button to ask for the private link.

### Database migrations (all applied to the live project)
- `001_staff_audit.sql`: `staff`, `audit_log`, `rate_hits` (shared rate limits), `job_events.staff_id`, `jobs.lost_reason`.
- `002_leads_customers_quotes.sql`: `customers` + backfill, `jobs.customer_id/source/source_detail/service/last_contact_at/next_follow_up_at`, `quotes`, `lw_norm_phone()`. Job email is optional.
- `003_payments_bookings.sql`: `payments`, `jobs.days`.
- `004_tracker_tokens.sql`: `jobs.track_token`.

### Spin view pipeline (Studio v2): working, not yet in the product
Approach (chosen after researching Tesla, Porsche, Lucid and the wrap visualisers): render each car offline in Blender at 24 angles plus a top view, as layers (base picture of everything not wrapped plus shadow; lighting layers; masks for body, bonnet, roof, rims, trim, glass; a facing-angle layer). A WebGL shader (`src/spin/SpinStage.ts`, finishes in `src/spin/finish.ts`) recolours them live: gloss, satin, matte, metallic, chrome, colour-shift, tint, rim colour, chrome delete. First view is one small image; no 3D engine download.

- `render/scene.py`: the Blender 4.2 script. Fixed on its first real runs: read EXRs with OpenImageIO `ImageInput`; lighting from denoised matte and clear-coat renders, not the grainy raw passes; material names also match Blender's `.001` copies; logs unmatched materials.
- `render/spin-kaggle.mjs`: renders on a free Kaggle notebook (keys `KAGGLE_USERNAME`/`KAGGLE_KEY` in `.env.local`; the key is a `KGAT_` token sent as Bearer). Uploads the raw model to a private dataset `lw-src-<id>`, pushes private notebook `lw-render-<id>`, downloads the layers to `models-src/spin-raw/<id>/`. Options: `--only 3`, `--device CPU`, `--samples`, `--width/--height`, `--fetch` (download the last run again, with retries). **Kaggle's GPU queue stayed stuck for hours on 26 Nov; CPU runs start within a minute.** `render/spin.mjs` is a Modal alternative, unused.
- `dev/pack-spin.mjs`: packs layers into WebP at 480/800/1280 (never upscales) into `public/spins/<id>/` and writes `shared/spins.js`.
- `dev/spinlab.html`: lab page, e.g. `/dev/spinlab.html?model=mercedes-g63&film=avy-silver-chrome`.
- **Pilot result (G 63, CPU draft at 800×450, 25 angles, 66 min on Kaggle CPU):** 36 KB per angle at 480 (whole phone spin about 0.9 MB), 74 KB per angle at 800. All six finishes recolour correctly, and colour-shift and chrome look convincing. Gloss looks a little flat (clear-coat shine too weak); tune `finish.ts`/coat scale. The packed draft is local only (`public/spins/`, `shared/spins.js` not committed). A 1280 render needs the GPU queue or a long CPU run.

## Roadmap

1. **Finish the spin pilot.** Side-by-side of spin vs current 3D on a phone in several films. (The 3D lab screenshot timed out in the headless browser loading the 4 MB model; use a longer wait or a real phone.) Tune gloss. Then the **owner checkpoint**. Second pilot from a free model of a common Kenyan car (Prado or Atenza).
2. **Prices in the database (blocked on the owner's pricing formula).** Move `CLASSES`, add-on prices and multipliers from `shared/catalog.js` into a versioned `price_lists` row; `estimate()` keeps its signature and takes the list as an argument; owner-only editor; every change audited; check totals match exactly before and after.
3. **Check-in photos and the no-show rule (both waiting on the owner).** Dated arrival photos plus customer sign-off in a private bucket; release unconfirmed bookings per his rule.
4. **Studio v2 in the product (after the checkpoint).** Pick the stage per car: spin, else 3D, else photo upload. Load three.js only when 3D is opened. Snapshot/share via `SpinStage.snapshot()` plus an Instagram-story export with the shop's handle. Spins in `public/spins/` with a long cache header in `vercel.json`; move to Cloudflare R2 with content-hashed names past about ten cars.
5. **Photo upload for any car.** Browser shrinks the photo and uploads to a private bucket via a signed URL; one server-side AI call returns panel/glass/wheel masks (per-visitor daily limit); the compositor recolours using the photo's own lighting. Dark cars carry little lighting, so a "make it photoreal" image-model step (which asks for a phone number) covers them. Uploads are deleted after 30 days unless a quote is requested.
6. **Instagram and launch.** Link-in-bio landing page; ManyChat (needs a yes) posting to `/api/leads`; Google Business Profile; gallery publishing from finished jobs with plates blurred and consent recorded; review request at delivery; enter the shop's five finished cars as the first jobs; test on a low-cost Android inside Instagram's browser; move to the shop's accounts; train staff.
7. **Full shop ERP, one module at a time:**
   - **Roles and permissions:** replace owner/staff with owner, manager, front_desk, installer, accountant, and a permission map (`server/permissions.js`) checked by a `can(perm)` middleware instead of `requireOwner`. Installers see only their own jobs.
   - **Expenses and profit:** `expenses` (category, amount, method, supplier, receipt photo, staff); profit per job (price minus film cost and commission) and per month; cash on hand.
   - **Tax estimates:** VAT or turnover tax and PAYE, using rates stored in settings (never hard-coded; the accountant confirms them); monthly export for the accountant; KRA eTIMS if required. Always labelled as estimates.
   - **Stock:** film rolls, metres per job, cost per metre, low-stock alerts, supplier orders.
   - **Staff pay:** days or shifts worked, per-job commission, monthly summaries.
   - **Owner alerts:** big payments, refunds, price changes, by push or WhatsApp.
   - **Reports:** funnel from lead to delivery, profit by service, top cars and films, repeat customers.
   - **M-Pesa payment prompts** to the customer's phone.

## Open questions for the owner

Blocking:
- How is a price built (car size, film, coverage, extras), and where does the Studio estimate end and the staff quote begin?
- Services in scope: colour change, PPF, tint and ceramic only, or also printed graphics and fleet branding?
- No-show rule: when is an unconfirmed booking released?
- Is car check-in with photos and sign-off in for launch?
- Launch date and budget ceiling; who pays the monthly running costs.
- **The company email** for registering Vercel, Supabase, the domain and the other accounts.

For the ERP and along the way: VAT or turnover tax and who the accountant is; staff roles needed and what each sees; how staff are paid; which expenses to track; which phone alerts; staff names; number of bays and opening hours; which 6 to 10 cars launch with spins; details and consent for the five finished cars; film stocked or ordered per job and supplier lead time; warranty terms; eTIMS; whether a colour change must be updated with NTSA; M-Pesa till or paybill; what success looks like after three months.

## Known issues and gotchas

- The settings cache in `server/db.js` is per serverless instance. Anything that must be consistent across instances (like the intake key) reads the table directly.
- `.env.local` holds Supabase keys, the Supabase access token for `db:setup`, Kaggle keys and a Sketchfab token.
- The Studio JS chunk is about 700 KB because three.js is not lazy-loaded yet (Roadmap 4).
- `models-src/` holds the raw GLBs (G 63 40 MB, Prado 63 MB, etc.) and `credits.json`; Creative Commons models need a credit line wherever their renders appear.
- Fixed earlier: the G 63 recipe in `dev/recipes.json` once looked like it missed the red arches. The real cause was Blender's `.001` material copies (now matched). The calipers use `vehicle_generic_smallspecmap__PAINT_2` and must stay unwrapped.
