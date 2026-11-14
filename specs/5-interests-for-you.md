# Pick your interests on Home and filter the schedule "For you"

## What this changes
A first-time attendee opening Home gets a modal listing the `topic` and `tech` tags; saving stores their picks, closes it and it never reopens for them. Home gains one button (`edit-interests`) that reopens the picker pre-filled. With at least one pick, `/schedule` shows a **For you** toggle (`?forYou=1`, `aria-pressed`) that narrows grid and list to sessions carrying any picked tag and composes with track, day and the other filters. With no picks the toggle is absent and the schedule is unchanged. Each attendee has their own picks and seen flag.

## Where
- `server/db.js` — `SCHEMA`: add `user_interests (user_id, tag_id, PK both, FK cascade)` and `users.interests_seen INTEGER NOT NULL DEFAULT 0`; add `user_interests` to `dropAll()` before `tags`/`users`. (The existing free-text `users.interests` column is unrelated legacy seed data; leave it.)
- `server/seed.js` — no picks seeded and `interests_seen` left at 0, so every seeded attendee meets the picker on Home until they save or skip. `visit()` in `tests/helpers.js` routes `GET /interests` to `seen: true` for every spec but the picker's (`firstVisit: true`), so no spec writes the shared flag.
- `server/lib/query.js` — `toInterests(rows, seen)` mapper returning `{ tags: [{ name, slug, kind }], seen }`; `toUser` unchanged.
- `server/routes/users.js` — `GET /:id/interests`; `PUT /:id/interests` body `{ tagSlugs: [] }` replaces the set in one transaction and sets seen; 400 on a slug that is not a `topic`/`tech` tag; 404 unknown attendee; `DELETE /:id/interests` clears picks and seen (lets a test or a future "reset" return to first-time).
- `server/routes/sessions.js` — `GET /`: new `interestedIn` param (user id) adding `EXISTS (session_tags st JOIN user_interests ui ON ui.tag_id = st.tag_id WHERE st.session_id = s.id AND ui.user_id = ?)`. Zero picks therefore returns nothing, which is why the UI hides the toggle then.
- `src/lib/api.js` — `getInterests(userId)`, `saveInterests(userId, tagSlugs)`; `interestedIn` rides the existing `getSessions(filters)`.
- `src/lib/store.jsx` — per-attendee `interestSlugs` (Set) and `interestsSeen`, cleared and reloaded in the `[currentUserId]` effect beside `followingIds`; exposed with `saveInterests(slugs)` (named apart from `currentUser.interests`).
- `src/components/InterestsPicker.jsx` (new) — modal built like `ConflictDialog` (focus, Escape); chips grouped Topics / Tech from bootstrap `tags` filtered to those two kinds; buttons `interests-save`, `interests-skip` (saves nothing but marks seen); testids `interests-picker`, `interest-<slug>`; chips wrap and the dialog scrolls at 375px.
- `src/pages/HomePage.jsx` — render the picker once `interestsSeen === false` loads for the current attendee; add the `edit-interests` button showing the pick count.
- `src/pages/SchedulePage.jsx` — `forYou` filter from `params.get('forYou')`; pass `interestedIn: currentUserId` to `api.getSessions` and add it to `useFetch` deps; toggle in `rail` only when `interestSlugs.size > 0`; add to `activeKeys` and `BLOCKERS` (`['forYou', 'a For you filter']`) since it scatters the grid; if the picks become empty ignore the param. Grid vs list follows existing blocker behaviour.
- Tests: `tests/api/interests.test.js` (new, `startApi()` from `tests/api/harness.js`); `tests/interests.spec.js` (new) using `laneFor`, `visit`, `momentOn`, `waitForResults` from `tests/helpers.js`; add `LANES` entries `'interests.picker'` (desktop kenji, mobile marcus) and `'interests.filter'` (desktop sofia, mobile abraham), both `agenda: false` with a day, so `tests/unit/lanes.test.js` holds. Each test starts with `DELETE /interests` for its own attendee and pins the clock with `at: await momentOn(0, MID_SESSION_TIME)`.
- Docs: `schedule.md` (param table, `forYou`), `ui.md` (HomePage no longer static, picker), `seats.md`-neighbour `agenda.md` untouched; `architecture.md` (store fields, endpoints), `data-model.md` (table, column), `seed.md` (all seen), `testing.md` (lanes); `CLAUDE.md` "Deliberately unbuilt" Home note. `node scripts/context.mjs for <files>` to confirm.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| First-time picker lists only `topic`/`tech`; save closes it, never again | spec: reset attendee, open Home, every `interest-*` chip slug is in the API's topic/tech tags and none is audience/vibe, pick two, save, reload Home, no `interests-picker`; API: PUT with an audience slug is 400 | spec + API |
| Each attendee has own picks and seen state | API: PUT as user A, GET as B is empty and unseen; spec: switch attendee in the header, picker state follows | API + spec |
| Reopen, change, save; clearing hides **For you** | spec: `edit-interests` opens pre-filled, change picks, saved; save none, `for-you-toggle` count 0; API: PUT `[]` then `interestedIn` returns no sessions | spec + API |
| For you matches any picked tag, grid and list, combines with track | API: `/sessions?interestedIn=` equals the sessions whose tags intersect the picks (and differs from the unfiltered list), and with `trackSlug` equals the intersection; spec: toggle on, `result-count` matches the API's count in `view=list`, then on a day with `view=grid` forced via the blocker notice, then with a track chip | API + spec |
| Matching rule in API tests; flows in lane specs with pinned clock | the files above, run in `npm test` and `npm run verify` | API + spec |
| Desktop and 375px | the specs run in both Playwright projects; mobile clicks `Filters` before the toggle (testing.md gotcha) | spec |
| Docs and CLAUDE.md updated | `tests/unit/context.test.js` and the `context.mjs for` check; review | unit |

## Decisions
1. No criterion already holds on main (no interests store, picker or filter exists); nothing to re-read.
2. Every seeded attendee starts unseen, so the picker opens on Home for anyone with no picks who has not dismissed it (agenda or not). Changed after review on the preview: seeding everyone as seen made the picker impossible to find, and every seeded attendee holds seats, so gating on an empty agenda would never show it.
3. Add a **Skip** that marks seen without picks, so a closed picker does not nag; the ticket only names Save — OK?
4. With For you on, grid is treated as unavailable (a `BLOCKERS` entry, like track), so the page falls back to list with the existing "Show whole day" notice; "in grid and list view" is proved as the toggle working under both requested views — OK?
5. The URL key is `forYou=1`, and a stale `forYou` with no picks is ignored — OK?
6. Interests are stored as tag links, not on the legacy `users.interests` text column, which stays untouched — OK?

## Out of scope
Voice input, ranking by match strength, My Agenda suggestions, inferring interests from follows or reservations.
