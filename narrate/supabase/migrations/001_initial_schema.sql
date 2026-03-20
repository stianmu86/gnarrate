-- ============================================================================
-- Narrate — Initial Schema Migration
-- Source: Technical Specification v1.1, Sections 2 & 9
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Enums
-- --------------------------------------------------------------------------

create type narration_status as enum ('pending', 'processing', 'completed', 'failed');
create type source_type      as enum ('url', 'pdf', 'text');
create type subscription_status as enum ('free', 'pro', 'cancelled');

-- --------------------------------------------------------------------------
-- 2. Tables
-- --------------------------------------------------------------------------

-- 2.0 Profiles (public-facing user data, mirrors auth.users)
create table profiles (
  id          uuid primary key references auth.users on delete cascade,
  display_name text,
  avatar_url   text,
  created_at   timestamptz default now()
);

-- 2.1 Voices (must exist before narrations due to FK)
create table voices (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  provider_voice_id text not null,
  preview_url       text,
  tier              text not null default 'standard',  -- 'standard' | 'pro'
  cost_multiplier   numeric(3,2) not null default 1.0
);

-- 2.2 Narrations
create table narrations (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users not null,
  voice_id            uuid references voices(id),
  title               text not null,
  author              text,
  content_raw         text,   -- Raw scraper output. May contain noise.
  content_cleaned     text,   -- LLM-sanitised. THIS is sent to TTS.
  source_type         source_type not null,
  source_url          text,
  audio_url           text,
  image_url           text,
  duration_seconds    int,
  word_count          int,
  total_chunks        int,            -- Set by analyze-text at chunking time
  completed_chunks    int default 0,  -- Incremented by Modal worker per chunk
  status              narration_status default 'pending',
  is_public           boolean default false,
  content_hash        text,   -- SHA-256 for deduplication
  chapters            jsonb,  -- [{ title, start_time }]
  parent_narration_id uuid references narrations(id),
  created_at          timestamptz default now()
);

-- 2.3 Follows (social layer)
create table follows (
  follower_id  uuid references auth.users on delete cascade,
  following_id uuid references auth.users on delete cascade,
  created_at   timestamptz default now(),
  primary key (follower_id, following_id)
);

-- Prevent self-follows
alter table follows
  add constraint no_self_follow check (follower_id <> following_id);

-- 2.4 Comments (timestamped on narrations)
create table comments (
  id                uuid primary key default gen_random_uuid(),
  narration_id      uuid references narrations(id) on delete cascade,
  user_id           uuid references auth.users on delete cascade,
  content           text not null,
  timestamp_seconds float,
  created_at        timestamptz default now()
);

-- 2.5 Playback progress (cross-device sync)
create table playback_progress (
  user_id                  uuid references auth.users on delete cascade,
  narration_id             uuid references narrations(id) on delete cascade,
  current_position_seconds float default 0,
  completion_percent       float default 0,
  updated_at               timestamptz default now(),
  primary key (user_id, narration_id)
);

-- 2.6 User credits & billing
create table user_credits (
  user_id                    uuid references auth.users on delete cascade primary key,
  subscription_status        subscription_status not null default 'free',
  stripe_customer_id         text,
  stripe_subscription_id     text,
  monthly_allowance_seconds  int default 0,      -- 0 = free, 30000 = Pro
  balance_seconds            int not null default 0,
  period_resets_at           timestamptz,
  lifetime_generated_seconds int default 0,
  updated_at                 timestamptz default now()
);

-- 2.7 Credit transactions (audit log)
create table credit_transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users on delete cascade not null,
  delta_seconds int not null,
  reason        text not null,
  created_at    timestamptz default now()
);

-- 2.8 Narration errors
create table narration_errors (
  id           uuid primary key default gen_random_uuid(),
  narration_id uuid references narrations(id) on delete cascade,
  error_code   text,
  error_detail text,
  occurred_at  timestamptz default now()
);

-- --------------------------------------------------------------------------
-- 3. Indexes
-- --------------------------------------------------------------------------

create index idx_narrations_user_id      on narrations(user_id);
create index idx_narrations_status       on narrations(status);
create index idx_narrations_content_hash on narrations(content_hash);
create index idx_narrations_is_public    on narrations(is_public) where is_public = true;
create index idx_comments_narration_id   on comments(narration_id);
create index idx_credit_tx_user_id       on credit_transactions(user_id);
create index idx_narration_errors_narr   on narration_errors(narration_id);

-- --------------------------------------------------------------------------
-- 4. Functions: deduct_credits / refund_credits
-- --------------------------------------------------------------------------

-- Atomically deduct credits. Returns true if successful, false if insufficient.
create or replace function deduct_credits(
  p_user_id       uuid,
  p_cost_seconds  int,
  p_reason        text
) returns boolean
language plpgsql
security definer
as $$
declare
  v_balance int;
begin
  -- Lock the row to prevent race conditions
  select balance_seconds into v_balance
    from user_credits
    where user_id = p_user_id
    for update;

  if v_balance is null then
    return false;
  end if;

  if v_balance < p_cost_seconds then
    return false;
  end if;

  update user_credits
    set balance_seconds = balance_seconds - p_cost_seconds,
        lifetime_generated_seconds = lifetime_generated_seconds + p_cost_seconds,
        updated_at = now()
    where user_id = p_user_id;

  insert into credit_transactions (user_id, delta_seconds, reason)
    values (p_user_id, -p_cost_seconds, p_reason);

  return true;
end;
$$;

-- Refund credits (e.g. on GPU failure or timeout).
create or replace function refund_credits(
  p_user_id       uuid,
  p_cost_seconds  int,
  p_reason        text
) returns void
language plpgsql
security definer
as $$
begin
  update user_credits
    set balance_seconds = balance_seconds + p_cost_seconds,
        lifetime_generated_seconds = lifetime_generated_seconds - p_cost_seconds,
        updated_at = now()
    where user_id = p_user_id;

  insert into credit_transactions (user_id, delta_seconds, reason)
    values (p_user_id, p_cost_seconds, p_reason);
end;
$$;

-- --------------------------------------------------------------------------
-- 5. Auth hook: on signup, create profile + grant signup bonus credits
-- --------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Create public profile
  insert into profiles (id, display_name)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email));

  -- Grant 30-minute (1,800 second) signup bonus
  insert into user_credits (user_id, balance_seconds)
    values (new.id, 1800);

  insert into credit_transactions (user_id, delta_seconds, reason)
    values (new.id, 1800, 'signup_bonus');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- --------------------------------------------------------------------------
-- 6. Row Level Security (RLS)
-- --------------------------------------------------------------------------

alter table profiles          enable row level security;
alter table narrations        enable row level security;
alter table voices            enable row level security;
alter table follows           enable row level security;
alter table comments          enable row level security;
alter table playback_progress enable row level security;
alter table user_credits      enable row level security;
alter table credit_transactions enable row level security;
alter table narration_errors  enable row level security;

-- -- Profiles --

-- Anyone can read profiles (needed for social features)
create policy "Profiles are publicly readable"
  on profiles for select
  using (true);

-- Users can update their own profile
create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

-- -- Voices --

-- Voices are readable by everyone (voice picker)
create policy "Voices are publicly readable"
  on voices for select
  using (true);

-- -- Narrations --

-- Users can read their own narrations
create policy "Users can read own narrations"
  on narrations for select
  using (auth.uid() = user_id);

-- Anyone can read public narrations (guest access for shared links)
create policy "Public narrations are readable by all"
  on narrations for select
  using (is_public = true);

-- Users can insert their own narrations
create policy "Users can create narrations"
  on narrations for insert
  with check (auth.uid() = user_id);

-- Users can update their own narrations
create policy "Users can update own narrations"
  on narrations for update
  using (auth.uid() = user_id);

-- Users can delete their own narrations
create policy "Users can delete own narrations"
  on narrations for delete
  using (auth.uid() = user_id);

-- -- Follows --

-- Users can see their own follows
create policy "Users can read own follows"
  on follows for select
  using (auth.uid() = follower_id or auth.uid() = following_id);

-- Users can follow others
create policy "Users can create follows"
  on follows for insert
  with check (auth.uid() = follower_id);

-- Users can unfollow
create policy "Users can delete own follows"
  on follows for delete
  using (auth.uid() = follower_id);

-- -- Comments --

-- Anyone can read comments on public narrations; owners can read all on own narrations
create policy "Comments are readable on accessible narrations"
  on comments for select
  using (
    exists (
      select 1 from narrations n
      where n.id = narration_id
        and (n.is_public = true or n.user_id = auth.uid())
    )
  );

-- Authenticated users can comment
create policy "Users can create comments"
  on comments for insert
  with check (auth.uid() = user_id);

-- Users can delete their own comments
create policy "Users can delete own comments"
  on comments for delete
  using (auth.uid() = user_id);

-- -- Playback progress --

-- Users can only access their own progress
create policy "Users can read own playback progress"
  on playback_progress for select
  using (auth.uid() = user_id);

create policy "Users can upsert own playback progress"
  on playback_progress for insert
  with check (auth.uid() = user_id);

create policy "Users can update own playback progress"
  on playback_progress for update
  using (auth.uid() = user_id);

-- -- User credits --

-- Users can only read their own credits
create policy "Users can read own credits"
  on user_credits for select
  using (auth.uid() = user_id);

-- No direct insert/update/delete from client — managed by server functions only

-- -- Credit transactions --

-- Users can read their own transaction history
create policy "Users can read own credit transactions"
  on credit_transactions for select
  using (auth.uid() = user_id);

-- No direct insert/update/delete from client — managed by server functions only

-- -- Narration errors --

-- Users can read errors for their own narrations
create policy "Users can read own narration errors"
  on narration_errors for select
  using (
    exists (
      select 1 from narrations n
      where n.id = narration_id
        and n.user_id = auth.uid()
    )
  );

-- --------------------------------------------------------------------------
-- 7. Realtime — enable for narrations table (status updates)
-- --------------------------------------------------------------------------

alter publication supabase_realtime add table narrations;
