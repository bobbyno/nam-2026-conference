# Select multiple tracks in the /schedule track filter

## What this changes
The track chips on `/schedule` become toggles (`aria-pressed`). Clicking a track adds it to the selection or removes it; the list shows sessions from any selected track. "All" is active when none is selected, clicking it clears the selection, and unselecting the last track returns to All. The URL carries `?track=a,b`; the API takes `trackSlug=a,b`.

## Where
- `server/routes/sessions.js` — the `trackSlug` line in `GET /`: split on commas, drop empties, `t.slug IN (?, ?)`; one value is the same query as today. API test in `tests/api/endpoints.test.js` (its own seeded-DB style, no lane) for the union and the single-value case.
- `src/pages/SchedulePage.jsx` — Track chip block: derive `selected = filters.track === ALL ? [] : filters.track.split(',')`; each chip toggles its slug in the list and calls `set('track', list.join(','))` (empty list deletes the key, so All returns); chip gets `aria-pressed={active}`; All gets `aria-pressed={selected.length === 0}`. `filters.track` stays a string so `useFetch` deps, `activeKeys`, `BLOCKERS` and `api.getSessions` (`qs()` passes it through) need no change.
- `tests/schedule.spec.js` — new test using `visit`, `waitForResults`, `API` and `conferenceDays()` from `tests/helpers.js`; read-only, so no attendee lane is needed.
- `context/engineering-context/schedule.md` — the `trackSlug` row and the page-keys paragraph say the track filter follows the multi-value convention.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| `trackSlug=a,b` returns the union; `trackSlug=a` unchanged | new cases in `tests/api/endpoints.test.js`: union length equals the sum of the two single-track counts, ids are a superset of each | API |
| Two tracks selected list both; `result-count` matches the API | spec clicks two track chips, asserts `aria-pressed`, URL `track=a,b`, and `result-count` equals the API count for `trackSlug=a,b` | spec |
| Unselecting one leaves the other; the last returns to All | same spec removes a chip (count matches `trackSlug=a`), then the last (All pressed, no `track=` in URL, count matches unfiltered) | spec |
| `?track=a,b` opens with both selected; `?track=a` as today | spec visits `?track=a,b` and asserts both pressed and the count; `?track=a` asserts one pressed | spec |
| Doc note | `schedule.md` edited; checked by `npm test` context tests | unit |

## Decisions
- A track filter forces the list view today (`BLOCKERS`), so "in list and grid view" cannot hold for grid: keep that and prove it in list view, with the existing "Switch to grid" notice unchanged — OK?
- Two selected tracks show a chip each in the active-filter summary only if the existing summary already counts `track` as one active key; leave the summary as one "track" filter rather than one per slug — OK?

## Out of scope
The `/speakers` track filter, which stays single-select.
