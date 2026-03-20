-- ============================================================================
-- Narrate — Seed Data
-- 6 Narrator Voices (from PRD Section 3.2)
-- Free tier: only 'The Neutral' (tier = 'standard')
-- Pro tier: all 6 voices
-- ============================================================================

insert into voices (name, provider_voice_id, tier, cost_multiplier) values
  ('The Neutral',       'cosyvoice-neutral',     'standard', 1.0),
  ('Warm',              'cosyvoice-warm',         'pro',      1.0),
  ('Smooth',            'cosyvoice-smooth',       'pro',      1.0),
  ('Deep',              'cosyvoice-deep',          'pro',      1.0),
  ('Storyteller',       'cosyvoice-storyteller',   'pro',      1.2),
  ('Resonant Male',     'cosyvoice-resonant-male', 'pro',      1.0)
on conflict do nothing;
