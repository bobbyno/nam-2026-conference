import { test, expect } from '@playwright/test';
import { API, ATTENDEES, MID_SESSION_TIME, visit, laneFor, waitForResults, shotForPR, failOnPageErrors } from './helpers.js';

const reset = (request, user) => request.delete(`${API}/users/${user}/interests`);
const tagsOfKind = async (request) => (await (await request.get(`${API}/bootstrap`)).json()).tags;

/** On a phone the filter rail sits behind a Filters button. */
async function openRail(page) {
  const filters = page.getByRole('button', { name: /^Filters/ });
  if (await filters.isVisible()) await filters.click();
}

test('first-time picker, saved picks, reopen and clear, per attendee', async ({ page, request }, testInfo) => {
  const errors = failOnPageErrors(page);
  const lane = await laneFor('interests.picker', testInfo);
  const other = lane.user === ATTENDEES.jonas ? ATTENDEES.andy : ATTENDEES.jonas;
  await reset(request, lane.user);
  const at = `${lane.day}T${MID_SESSION_TIME}`;

  const tags = await tagsOfKind(request);
  const allowed = new Set(tags.filter((t) => t.kind === 'topic' || t.kind === 'tech').map((t) => t.slug));
  const [a, b] = [...allowed];

  await visit(page, '/', { as: lane.user, at, firstVisit: true });
  const picker = page.getByTestId('interests-picker');
  await expect(picker).toBeVisible();
  const chips = await picker.locator('[data-testid^="interest-"]').evaluateAll((els) => els.map((e) => e.dataset.testid.replace('interest-', '')));
  expect(chips.length).toBe(allowed.size);
  expect(chips.every((slug) => allowed.has(slug))).toBe(true);
  await shotForPR(page, 'First-time interests picker');

  await page.getByTestId(`interest-${a}`).click();
  await page.getByTestId(`interest-${b}`).click();
  await page.getByTestId('interests-save').click();
  await expect(picker).toBeHidden();
  await page.reload();
  await expect(page.getByTestId('edit-interests')).toContainText('(2)');
  await expect(picker).toHaveCount(0);

  // Another attendee has their own state: seeded attendees have not seen it yet.
  // Only look — closing it would write that shared attendee's seen flag.
  await visit(page, '/', { as: other, at, firstVisit: true });
  await expect(picker).toBeVisible();
  await expect(page.getByTestId('interest-' + a)).toHaveAttribute('aria-pressed', 'false');

  // Reopen pre-filled, change, save; then clear everything.
  await visit(page, '/', { as: lane.user, at, firstVisit: true });
  await expect(picker).toHaveCount(0);
  await page.getByTestId('edit-interests').click();
  await expect(page.getByTestId(`interest-${a}`)).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId(`interest-${a}`).click();
  await page.getByTestId('interests-save').click();
  await expect(page.getByTestId('edit-interests')).toContainText('(1)');

  await page.getByTestId('edit-interests').click();
  await page.getByTestId(`interest-${b}`).click();
  await page.getByTestId('interests-save').click();
  await expect(page.getByTestId('edit-interests')).toContainText('Pick your interests');
  await page.goto(`/schedule?day=${lane.day}&forYou=1`);
  await openRail(page);
  await expect(page.getByTestId('for-you-toggle')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('For you narrows the schedule in list and grid requests and combines with a track', async ({ page, request }, testInfo) => {
  const errors = failOnPageErrors(page);
  const lane = await laneFor('interests.filter', testInfo);
  await reset(request, lane.user);
  const tags = await tagsOfKind(request);
  const picks = tags.filter((t) => t.kind === 'topic').slice(0, 2).map((t) => t.slug);
  await request.put(`${API}/users/${lane.user}/interests`, { data: { tagSlugs: picks } });
  const at = `${lane.day}T${MID_SESSION_TIME}`;

  const count = async (query) =>
    (await (await request.get(`${API}/sessions?day=${lane.day}&${query}`)).json());
  const mine = await count(`interestedIn=${lane.user}`);
  const dayAll = await count('');
  expect(mine.length).toBeGreaterThan(0);
  expect(mine.length).toBeLessThan(dayAll.length);

  for (const view of ['list', 'grid']) {
    await visit(page, `/schedule?day=${lane.day}&view=${view}`, { as: lane.user, at });
    await waitForResults(page);
    await expect(page.getByTestId('result-count')).toHaveText(`${dayAll.length} sessions`);
    await openRail(page);
    const toggle = page.getByTestId('for-you-toggle');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('result-count')).toHaveText(`${mine.length} session${mine.length === 1 ? '' : 's'}`);
    // For you scatters the grid, so the page falls back to the list with its notice
    await expect(page.getByTestId('grid-blocked-notice')).toContainText('For you');
  }
  await shotForPR(page, 'Schedule filtered to For you');

  // combine with a track
  const track = mine[0].track;
  const both = await count(`interestedIn=${lane.user}&trackSlug=${track.slug}`);
  await page.goto(`/schedule?day=${lane.day}&forYou=1&track=${track.slug}`);
  await expect(page.getByTestId('result-count')).toHaveText(`${both.length} session${both.length === 1 ? '' : 's'}`);
  expect(errors).toEqual([]);
});

/** A browser that can listen and speak: one utterance per listen(), spoken text recorded. */
async function fakeSpeech(page) {
  await page.addInitScript(() => {
    window.__spoken = [];
    window.SpeechRecognition = class {
      start() {
        setTimeout(() => {
          this.onresult?.({ results: [[{ transcript: 'I build AI things' }]] });
          this.onend?.();
        }, 50);
      }
      stop() { this.onend?.(); }
      abort() {}
    };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onend?.(), 10); },
      cancel() {},
    } });
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  });
}

test('talk instead ticks the matching tags, which the attendee edits and saves', async ({ page, request }, testInfo) => {
  const errors = failOnPageErrors(page);
  const lane = await laneFor('interests.voice', testInfo);
  await reset(request, lane.user);
  const at = `${lane.day}T${MID_SESSION_TIME}`;
  const [a, b] = (await tagsOfKind(request)).filter((t) => t.kind === 'topic' || t.kind === 'tech');
  let calls = 0;
  await page.route('**/api/interests/voice', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/interests/converse', (r) => {
    calls += 1;
    return r.fulfill({ json: calls === 1
      ? { reply: 'What are you building?', done: false, tags: [] }
      : { reply: 'Got it, I have ticked two.', done: true, tags: [a, b].map(({ name, slug, kind }) => ({ name, slug, kind })) } });
  });
  await fakeSpeech(page);

  await visit(page, '/', { as: lane.user, at, firstVisit: true });
  await expect(page.getByTestId('interests-picker')).toBeVisible();
  await page.getByTestId('interests-talk').click();
  await expect(page.getByTestId('interests-transcript')).toContainText('What are you building?');
  await shotForPR(page, 'Talking to the interests picker');
  await expect(page.getByTestId('interests-talk-stop')).toBeHidden({ timeout: 10000 });
  await expect(page.getByTestId(`interest-${a.slug}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId(`interest-${b.slug}`)).toHaveAttribute('aria-pressed', 'true');
  // nothing is stored until Save
  expect((await (await request.get(`${API}/users/${lane.user}/interests`)).json()).tags).toEqual([]);
  expect(await page.evaluate(() => window.__spoken)).toContain('Got it, I have ticked two.');

  await page.getByTestId(`interest-${b.slug}`).click();
  await page.getByTestId('interests-save').click();
  await page.reload();
  await expect(page.getByTestId('edit-interests')).toContainText('(1)');

  // Stop returns to the chips with nothing changed.
  await page.getByTestId('edit-interests').click();
  await page.getByTestId('interests-talk').click();
  await page.getByTestId('interests-talk-stop').click();
  await expect(page.getByTestId('interests-talk-stop')).toHaveCount(0);
  await expect(page.getByTestId(`interest-${a.slug}`)).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('talk instead is hidden without speech recognition or without a key', async ({ page, request }, testInfo) => {
  const lane = await laneFor('interests.voice', testInfo);
  await reset(request, lane.user);
  const at = `${lane.day}T${MID_SESSION_TIME}`;
  const [a] = (await tagsOfKind(request)).filter((t) => t.kind === 'topic' || t.kind === 'tech');

  // key present, browser cannot listen (Chromium ships recognition, so remove it)
  await page.addInitScript(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; });
  await page.route('**/api/interests/voice', (r) => r.fulfill({ json: { available: true } }));
  await visit(page, '/', { as: lane.user, at, firstVisit: true });
  await expect(page.getByTestId(`interest-${a.slug}`)).toBeVisible();
  await expect(page.getByTestId('interests-talk')).toHaveCount(0);

  // browser can listen, server has no key
  await page.unroute('**/api/interests/voice');
  await page.route('**/api/interests/voice', (r) => r.fulfill({ json: { available: false } }));
  await fakeSpeech(page);
  await visit(page, '/', { as: lane.user, at, firstVisit: true });
  await expect(page.getByTestId(`interest-${a.slug}`)).toBeVisible();
  await expect(page.getByTestId('interests-talk')).toHaveCount(0);
  await page.getByTestId(`interest-${a.slug}`).click();
  await expect(page.getByTestId('interests-save')).toContainText('(1)');
});
