# Narrate — Project Briefing for Claude Code

## What this project is
A premium personal audiobook app (iPhone + Web) that converts articles, PDFs,
and text into AI-narrated audio. Nordic minimalist design.

## Repository structure
The Expo app lives in `narrate/`. All commands (npm, jest, expo) run from there.
Root-level files (.env examples, docs) are project-wide references.

## Document index (read these before writing any code)
- `docs/01_PRD_Narrate_v1.1.docx` — Product requirements, monetisation model
- `docs/02_Technical_Specification_Narrate_v1.1.docx` — Full schema, API, architecture
- `docs/03_Visual_Identity_Manual_Narrate_v1.1.docx` — Colours, typography, components
- `docs/04_Implementation_Roadmap_Narrate_v1.1.docx` — Phase-by-phase build order
- `docs/05_Terms_of_Service_Narrate_v1.0.docx` — Legal (do not implement, for reference)

## Tech stack (do not deviate from this)
- Frontend: Expo (React Native) + Expo Router + NativeWind
- Backend: Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- AI / TTS: Modal.com (Python, edge-tts for MVP; CosyVoice/Qwen2-Audio planned for production)
- LLM logic: Regex heuristics for MVP; Llama 3.1 via Modal.com planned for production
- State management: TanStack Query
- Audio: expo-av
- Payments: Stripe
- Testing: Jest 29 + jest-expo + @testing-library/react-native

## Environments
- **Dev** (local): `.env.dev` — local Supabase instance, Stripe test keys
- **Test**: `.env.test` — separate Supabase project, Stripe test keys
- **Prod**: `.env.prod` — production Supabase (EU Frankfurt), Stripe live keys
- All env files are gitignored. See `.env.local.example`, `.env.supabase.example`, `.env.modal.example` for variable names.

## Critical rules
- NEVER use #000000 or #FFFFFF as backgrounds. Use Linen (#F7F3F0) or Night Forest (#1B1D1C).
- ALWAYS use content_cleaned (not content_raw) as TTS input.
- ALWAYS run the pre-flight credit guard before triggering any Modal worker.
- Supabase Edge Functions use SUPABASE_SERVICE_ROLE_KEY. Expo client uses SUPABASE_ANON_KEY.
- All database work: read Section 2 of the Technical Specification first.
- All UI work: read the Visual Identity Manual first.
- Every feature must have unit tests. Run `npm test` from `narrate/` before committing.

## Build order (follow Phase 0 → 1 → 2 → 3 → 4 → 5, do not skip ahead)
Phase 0: Environment setup + secrets manifest
Phase 1: Supabase schema + auth + Edge Functions + Stripe webhook
Phase 2: Modal.com GPU worker (TTS pipeline)
Phase 3: Expo app shell + routing + theming
Phase 4: Audio player
Phase 5: Polish + all error states

## Current status
- [x] Phase 0 — Environment setup (COMPLETE)
  - [x] Secrets manifest (.env.local.example, .env.supabase.example, .env.modal.example)
  - [x] Multi-environment configs (.env.dev, .env.test, .env.prod) — gitignored
  - [x] .gitignore (Expo, Node, Python, env files, secrets)
  - [x] Expo project initialised (narrate/) with tabs template
  - [x] Core dependencies installed (nativewind, tanstack query, expo-av, supabase-js, etc.)
  - [x] Tailwind config with full Nordic Earth palette from VIM
  - [x] NativeWind wiring (babel, metro, global.css, type defs)
  - [x] Fonts downloaded (Newsreader + Inter) and loaded in root layout
  - [x] NordicThemeProvider (system/light/dark mode switching, setMode())
  - [x] theme.ts with lightTheme/darkTheme constants
  - [x] Supabase client (lib/supabase.ts) — anon key only
  - [x] app.json: splash bg Linen, iOS background audio, deep link scheme
  - [x] Jest 29 + jest-expo + testing-library configured
  - [x] 12 unit tests passing (theme, NordicThemeProvider, supabase client)
  - [x] SQL migration (001_initial_schema.sql) — 9 tables, 3 enums, 3 functions, 20 RLS policies
  - [x] Migration verified on local Supabase instance
  - [x] GitHub repo created (stianmu86/gnarrate) with remote configured
- [x] Phase 1 — Infrastructure (COMPLETE)
  - [x] Auth config (Google OAuth enabled in config.toml, Email Magic Links enabled by default)
  - [x] Storage buckets (covers: public, audio: public) configured in config.toml
  - [x] Auth hook (signup bonus: 1,800 seconds) — migration 002
  - [x] Storage RLS policies (own-folder access, public narration audio) — migration 002
  - [x] Seed data: 6 narrator voices (1 standard + 5 pro)
  - [x] Edge Function: process-content (scraper, credit guard, dedup, Modal trigger)
  - [x] Edge Function: stripe-webhook (4 event handlers, signature verification)
  - [x] Shared Edge Function utils (_shared/supabase-client.ts, cors.ts)
  - [x] Modal Function: analyze-text (sanitisation, chunking, chapter detection)
  - [x] 39 unit tests passing (theme, provider, client, credit guard, analyze-text, stripe webhook)
- [x] Phase 2 — TTS Worker (COMPLETE)
  - [x] Modal container: edge-tts (Microsoft Edge TTS, high-quality neural voices)
  - [x] 6 voice personas mapped to edge-tts voices (Aria, Jenny, Guy, Ryan, Davis, Thomas)
  - [x] Sentence-boundary chunking (500 chars max, clause fallback for long sentences)
  - [x] Per-chunk TTS inference with completed_chunks progress updates
  - [x] FFmpeg stitching → MP3 128kbps with ID3 tags (Title, Artist, Album)
  - [x] Supabase Storage upload to audio/{user_id}/{narration_id}.mp3
  - [x] Completion callback: status=completed, audio_url, duration_seconds
  - [x] Failure handling: status=failed, narration_errors log, credit refund
  - [x] 55 unit tests passing (generate-audio: chunking, progress, failure, config)
- [x] Phase 3 — App shell + Nordic UI (COMPLETE)
  - [x] Root layout: auth guard, NordicThemeProvider, TanStack QueryClient, font loading
  - [x] Tab bar: Library (BookOpen) | Explore (Compass) | Profile (User)
  - [x] Auth screens: login (Google + Magic Link), onboarding (voice picker)
  - [x] Library screen: 2-column FlatList grid, Realtime subscription, EmptyState handling
  - [x] Explore screen: stub for Phase 3 / Sprint 7 social feed
  - [x] Profile screen: user info, credit balance, upgrade CTA, settings/subscription links
  - [x] Now Playing screen (item/[id].tsx): playback controls, progress bar, chapter list, ?t= deep link
  - [x] Add Narration modal (add.tsx): URL / PDF / Text tabs, inline validation, process-content call
  - [x] Paywall screen: Pro plan features, $4.99/mo, Stripe checkout placeholder
  - [x] Settings screen: dark mode toggle, system theme, cache management, account info
  - [x] Downloads screen: offline narration management stub
  - [x] NordicThemeProvider upgraded: setMode() for user override (system/light/dark)
  - [x] Reusable components: NarrationCard (status icons), EmptyState (8 edge states)
  - [x] TanStack Query hooks: useLibrary (Realtime), useNarration, useCredits
  - [x] Template files removed (two.tsx, modal.tsx)
  - [x] 79 unit tests passing across 8 suites
- [x] Phase 4 — Audio player (COMPLETE)
  - [x] useAudioPlayer hook: expo-av wrapper (load, play, pause, seek, skip ±15/30s)
  - [x] Playback rate cycling (1x → 1.5x → 2x)
  - [x] isLoaded guards on all controls (prevents "sound not loaded" crash)
  - [x] usePlaybackProgress: save/load position to Supabase (debounced every 10s)
  - [x] Now Playing screen wired to real expo-av audio
  - [x] Deep link support (?t=seconds) and resume from saved progress
  - [x] Buffering indicator, disabled controls when not ready
  - [x] Audio bucket set to public (permanent URLs, no token refresh needed)
  - [x] Dev Sign In: Free (test@narrate.dev) + Pro ⭐ (pro@narrate.dev, 3hr credits)
  - [x] Edge Functions deployed to cloud Supabase (process-content with --no-verify-jwt, stripe-webhook)
  - [x] Local text analysis pipeline (modal/run_local.py) for dev without Modal
  - [x] Add screen sends voice_id + correct field names to Edge Function
  - [x] Root-level template duplicates cleaned up
  - [x] Cloud deployment: Supabase EU Frankfurt (rtbistjbjinyywbcgbyg) + Modal (stianmu86)
  - [x] Full end-to-end pipeline tested: text → Edge Function → Modal analyze → Modal TTS → MP3 → player
  - [x] Chapters parsing fixed (JSON string → array, hide single-chapter view)
  - [x] PR #4 merged
  - [x] 112 unit tests passing across 9 suites
- [ ] Phase 5 — Polish + error states
