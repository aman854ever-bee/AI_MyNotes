# Testing — current state, honestly

Short version: there is a small, real, automated unit test suite (80
tests) for the app's pure logic — date/time formatting, phone number
normalization, calendar day-grouping, microphone-permission guidance, and
calendar provider setup requirements. There is **no** test coverage for
anything that touches Supabase, Dexie, calendar OAuth round-trips, actual
audio capture, transcription, or React component/UI behavior. Don't read
"tests pass" as "the app is tested" — this doc exists so that gap stays
visible instead of getting papered over.

In particular, two things these tests deliberately do **not** prove:
the microphone tests check what the app *says* about a permission
failure, never that capture itself works (that needs a real device with a
real mic); and the calendar tests check the setup model, never that a
real OAuth round-trip or a real Graph/Google API call succeeds.

## What exists today

`apps/web/src/lib/format.test.ts` — 35 unit tests covering every pure
function in `lib/format.ts`:

- `relativeDate`, `formatDuration`, `dayLabel`
- `normalizePhone`, `formatCooldown` (used by the phone/email login flow)
- `startOfDay`, `sameDay`, `formatTimeRange`, `groupByDay` (used by the
  Calendar/Meetings agenda view)

These functions used to live inline inside `Login.tsx` and `Calendar.tsx`
and weren't exported, which made them untestable in isolation without
also pulling in React, JSX, and Supabase — none of which resolve without
`npm install`. They were moved into `lib/format.ts` (pure, zero
dependencies) specifically so they could be tested on their own; the
pages now import them from there instead of defining them locally. Pure
behavior, not moved for any other reason.

`apps/web/src/lib/micGuidance.test.ts` — 15 tests covering the
microphone-permission decision logic in `lib/micGuidance.ts`: mapping a
`getUserMedia` error name to a cause, choosing per-platform instructions
(an Android user needs OS settings, a Chrome user needs the address bar),
deciding when a retry button is pointless, and the audio-container
preference order. The regression these lock down: the recorders used to
report *every* capture failure as "Microphone access was denied", which
was wrong for missing hardware, a mic held by another app, and an
insecure origin — and on Android was shown when no permission prompt had
ever appeared.

`apps/web/src/lib/calendarRequirements.test.ts` — 14 tests covering the
calendar provider setup model in `lib/calendarRequirements.ts`: the
Supabase callback URL that providers must be told to allow (registering
the app's own URL instead is the usual cause of `redirect_uri_mismatch`),
that Microsoft maps to Supabase's `azure` key and requests
`offline_access`, that Google stays read-only, that no step ever carries a
secret's value, and the pass/fail roll-up that gates the Connect button.

`apps/web/src/lib/syncSchedule.test.ts` — 16 tests covering automatic
sync scheduling in `lib/syncSchedule.ts`: when a sync is due, the retry
guard that stops a failing sync looping, the timer floor that stops a
0ms timeout spinning, and preference clamping. This one has already
earned its keep — it caught a real bug where `Number(null)` being `0`
(finite!) made a null interval clamp to the *minimum* of 5 minutes
rather than fall back to the 30-minute default, silently syncing six
times more often than intended.

### Why Node's built-in test runner instead of Vitest/Jest

This repo has no test framework installed, and `npm install` isn't
reachable from the sandbox these tests were first written in (see the
network note in `docs/android-build.md` — same underlying restriction).
Node 22.6+ ships a built-in test runner (`node:test`) and can run
TypeScript directly via `--experimental-strip-types`, so the suite runs
with zero installed dependencies:

```
cd apps/web
npm run test
```

The script lists its test files **explicitly**:

```
node --experimental-strip-types --test src/lib/format.test.ts src/lib/micGuidance.test.ts src/lib/calendarRequirements.test.ts src/lib/syncSchedule.test.ts
```

That verbosity is deliberate. An earlier version used
`$(find src -name '*.test.ts')` to pick files up automatically, which
works in bash and silently breaks on Windows — `cmd.exe` has no `$(...)`
command substitution, so it passes the literal string through to Node,
which then tries to load a module called `src` and fails. This was
confirmed broken on a real Windows machine, fixed, and then **lost** (the
fix was made locally and never committed, so `master` carried the broken
version for a while). If you add a test file, add it to this list — do
not reintroduce shell globbing here. If the list ever gets long enough to
be annoying, replace it with a small cross-platform Node script that
walks `src/` with `node:fs`.

This also runs in CI on every push/PR — see
`.github/workflows/test.yml` — alongside the real project-wide
`npm run typecheck`, which only works where `npm install` actually
works (GitHub's runners, or your own machine — not the sandbox).

One trade-off worth flagging: `*.test.ts` files are excluded from
`tsconfig.json`'s typecheck (`exclude: ["src/**/*.test.ts"]`), so they
aren't type-checked, only run. That's a workaround, not a preference —
`node:test`/`node:assert` need `@types/node`, which isn't a project
dependency yet, and adding it isn't something that could be done safely
from the sandbox that wrote this (no way to regenerate
`package-lock.json` without `npm install`, and a dependency added
without a matching lockfile update breaks `npm ci` in CI — see the git
history for `fix(web): sync package-lock.json` for a previous instance
of exactly this problem). If you add `@types/node` as a devDependency
locally and regenerate the lockfile, drop the `exclude` line too.

## What this does NOT cover

- **Supabase**: auth (OTP send/verify, Google OAuth), sync, RLS
- **Dexie**: local-first storage, offline queueing, conflict resolution
- **Calendar integration**: OAuth token capture, Google Calendar sync
- **Meeting recording/transcription**: Deepgram integration, the
  `analyze`/`chat` edge functions
- **React component behavior**: OTP input auto-advance/backspace/paste,
  save-state transitions in the note editor, navigation, anything that
  needs a DOM or user interaction
- The 8 Figma screens not yet rebuilt (voice recorder, reminders,
  pre-meeting, active recording, transcript, transcript chat,
  post-meeting intelligence, share notes)

None of that is exercised by anything automated right now. The earlier
"verification harness" built during the redesign work (a hand-rolled
Playwright screenshot script, not committed to this repo — it lived in
a scratch directory) was a visual/layout spot-check of new screens
against the real CSS, not a test suite; it caught a few real rendering
bugs but doesn't substitute for the coverage above.

## If you want real coverage later

Once `npm install` works (your machine, or CI):

- **Component/unit tests**: add Vitest + `@testing-library/react`.
  Natural next targets: the OTP digit-entry logic in `Login.tsx`, the
  note editor's `applyFormat` Markdown-wrapping logic, `db.ts`'s query
  helpers (`listOpenActionItems` etc.) against an in-memory Dexie
  instance (`fake-indexeddb`).
- **End-to-end tests**: Playwright, against a Supabase project seeded
  with test data — covers the auth flow, calendar connect, and the
  full note/meeting lifecycle for real.
- **Edge functions**: `analyze` and `chat` are currently untested even
  at the unit level — worth covering once the Anthropic-credit /
  Gemini-migration question (see the project status doc) is settled,
  since the test shape depends on which provider's response format
  they're parsing.

This is real scope — plan it as its own piece of work, not something to
bolt on in passing.
