# Build the My Agenda page: a read-only view of your reserved sessions

## What this changes
`/my-agenda` stops being a "coming soon" panel. It lists the signed-in attendee's
sessions, confirmed and waitlisted, grouped by day and in time order. Each day
shows booked hours (confirmed seats only) and, apart, `+Nh waitlisted`. Waitlisted
rows are marked, overlapping sessions are flagged (display only), and the session
in progress now, or else the next one on the current day, is highlighted. No
buttons change seats. With nothing reserved it shows an empty state.

## Where
- `src/lib/agendaDays.js` (new, pure) — `buildAgendaDays(days, reservationFor)`: re-filters each day's
  sessions through the store's `reservationFor`, recomputes `conflicts` (pairwise overlap, both
  statuses), `totalMinutes` (confirmed only) and `waitlistedMinutes`, drops empty days; and
  `focusSession(days, clock)` returning the id in progress on `clock.day`, else the next one.
  Test in `tests/unit/agenda-days.test.js` (no browser).
- `src/pages/MyAgendaPage.jsx` — replace the placeholder: `api.getSchedule(currentUser.id)` via
  `useFetch`, then `buildAgendaDays` over the result with `useConference()` (`reservationFor`, `clock`),
  `SessionCard variant="row"` per session, `Stat`-style note for `+Nh waitlisted`, clash badge,
  waitlist badge, highlight ring, empty state. Test ids: `agenda-day-<date>`, `agenda-row-<id>`,
  `agenda-waitlisted-<id>`, `agenda-clash-<id>`, `agenda-focus`, `agenda-empty`.
  No `new Date()`; no seat buttons.
- `tests/agenda.spec.js` (new) — `laneFor('agenda.page', testInfo)`, `visit(page, '/my-agenda', { as, at })`
  with `?at=` pinned, `momentOn`/`conferenceDays` for dates, `clearAgendaFor`/`bookableFor` for setup and
  release. Add `'agenda.page'` to `LANES` in `tests/helpers.js` on a free attendee+day pair
  (`tests/unit/lanes.test.js` checks it; andy/jonas/abraham day 1 and marcus day 2 look free).
  Read-only checks use a `readOnly: true` lane.
- `tests/home.spec.js` — the "My Agenda is a blank canvas" test asserts `agenda-coming-soon`; rewrite it to
  assert the nav link and `/my-plan` redirect reach the built page (`agenda-empty` or a day).
- `tests/smoke.spec.js` — unchanged; it already covers errors and horizontal overflow at 375px.
- Docs: `context/engineering-context/agenda.md` (placeholder section becomes "My Agenda is built",
  where it lives, test ids), `CLAUDE.md` "Deliberately unbuilt" (drop the My Agenda bullet, fix the
  Following line that points at My Agenda), `context/engineering-context/ui.md` only if it names the placeholder.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| Grouped by day, time order | `buildAgendaDays` sorts and groups an out-of-order input | unit |
| Grouping and order on screen | spec: day sections and rows in start order for the lane's attendee | spec |
| Booked hours confirmed only; waitlist apart | unit: totals for a mixed day; spec: `+Nh waitlisted` text equals `waitlistedMinutes` and booked total excludes it | unit + spec |
| Waitlisted marked | spec: waitlisted row shows `agenda-waitlisted-<id>` | spec |
| Overlaps flagged, display only | unit: conflicts from overlap; spec: `agenda-clash-<id>` present, no button in the row | unit + spec |
| Follows the store | spec: reservation released/added elsewhere (API + store update, no reload) removes/adds the row and updates totals, clash flag and empty day | spec |
| Empty state | unit: empty input gives no days; spec: `/api/users/:id/schedule` fulfilled with `days: []` shows `agenda-empty` | unit + spec |
| Highlight from `clock` | unit: `focusSession` in progress, else next, none after last; spec: `?at=` mid-session and before first session | unit + spec |
| Desktop and 375px | the new spec runs on both projects; smoke covers overflow | spec |
| Specs pin clock, own lane | the spec itself (`?at=`, `LANES['agenda.page']`) | spec |
| Docs updated | `npm test` context checks (`scripts/context.mjs for`) | unit |

## Decisions
- Empty state is proven by intercepting the schedule request with `days: []`, since every seeded attendee
  has a plan and clearing one would disturb other lanes: OK?
- A waitlisted session that overlaps a confirmed one is flagged as a clash too (matches `scheduleFor`'s
  `conflicts`, which count both statuses): OK?
- "Next one" means the next session starting later today on `clock.day`; on a day with none, or any other
  day, nothing is highlighted: OK?
- Pure logic lives in a new `src/lib/agendaDays.js` so it can be unit tested without a browser: OK?

## Out of scope
Adding, removing or swapping seats here; recommendations; Home and Following.
