import { test, expect } from '@playwright/test';
import { API, visit, laneFor, bookableFor, clearAgendaFor, shotForPR, failOnPageErrors } from './helpers.js';

const mins = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const length = (s) => mins(s.endsAt) - mins(s.startsAt);
const label = (m) => (m % 60 === 0 ? `${m / 60}h` : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`);

/** Client-side navigation: the store survives, a page.goto would rebuild it. */
const spaTo = (page, path) => page.evaluate((to) => {
  window.history.pushState({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}, path);

test('My Agenda lists your seats by day, flags waitlist and clashes, and follows the store', async ({ page, request }, testInfo) => {
  const errors = failOnPageErrors(page);
  const lane = await laneFor('agenda.page', testInfo);
  await clearAgendaFor(request, lane.user, lane.day);

  // Three seats in distinct slots (A < B < C), one waitlist place W that overlaps only A.
  const open = (await bookableFor(request, lane.user, lane.day)).filter((s) => !s.isFull);
  const A = open[0];
  const B = open.find((s) => s.startsAt >= A.endsAt);
  const C = open.find((s) => s.startsAt >= B.endsAt);
  const overlap = (x, y) => x.startsAt < y.endsAt && y.startsAt < x.endsAt;
  const W = open.find((s) => ![A, B, C].some((x) => x.id === s.id) && overlap(s, A) && !overlap(s, B) && !overlap(s, C));
  expect([A, B, C, W].every(Boolean), 'the lane day has no A < B < C chain plus an overlapping W').toBe(true);

  const day = `agenda-day-${lane.day}`;
  const at = (time) => `${lane.day}T${time}`;
  const rowIds = async () => (await page.getByTestId(day).locator('[data-testid^="agenda-row-"]').evaluateAll(
    (els) => els.map((e) => Number(e.dataset.testid.replace('agenda-row-', '')))));
  const focus = () => page.getByTestId('agenda-focus');

  try {
    for (const s of [A, B, C]) {
      expect((await request.put(`${API}/users/${lane.user}/reservations/${s.id}`, { data: { day: lane.day, time: '07:00' } })).ok()).toBe(true);
    }
    // The API refuses an overlapping place, so the waitlisted clash is shown by
    // adding W to what the page is told (reservation list and schedule alike).
    const wDetail = await (await request.get(`${API}/sessions/${W.id}`)).json();
    await page.route(`**/api/users/${lane.user}`, async (route) => {
      const u = await (await route.fetch()).json();
      await route.fulfill({ json: { ...u, reservations: [...u.reservations, { sessionId: W.id, status: 'waitlisted' }] } });
    });
    await page.route(`**/api/users/${lane.user}/schedule`, async (route) => {
      const body = await (await route.fetch()).json();
      const days = body.days.map((d) => (d.date === lane.day
        ? { ...d, sessions: [...d.sessions, { ...wDetail, reservation: 'waitlisted', checkedIn: false, myStars: null }] } : d));
      await route.fulfill({ json: { ...body, days } });
    });

    // Before anything starts: grouped, in time order, totals split, flags, next session highlighted.
    await visit(page, `/my-agenda?at=${at('07:00')}`, { as: lane.user, at: at('07:00') });
    await expect(page.getByTestId(day)).toBeVisible();
    const expected = [A, B, C, W].sort((x, y) => mins(x.startsAt) - mins(y.startsAt) || x.id - y.id).map((s) => s.id);
    await expect.poll(rowIds).toEqual(expected);
    await expect(page.getByTestId(`agenda-booked-${lane.day}`)).toHaveText(`${label(length(A) + length(B) + length(C))} booked`);
    await expect(page.getByTestId(`agenda-waitlist-total-${lane.day}`)).toHaveText(`+${label(length(W))} waitlisted`);
    await expect(page.getByTestId(`agenda-waitlisted-${W.id}`)).toBeVisible();
    await expect(page.getByTestId(`agenda-waitlisted-${A.id}`)).toHaveCount(0);
    await expect(page.getByTestId(`agenda-clash-${A.id}`)).toBeVisible();
    await expect(page.getByTestId(`agenda-clash-${W.id}`)).toBeVisible();
    await expect(page.getByTestId(`agenda-clash-${B.id}`)).toHaveCount(0);
    await expect(page.getByTestId('agenda-row-' + A.id).getByTestId('reserve-seat')).toHaveCount(0);
    await expect(page.getByTestId('agenda-row-' + A.id).getByRole('button')).toHaveCount(0);
    await expect(focus()).toHaveText(String(A.id));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await shotForPR(page, 'My Agenda with a waitlist and a clash');

    // The highlight follows the pinned clock: in progress, then the next one.
    await page.goto(`/my-agenda?at=${at(A.startsAt)}`);
    await expect(page.getByTestId(`agenda-row-${A.id}`)).toHaveAttribute('data-focus', 'true');
    await page.goto(`/my-agenda?at=${at(A.endsAt)}`);
    await expect(page.getByTestId(`agenda-row-${B.id}`)).toHaveAttribute('data-focus', 'true');
    await expect(focus()).toHaveCount(1);

    // The store is the truth: release A elsewhere and it leaves, taking its clash and hours.
    await page.goto(`/my-agenda?at=${at('07:00')}`);
    await expect(page.getByTestId(`agenda-row-${A.id}`)).toBeVisible();
    await spaTo(page, `/sessions/${A.id}`);
    await page.getByTestId('release-seat').click();
    await expect(page.getByTestId('reserve-seat')).toBeVisible();
    await spaTo(page, '/my-agenda');
    await expect(page.getByTestId(`agenda-row-${A.id}`)).toHaveCount(0);
    await expect(page.getByTestId(`agenda-clash-${W.id}`)).toHaveCount(0);
    await expect(page.getByTestId(`agenda-booked-${lane.day}`)).toHaveText(`${label(length(B) + length(C))} booked`);

    // ...and a seat taken elsewhere appears without a reload.
    await spaTo(page, `/sessions/${A.id}`);
    await page.getByTestId('reserve-seat').click();
    await expect(page.getByTestId('release-seat')).toBeVisible();
    await spaTo(page, '/my-agenda');
    await expect(page.getByTestId(`agenda-row-${A.id}`)).toBeVisible();
    await expect(page.getByTestId(`agenda-clash-${A.id}`)).toBeVisible();

    // With nothing reserved: the empty state.
    await page.route(`**/api/users/${lane.user}/schedule`, (route) => route.fulfill({ json: { days: [] } }));
    await page.goto(`/my-agenda?at=${at('07:00')}`);
    await expect(page.getByTestId('agenda-empty')).toBeVisible();
    await expect(page.getByTestId(day)).toHaveCount(0);
  } finally {
    await clearAgendaFor(request, lane.user, lane.day);
  }
  expect(errors).toEqual([]);
});
