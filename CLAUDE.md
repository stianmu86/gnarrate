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
- AI / TTS: Modal.com (Python, A10G GPU, Qwen2-Audio / CosyVoice)
- LLM logic: Llama 3.1 via Modal.com
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
  - [x] NordicThemeProvider (system/light/dark mode switching)
  - [x] theme.ts with lightTheme/darkTheme constants
  - [x] Supabase client (lib/supabase.ts) — anon key only
  - [x] app.json: splash bg Linen, iOS background audio, deep link scheme
  - [x] Jest 29 + jest-expo + testing-library configured
  - [x] 12 unit tests passing (theme, NordicThemeProvider, supabase client)
  - [x] SQL migration (001_initial_schema.sql) — 9 tables, 3 enums, 3 functions, 20 RLS policies
  - [x] Migration verified on local Supabase instance
  - [x] GitHub repo created (stianmu86/gnarrate) with remote configured
- [ ] Phase 1 — Infrastructure (NEXT)
  - [ ] Auth config (Google OAuth + Email Magic Links)
  - [ ] Storage buckets (covers: public, audio: private)
  - [ ] Auth hook (signup bonus: 1,800 seconds)
  - [ ] Edge Function: process-content (scraper + credit guard)
  - [ ] Modal Function: analyze-text (Llama 3.1)
  - [ ] Edge Function: stripe-webhook
- [ ] Phase 2 — GPU Worker (TTS pipeline)
- [ ] Phase 3 — App shell + Nordic UI
- [ ] Phase 4 — Audio player
- [ ] Phase 5 — Polish + error states
