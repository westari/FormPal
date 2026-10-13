-- FormPal Supabase schema
-- Paste this whole file into: Supabase Dashboard -> SQL Editor -> New query -> Run
-- (on the NEW FormPal project, not ATHLT's — see OVERNIGHT_REPORT.md)
--
-- Every table is keyed to auth.users and locked down with RLS so a user can
-- only ever read/write their own rows. No row is ever public.

-- ─── Onboarding answers (one row per user — the full raw answers blob) ───────
create table if not exists public.onboarding_answers (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  answers    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.onboarding_answers enable row level security;
create policy "own onboarding_answers select" on public.onboarding_answers for select using (auth.uid() = user_id);
create policy "own onboarding_answers upsert" on public.onboarding_answers for insert with check (auth.uid() = user_id);
create policy "own onboarding_answers update" on public.onboarding_answers for update using (auth.uid() = user_id);
create policy "own onboarding_answers delete" on public.onboarding_answers for delete using (auth.uid() = user_id);

-- ─── Plan (one row per user — current plan + the profile it was built from) ──
create table if not exists public.plans (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  plan       jsonb not null,
  profile    jsonb,
  updated_at timestamptz not null default now()
);
alter table public.plans enable row level security;
create policy "own plans select" on public.plans for select using (auth.uid() = user_id);
create policy "own plans upsert" on public.plans for insert with check (auth.uid() = user_id);
create policy "own plans update" on public.plans for update using (auth.uid() = user_id);
create policy "own plans delete" on public.plans for delete using (auth.uid() = user_id);

-- ─── Session log (one row per completed exercise — matches lib/sessionLog.ts's
--     SessionEntry exactly; workouts group by matching `ts`) ─────────────────
create table if not exists public.session_log (
  id            bigserial primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  ts            bigint not null,
  exercise_id   text not null,
  display_name  text not null,
  reps          int not null default 0,
  good_reps     int not null default 0,
  pct           int not null default 0,
  form_checked  boolean not null default true,
  created_at    timestamptz not null default now()
);
alter table public.session_log enable row level security;
create index if not exists session_log_user_ts_idx on public.session_log(user_id, ts desc);
create policy "own session_log select" on public.session_log for select using (auth.uid() = user_id);
create policy "own session_log insert" on public.session_log for insert with check (auth.uid() = user_id);
create policy "own session_log update" on public.session_log for update using (auth.uid() = user_id);
create policy "own session_log delete" on public.session_log for delete using (auth.uid() = user_id);

-- ─── Streaks (cached current streak, recomputed from session_log locally and
--     upserted here after every completed workout) ───────────────────────────
create table if not exists public.streaks (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  current_streak  int not null default 0,
  last_session_ts bigint,
  updated_at      timestamptz not null default now()
);
alter table public.streaks enable row level security;
create policy "own streaks select" on public.streaks for select using (auth.uid() = user_id);
create policy "own streaks upsert" on public.streaks for insert with check (auth.uid() = user_id);
create policy "own streaks update" on public.streaks for update using (auth.uid() = user_id);
create policy "own streaks delete" on public.streaks for delete using (auth.uid() = user_id);

-- ─── Progress photos (metadata only — the photo bytes live in Storage, see
--     the bucket + policies at the bottom of this file) ─────────────────────
create table if not exists public.progress_photos (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('first', 'recurring')),
  storage_path text not null,
  taken_at     timestamptz not null default now()
);
alter table public.progress_photos enable row level security;
create index if not exists progress_photos_user_idx on public.progress_photos(user_id, taken_at desc);
create policy "own progress_photos select" on public.progress_photos for select using (auth.uid() = user_id);
create policy "own progress_photos insert" on public.progress_photos for insert with check (auth.uid() = user_id);
create policy "own progress_photos delete" on public.progress_photos for delete using (auth.uid() = user_id);

-- ─── Gift-offer-shown flag (row existing = shown; never shown twice, even
--     after reinstall, since this lives server-side keyed to the account) ───
create table if not exists public.gift_offer_shown (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  shown_at  timestamptz not null default now()
);
alter table public.gift_offer_shown enable row level security;
create policy "own gift_offer_shown select" on public.gift_offer_shown for select using (auth.uid() = user_id);
create policy "own gift_offer_shown insert" on public.gift_offer_shown for insert with check (auth.uid() = user_id);

-- ─── Storage: private bucket for progress photos ─────────────────────────────
-- Run this part too (Storage policies are SQL, same editor). Objects are
-- stored at path "<user_id>/<timestamp>.jpg" — the policies below check that
-- the first path segment matches the signed-in user's own id.
insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', false)
on conflict (id) do nothing;

create policy "own progress photo read" on storage.objects for select
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own progress photo upload" on storage.objects for insert
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own progress photo delete" on storage.objects for delete
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ─── Delete-account support ───────────────────────────────────────────────────
-- All tables above use `on delete cascade`, so deleting the auth.users row
-- (done from the app via an Edge Function — see lib/formpalSync.ts /
-- OVERNIGHT_REPORT.md for why a plain client call can't delete the auth user
-- itself) removes every row in every table above automatically. Storage
-- objects are NOT auto-deleted by that cascade; the app deletes them
-- explicitly first (see deleteAccountData in lib/formpalSync.ts).
