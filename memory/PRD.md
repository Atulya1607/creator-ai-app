# CreatorAI – Auto Content Engine

## Product
AI-powered mobile app that helps Gen-Z creators generate, save, and schedule short-form content (Instagram Reels / YouTube Shorts).

## Core Flow
1. Sign up / Log in (email + password, JWT)
2. Onboarding: pick niche + goals
3. Dashboard: streak, week bars, generated & scheduled counts, recent drops
4. Create tab: pick niche, tone, duration (15s/30s/60s), language (English/Hindi/Hinglish), optional topic → tap "Generate Magic" → GPT-5.4 produces:
   - 3 trending ideas
   - Script (hook/body/CTA)
   - Voiceover text
   - Thumbnail idea
   - Caption
   - 12–15 hashtags
   - Viral score (1–10) + reasoning
5. Content viewer: copy any section, tap "Schedule Post" → date+time picker
6. Schedule tab: upcoming vs past drops
7. Profile tab: shows name/email/niche/goals + logout

## Backend Endpoints (all prefixed with /api)
- POST /auth/signup, /auth/login, /auth/onboarding
- GET /auth/me
- POST /content/generate  (LLM call)
- GET /content/list, /content/{id}
- DELETE /content/{id}
- POST /schedule
- GET /schedule/list
- GET /stats  (streak, best_streak, week_counts, totals)

## Tech
- Frontend: React Native / Expo Router, expo-clipboard, @react-native-community/datetimepicker, expo-haptics, expo-linear-gradient, Ionicons
- Backend: FastAPI + Motor (MongoDB) + JWT (PyJWT + bcrypt) + emergentintegrations
- LLM: OpenAI gpt-5.4 via Emergent Universal LLM Key
- Design: Dark obsidian (#0A0A0A) + acid lime (#CCFF00), 8-pt grid, pill CTAs

## Not Yet Implemented (deferred)
- Voiceover audio (TTS) — MVP shows text-only voiceover
- MP4 video export
- Push/local reminders — visual schedule list only
- Custom niches beyond preset list
- Multi-language auto-translate in prompt (language is passed to model)
