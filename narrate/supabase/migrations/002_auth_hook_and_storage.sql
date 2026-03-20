-- ============================================================================
-- Narrate — Auth Hook (signup bonus) & Storage RLS
-- Phase 1.1: On user signup, credit 1,800 seconds (30 min) to user_credits
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Auth hook: handle_new_user trigger function
--    Creates profile, user_credits row, and signup bonus transaction.
--    This replaces the minimal handle_new_user from 001 if it exists.
-- --------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  -- Create profile
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );

  -- Create user_credits with signup bonus
  insert into public.user_credits (
    user_id,
    subscription_status,
    monthly_allowance_seconds,
    balance_seconds,
    lifetime_generated_seconds
  ) values (
    new.id,
    'free',
    0,        -- Free tier: no monthly allowance
    1800,     -- 30-minute signup bonus
    0
  );

  -- Log the signup bonus as a credit transaction
  insert into public.credit_transactions (user_id, delta_seconds, reason)
  values (new.id, 1800, 'signup_bonus');

  return new;
end;
$$;

-- Ensure the trigger exists (drop first to be idempotent)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --------------------------------------------------------------------------
-- 2. Storage RLS policies
--    covers: public read, authenticated upload to own folder
--    audio: authenticated read/write to own folder only
-- --------------------------------------------------------------------------

-- Covers bucket — public read
create policy "Public read access for covers"
  on storage.objects for select
  using (bucket_id = 'covers');

-- Covers bucket — authenticated users can upload to their own folder
create policy "Users can upload covers to own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Audio bucket — users can read their own audio files
create policy "Users can read own audio files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Audio bucket — service role uploads (Edge Functions / Modal worker)
-- Note: service role key bypasses RLS, so no explicit policy needed for uploads.
-- This policy allows users to read audio for public narrations they don't own.
create policy "Users can read audio for public narrations"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'audio'
    and exists (
      select 1 from public.narrations n
      where n.audio_url like '%' || name
        and n.is_public = true
    )
  );

-- Audio bucket — users can delete their own audio files
create policy "Users can delete own audio files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
