# GearTrack (Supabase + Static Frontend)

GearTrack is a static HTML/CSS/JS app backed by Supabase (Postgres + Auth + RLS). The UI includes: Dashboard, Inventory, Checkouts, Maintenance, and Procurement.

## What We Completed

- Supabase database schema created and verified (9 public tables) via `supabase_s.sql`.
- Frontend connected to Supabase:
  - Auth: sign up, sign in, sign out, session restore, and profile fetch.
  - Data loading: inventory, checkouts, maintenance, purchase orders.
  - Notifications: persistent per-user notifications with Supabase Realtime updates.
- Public entry flow:
  - `index.html` is the public landing page with Supabase login and registration.
  - `geartrack.html` is the protected Supabase-backed application.
  - Authenticated users are redirected to `geartrack.html`; unauthenticated users are redirected to `index.html`.
- Frontend alignment fixes to follow the final schema:
  - Procurement status label for `shipped` is displayed correctly.
  - Admin-only behaviors are consistent (maintenance/procurement).
  - Button actions use safe click-event handling (avoids browser issues).
  - Email input updated to be universal (`you@example.com`) and normalized to prevent “invalid format” from accidental spaces/casing.

## Files

- `index.html` — public landing page and authentication entry point
- `landing.js` — Supabase login, registration, and landing-page session redirect
- `geartrack.html` — authenticated GearTrack application shell
- `app.js` — authenticated application logic and Supabase data loading
- `styles.css` — shared landing and application styles
- `supabase_s.sql` — final Supabase schema + seed data + RLS policies + RPC function
- `GearTrack_Milestones_for_Trae_AI.md` — milestone plan

## Supabase Setup

1) In Supabase → SQL Editor, run `supabase_s.sql` to create:
- `profiles`
- `equipment_categories`
- `equipment`
- `borrow_requests`
- `borrow_request_items`
- `checkouts`
- `maintenance`
- `purchase_orders`
- `activity_logs`
- `notifications`

2) Seed data should appear for:
- equipment_categories (5)
- equipment (12)
- maintenance (5)
- purchase_orders (2)

## Creating Users & Admin Role

Users live in Supabase Auth (`auth.users`) and profiles are linked by UUID.

1) Create an account using the app (Sign up) or Supabase Dashboard:
- Supabase → Authentication → Users → Add user

2) Promote a user to admin:
```sql
UPDATE profiles SET role = 'admin' WHERE email = 'admin@example.com';
```

## Notifications

The notification table, RLS policies, database triggers, and Supabase Realtime publication are included in `supabase_s.sql`. Run the updated SQL file in the Supabase SQL Editor before testing notifications. The app then shows an unread badge and notification panel for:

- New borrow and return requests for admins
- Borrow, checkout, and return decisions for users
- Inventory changes for users
- Maintenance and procurement changes for other admins


## Running Locally

Open `index.html` in a browser via a local static server (recommended):
- VS Code “Live Server” extension, or any simple local server

After signing in, the app opens at `geartrack.html`. Do not open `geartrack.html` directly without an authenticated Supabase session; it redirects back to `index.html`.

## Deployment (Recommended Workflow)

- Push the project to GitHub
- Connect Netlify to the GitHub repo (“New site from Git”)
- Ensure Netlify publishes the directory that contains `index.html`

## Testing Checklist (Milestones 3–4 + current features)

- Auth
  - Sign up creates a user in Supabase Authentication → Users
  - `profiles` row auto-created (trigger)
  - Sign in/out works, session restores on refresh
- RLS / Role gating
  - Regular user can read inventory but cannot read maintenance/procurement tables
  - Admin can access maintenance/procurement
- Inventory
  - Loads equipment from Supabase and filters by category
- Checkouts / Returns
  - “Mark Returned” updates checkout status and increments equipment availability via RPC
- Maintenance
  - “Mark Complete” updates maintenance status to completed

## Next Step (Planned for Tomorrow)

Refactor `index.html` into separate modules for easier maintenance:
- Move CSS to its own file (e.g., `styles.css`)
- Move JS to its own file(s) (e.g., `app.js` / module-based split by feature)
- Keep the same UI/behavior, but improve maintainability by separating concerns