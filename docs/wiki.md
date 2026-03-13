# Wiki — wiki.subsurfaces.net

## Wiki Subdomain

- [x] `wiki.subsurfaces.net` Worker custom domain configured
- [x] `useIsWiki` hook (hostname + VITE_WIKI_MODE detection)
- [x] WikiShell with BgCanvas, QuickControls, breadcrumb, simplified CornerMenu
- [x] Wiki content: index, Philosophers, Concepts, Movements, Chatters sections
- [x] Wiki index routing: `wiki.subsurfaces.net/` correctly resolves to `Wiki/index.md`
- [x] Case-insensitive `contentIndex` lookup via `resolveSlug` — fixes titles/metadata on all wiki pages

---

## Wiki Submission System

- [x] `src/worker.ts` — CF Worker entry point handles `POST /api/submit` (Turnstile + GitHub PR)
- [x] `WikiSubmitPage.tsx` — 4-step form: basic info → survey (35 questions) → page body editor → review
- [x] Survey dropdowns include "Other…" option with inline free-text input
- [x] Markdown editor with toolbar, word count, MDX syntax guide
- [x] Profile image: upload file or paste URL; committed to `content/Media/Wiki/chatters/` on PR branch
- [x] Draft save/load: `localStorage` auto-restore, download/upload `.json` draft file
- [x] Upload draft on step 1 — jumps straight to review step
- [x] Submissions create PR against `master` branch with `tags: [wiki, chatter]`
- [x] Turnstile + GitHub token configured in CF Worker runtime secrets
- [x] End-to-end submission verified in production

### Wiki Worker Endpoints

- [x] `POST /api/submit` — new chatter submission (Turnstile + GitHub PR)
- [x] `POST /api/edit` — edit existing wiki article (creates GitHub PR)
- [x] `POST /api/new` — create new wiki article (creates GitHub PR)
- [x] `GET /api/lock-status` — check wiki page lock status (concurrent editing guard)
- [x] `GET /api/user/:username` — public user profile
- [x] `GET /api/auth/me` — current user profile (with avatar fallback)
- [x] `PUT /api/auth/profile` — update username/bio
- [x] `POST /api/auth/register` — register new user + auto-create profile row
- [x] `POST /api/profile/avatar` — upload avatar to Supabase Storage
- [x] `GET/POST/DELETE /api/bookmarks` — bookmark CRUD
- [x] `POST /api/bookmarks/migrate` — migrate localStorage bookmarks to Supabase

---

## Wiki Subdomain UX Fixes

- [x] **Submit page 404 in wiki subdomain**: added dedicated `/submit` route in router (before catch-all) rendering `WikiSubmitPage`
- [x] **Tag/folder pages unconstrained width in wiki**: removed `tags`/`folder` from article slug list in `resolveLayout`; also fixed `NoteBody` frontmatter override to not force article layout for tag/folder pages
- [x] **Search overlay links broken in wiki**: `handleSelect` now uses `navigate()` in wiki mode instead of `pushCard` (which requires PanelStack)
- [x] **TerminalTitle home button**: wiki logo now links to `/` (wiki root) instead of `https://subsurfaces.net`
- [x] **Tag/folder links not navigating in wiki**: `usePanelClick` was intercepting all clicks (hooks run before conditional shell return) — added `isWiki` bail-out so wiki lets links navigate normally
- [x] **Cross-domain backlinks broken in wiki**: backlinks to non-wiki slugs now link to `https://subsurfaces.net/{slug}` instead of `/{slug}`, preventing the wiki router from swallowing them

---

## Wiki Content & Structure

- [x] **Wiki frontmatter cleanup**: add explicit `type` fields where semantically appropriate (chatters, philosophers); leave slug-based article rule as fallback
- [x] **Wiki tag taxonomy**: standardised tags (`philosopher`, `chatter`, `concept`, `movement`) on all wiki content; section links on index page route to `/tags/{type}`
- [x] **Wiki index redesign**: make it a proper hub page — section links (tag-based), recent additions, community stats
- [x] **Wiki page organisation**: establish standard wiki pages (index, about, guidelines, submit)

---

## Wiki Contributor Experience

### Phase 1: Visible Auth & Signup

- [x] Auth controls in WikiShell header (bottom-left): "Log in / Sign up" when logged out, username + role badge + dropdown when logged in
- [x] WikiAuthModal: Login + Signup tabs; signup validates username (3-30 chars) + checks uniqueness
- [x] `useAuth` exposes `username`, `bio`, `avatar_url`, `created_at`; adds `signUp()` and `updateProfile()` methods
- [x] Worker: `GET /api/auth/me` returns full profile fields; `PUT /api/auth/profile`; `POST /api/auth/register`; auto-creates profile row on first login

### Phase 2: User Profile Pages

- [x] `WikiProfilePage` — username, role badge, join date ("joined {date}" from `profiles.created_at`), contribution count, bio (inline-editable), edit history table, bookmarks list
- [x] Username change from own profile page (validated, uniqueness-checked server-side)
- [x] Routes: `/profile` (own) and `/user/:username` (public)

### Phase 3: Editor Improvements

- [x] Markdown preview toggle in `WikiMarkdownEditor` (react-markdown + remark-gfm, lazy-loaded)
- [x] Required edit summary field (max 200 chars) on both WikiEditPage and WikiNewPage
- [x] Change summary box: "+N lines added, -M removed" shown before submit in WikiEditPage

### Bookmarks

- [x] `useBookmarks` hook — Supabase-backed when logged in, localStorage fallback when logged out
- [x] Auto-migrates localStorage bookmarks to Supabase on first login
- [x] Bookmark button on all article pages (wiki + main site) in note header
- [x] Bookmarks list on own profile page with remove button
- [x] Worker endpoints: `GET/POST/DELETE /api/bookmarks`, `POST /api/bookmarks/migrate`
- [x] Supabase `bookmarks` table with `UNIQUE(user_id, slug)` constraint

### Auth & Security

- [x] **`signInWithPassword()`** added to `useAuth` — ready for password auth UI
- [x] **Password auth UI**: `WikiAuthModal` login tab now shows email + password fields → `signInWithPassword`; signup still uses magic link for email verification.
- [x] **Magic link → profile redirect**: `emailRedirectTo` changed to `${origin}/profile`; `WikiProfilePage` detects OTP-only session (no password) via `session.user.amr` and shows accent notice prompting user to set a password; `WikiAuthModal` sent-state message updated accordingly.
- [x] **Custom SMTP**: Resend configured via `smtp.resend.com:465` — bypasses Supabase free tier 3 emails/hour limit.
- [x] **`handle_new_user` security fix**: `ALTER FUNCTION public.handle_new_user() SET search_path = public` applied to resolve mutable search path warning.

### Navigation

- [x] **TerminalTitle cross-shell nav**: all three shells show cross-domain links beside title — notes shows wiki|chat, wiki shows notes|chat, chat shows wiki|notes. `.chatNav`, `.chatNavLink`, `.chatNavDivider` styles in `TerminalTitle.module.scss`.
- [x] **QuickControls in ChatShell**: `variant="chat"` hides MusicBar, SearchButton, BgModeToggle.
- [x] **Dev auto-login**: `VITE_DEV_AUTH_EMAIL` + `VITE_DEV_AUTH_PASSWORD` in `.env.local` — `useAuth` silently calls `signInWithPassword` on mount in dev when no session. Fill in credentials in `.env.local`. Never committed.

### Future

- [ ] Contributor dashboard (recent activity, stats)
- [ ] Watchlist (get notified when bookmarked pages are edited) — needs Supabase `watchlist` table
- [ ] Page metadata editing (description, tags) from hidden menu (`#`)
- [ ] **Bookmarks: move off AppShell** — `AppShell` currently imports Supabase client for bookmarks, violating the "garden has no Supabase dependency" rule. Bookmarks should live entirely on `wiki.subsurfaces.net`; remove Supabase import from `AppShell` and `useBookmarks` hook from the main site
- [ ] **Supabase RLS audit**: `bookmarks`, `edit_log`, `page_locks` tables have no RLS policies. Acceptable for now (trusted editors only). Before public launch: own-row-only for bookmarks; insert-only for edit_log; admin-only lock management.
- [ ] Wiki community features (comments, reactions)
