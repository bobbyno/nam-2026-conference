# Talk to the interests picker: a voice conversation that pre-selects your tags

Stacked on #5 (branch `issue-5-interests-for-you`); merge #5 first.

## What this changes
The interests modal gains a **Talk instead** button. The attendee speaks, hears Claude's questions read aloud, and when Claude has heard enough the conversation ends and the matching `topic`/`tech` chips in the same picker are ticked. Nothing is saved: the attendee edits the chips and presses Save exactly as in #5. The button is absent when the browser has no `SpeechRecognition` or the server has no `ANTHROPIC_API_KEY`; the picker is then unchanged.

## Where
- `server/lib/interviewer.js` (new) — pure `matchTags(candidates, vocabulary)`: lower-cases and trims, keeps only slugs in the vocabulary (`topic`/`tech` tags), drops duplicates and non-strings, returns slugs in vocabulary order. Also `converse(messages, vocabulary, { model = callClaude })`: builds the system prompt (the allowed slugs and names, ask short questions, finish after about 4 turns or when the attendee says they are done, reply as JSON `{ reply, done, tagSlugs }`), calls the model, parses leniently (non-JSON text becomes `{ reply: text, done: false, tagSlugs: [] }`), and runs `tagSlugs` through `matchTags`. `callClaude` is a plain `fetch` to `https://api.anthropic.com/v1/messages` (`x-api-key`, `anthropic-version: 2023-06-01`, model from `ANTHROPIC_MODEL`, default `claude-haiku-4-5`); no SDK. `voiceAvailable()` is `Boolean(process.env.ANTHROPIC_API_KEY)`.
- `server/routes/interests.js` (new), mounted in `server/index.js` as `/api/interests` — `GET /voice` returns `{ available }`; `POST /converse` takes `{ messages: [{ role: 'user'|'assistant', content }] }` (400 on a malformed or over-long list, 503 when no key, 502 when the model call fails), reads the vocabulary from `tags` where `kind IN ('topic','tech')`, answers camelCase `{ reply, done, tags: [{ name, slug, kind }] }` (rows through a `toInterestTag` mapper in `server/lib/query.js`, the same shape `toInterests` uses). The key is read only here and never sent to the browser.
- `src/lib/api.js` — `getVoiceStatus()` and `converse(messages)`; the only `fetch` callers.
- `src/lib/speech.js` (new) — `recognitionCtor()` (`window.SpeechRecognition ?? webkitSpeechRecognition`), `listen()` (one utterance as a promise, rejects on error or no speech) and `speak(text)` (`speechSynthesis`, resolves on end or when synthesis is absent). Kept apart from the component so the spec can fake the browser.
- `src/components/InterestsPicker.jsx` — `Talk instead` button (`interests-talk`) beside Skip, rendered only when `recognitionCtor()` exists and `getVoiceStatus().available`. Talk mode shows the transcript, a listening state, and **Stop** (`interests-talk-stop`, back to chips with nothing changed). Loop: Claude's reply is spoken, then `listen()`, then `converse()`; on `done` the returned slugs are unioned into `chosen` and the chips show again. A recognition error or a failed route shows an inline message and leaves the chips as they were. Layout is the existing scrolling dialog, so 375px works unchanged.
- Tests: `tests/unit/interviewer.test.js` (new) for `matchTags` and `converse` with a stub model; `tests/api/interests-voice.test.js` (new, `startApi()`) — the harness passes the env through, so the stub is set with `setModel(fn)` exported from `interviewer.js`, never the network; `tests/interests.spec.js` gains a test on a new lane `'interests.voice'` (desktop kenji day 0, mobile marcus day 1, both `agenda: false`, added to `LANES` in `tests/helpers.js` and counted by `tests/unit/lanes.test.js`) which `addInitScript`s a fake `SpeechRecognition`/`speechSynthesis` and `page.route`s `**/api/interests/voice` and `**/api/interests/converse`. Each test starts with `DELETE /interests` for its own attendee and `visit(..., { firstVisit: true, at })` with the clock pinned.
- Docs: `architecture.md` (the two endpoints, the env var), `ui.md` (picker's talk mode, `speech.js`), `testing.md` (the new lane; no test calls Anthropic), `schedule.md` untouched. `node scripts/context.mjs for <files>` confirms. `.env` is already ignored; document `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` in `architecture.md`.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| Finishing the conversation ticks matching tags; they can be changed and Save behaves as in #5 | spec: fake speech and a routed `converse` that finishes with two slugs, both `interest-<slug>` chips become `aria-pressed=true`, `GET /interests` still has no tags until Save, untick one, Save, reload shows `(1)` | spec |
| Talk instead hidden with no speech support or no key; picker unchanged, no key needed in CI | spec: no fake recognition, `interests-talk` count 0 and chips work; second case with recognition but `voice` answering `available: false`, still 0; API: `GET /interests/voice` is `{ available: false }` and `POST /converse` is 503 with no key | spec + API |
| Only existing `topic`/`tech` tags can be selected | unit: `matchTags` drops an audience slug, an unknown slug, duplicates and non-strings; API: stub model returns `['<audience slug>', 'nope', '<topic slug>']`, response `tags` holds just the topic | unit + API |
| Tag matching is pure with unit tests; route covered with the model stubbed; no real API call | `tests/unit/interviewer.test.js`, `tests/api/interests-voice.test.js` with `setModel`; no key is set in any test | unit + API |
| Desktop and 375px | the voice spec runs in both Playwright projects | spec |
| Docs updated | `tests/unit/context.test.js` and the `context.mjs for` check; review | unit |

## Decisions
1. No criterion already holds on main (no voice route or button exists).
2. Is a plain `fetch` to the Messages API, with JSON-in-text and lenient parsing, acceptable rather than adding `@anthropic-ai/sdk` or tool use (the house rules favour no new dependency)?
3. Is `claude-haiku-4-5` the right default model, overridable with `ANTHROPIC_MODEL` — OK?
4. Is a conversation capped at 8 user turns, after which the server forces `done: true` with whatever tags it has — OK?
5. Does a finished conversation add to the chips already ticked (union) rather than replace them — OK?
6. Is availability a small `GET /api/interests/voice` rather than a field on `/bootstrap`, so the contract tests and bootstrap stay untouched — OK?
7. Should the first transcript line say the attendee's words go to Claude through the server (a one-line notice), given speech recognition in Chrome already uses a cloud service — OK?

## Out of scope
Ranking sessions by match, My Agenda suggestions, inferring interests from follows or reservations, saving without confirmation, a speech SDK or transcription service.
