# SiteViewPro — Backend Setup Guide

This guide covers how to set up the Supabase backend for SiteViewPro from scratch.

---

## Prerequisites

- A [Supabase](https://supabase.com) account and project
- [Supabase CLI](https://supabase.com/docs/guides/cli) installed (`npm i -g supabase`)
- Node.js 18+

---

## 1. Create a Supabase Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a new project.
2. Note your **Project URL** and **anon key** from Settings → API.
3. Note your **service_role key** from Settings → API (keep this secret).

---

## 2. Configure Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...  # your anon key
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi... # your service_role key (edge functions only)
```

> **⚠️ Never commit `.env` to version control.** The `.gitignore` should already exclude it.

---

## 3. Run the Database Migration

### Option A: Via Supabase Dashboard (easiest)

1. Open your project in the Supabase Dashboard.
2. Go to **SQL Editor**.
3. Paste the contents of `supabase/migrations/001_initial_schema.sql`.
4. Click **Run**.

### Option B: Via Supabase CLI

```bash
# Link your local project to your Supabase project
supabase link --project-ref your-project-ref

# Push the migration
supabase db push
```

---

## 4. Load Seed Data (Development Only)

After the migration runs successfully:

### Option A: Via Dashboard

1. Open the **SQL Editor**.
2. Paste the contents of `supabase/seed.sql`.
3. Click **Run**.

### Option B: Via CLI

```bash
supabase db seed
```

This creates a demo job ("Mill St Apts") with 2 floors and 14 pins.

---

## 5. Deploy Edge Functions

The app has two edge functions:

| Function | Purpose |
|----------|---------|
| `share` | Public read-only share viewer (no auth required) |
| `generate-share-token` | Creates a shareable link token (auth required) |

Deploy them with the Supabase CLI:

```bash
# Deploy all functions
supabase functions deploy share
supabase functions deploy generate-share-token

# Set secrets for the edge functions
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

> The `SUPABASE_URL` and `SUPABASE_ANON_KEY` are automatically available in edge functions.

---

## 6. Set Up the First Admin User

When a user signs in for the first time via magic link, they are automatically assigned the `field_worker` role. To promote someone to admin:

### Option A: Via Dashboard

1. Go to **Table Editor** → `profiles`.
2. Find the user's row by their UUID.
3. Change the `role` column from `field_worker` to `admin`.
4. Save.

### Option B: Via SQL Editor

```sql
-- Replace with the actual user ID from auth.users
update profiles
set role = 'admin'
where id = 'your-user-uuid-here';
```

### Finding a User's UUID

1. Go to **Authentication** → **Users** in the Dashboard.
2. Find the user by email.
3. Copy their UUID.

---

## 7. Adding New Users & Assigning Roles

### Adding Users

Users self-register by entering their email on the sign-in page. They receive a magic link and are automatically given the `field_worker` role.

### Assigning Roles

Only admins can change user roles. This can be done:

1. **Via the app** — Admins will see a user management section (when the frontend integration is complete).
2. **Via the Dashboard** — Edit the `role` column in the `profiles` table.
3. **Via SQL**:

```sql
-- Promote to office_staff
update profiles set role = 'office_staff' where id = 'user-uuid';

-- Promote to admin
update profiles set role = 'admin' where id = 'user-uuid';

-- Demote to field_worker
update profiles set role = 'field_worker' where id = 'user-uuid';
```

### Available Roles

| Role | Description |
|------|-------------|
| `field_worker` | Field crew. Can view everything, upload photos, add notes. Cannot create jobs/floors/pins or share links. |
| `office_staff` | Office team. Full CRUD on jobs, floors, pins. Can generate share links and export reports. |
| `admin` | Full access. Can archive/delete jobs, delete floors, manage users. |

---

## 8. Storage Buckets

Two private storage buckets are created by the migration:

| Bucket | Purpose | File Path Convention |
|--------|---------|---------------------|
| `floor-plans` | PDF floor plan uploads | `{job_id}/{floor_id}/plan.pdf` |
| `site-photos` | 360° photo uploads | `{job_id}/{floor_id}/{pin_id}.jpg` |

All files are private — access is via signed URLs only (generated client-side or by the share edge function).

---

## Architecture Overview

```
┌──────────────────────────────────────────────────┐
│                   React Frontend                  │
│  src/lib/supabaseClient.ts → Supabase JS Client  │
│  src/lib/auth.ts          → Magic Link Auth      │
│  src/lib/permissions.ts   → UI Permission Gating │
└──────────────────┬───────────────────────────────┘
                   │ HTTPS + JWT
                   ▼
┌──────────────────────────────────────────────────┐
│               Supabase Project                    │
│                                                   │
│  Auth ─── Magic Link (email OTP)                 │
│  DB   ─── profiles, jobs, floors, pins, shares   │
│  RLS  ─── Role-based (get_my_role())             │
│  Storage ─ floor-plans, site-photos (private)    │
│  Edge Fn ─ /share/{token}, /generate-share-token │
└──────────────────────────────────────────────────┘
```
