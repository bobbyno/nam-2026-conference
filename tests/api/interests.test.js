import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './harness.js';

/** Interests: the picks, who sees them, and the For you matching rule. */

let api;
let close;
before(async () => { ({ api, close } = await startApi()); });
after(() => close());

const slugsOf = (body) => body.tags.map((t) => t.slug).sort();
const pickable = async () => (await api.json('/bootstrap')).tags.filter((t) => t.kind === 'topic' || t.kind === 'tech');

describe('interests', () => {
  test('a new attendee has none and has not seen the picker', async () => {
    await api.del('/users/1/interests');
    assert.deepEqual(await api.json('/users/1/interests'), { tags: [], seen: false });
  });

  test('PUT replaces the set, marks it seen and returns topic/tech tags', async () => {
    const [a, b, c] = await pickable();
    const first = await api.put('/users/1/interests', { tagSlugs: [a.slug, b.slug] });
    assert.equal(first.status, 200);
    assert.deepEqual(slugsOf(first.body), [a.slug, b.slug].sort());
    assert.equal(first.body.seen, true);
    assert.deepEqual(first.body.tags[0], { name: first.body.tags[0].name, slug: first.body.tags[0].slug, kind: first.body.tags[0].kind });

    await api.put('/users/1/interests', { tagSlugs: [c.slug] });
    assert.deepEqual(slugsOf(await api.json('/users/1/interests')), [c.slug]);
  });

  test('a slug that is not a topic or tech tag is a 400 and changes nothing', async () => {
    const [a] = await pickable();
    await api.put('/users/1/interests', { tagSlugs: [a.slug] });
    const audience = (await api.json('/bootstrap')).tags.find((t) => t.kind === 'audience');
    const bad = await api.put('/users/1/interests', { tagSlugs: [audience.slug] });
    assert.equal(bad.status, 400);
    assert.equal((await api.put('/users/1/interests', { tagSlugs: ['no-such-tag'] })).status, 400);
    assert.deepEqual(slugsOf(await api.json('/users/1/interests')), [a.slug]);
  });

  test('unknown attendee is a 404', async () => {
    assert.equal((await api.get('/users/9999/interests')).status, 404);
    assert.equal((await api.put('/users/9999/interests', { tagSlugs: [] })).status, 404);
  });

  test('picks and seen state belong to one attendee', async () => {
    const [a] = await pickable();
    await api.del('/users/2/interests');
    await api.put('/users/1/interests', { tagSlugs: [a.slug] });
    assert.deepEqual(await api.json('/users/2/interests'), { tags: [], seen: false });
  });

  test('DELETE returns an attendee to first-time', async () => {
    const [a] = await pickable();
    await api.put('/users/3/interests', { tagSlugs: [a.slug] });
    await api.del('/users/3/interests');
    assert.deepEqual(await api.json('/users/3/interests'), { tags: [], seen: false });
  });

  test('seeded attendees have already seen the picker', async () => {
    const fresh = await api.json('/users/4/interests');
    assert.deepEqual(fresh, { tags: [], seen: true });
  });
});

describe('interestedIn filter', () => {
  test('matches sessions sharing any picked tag, and composes with other filters', async () => {
    const all = await api.json('/sessions');
    const detail = async (s) => (await api.json(`/sessions/${s.id}`)).tags.map((t) => t.slug);
    const tagsById = new Map();
    for (const s of all.slice(0, 60)) tagsById.set(s.id, await detail(s));
    const [a, b] = await pickable();
    // choose two picks that each match something
    const picks = [a.slug, b.slug];
    await api.put('/users/5/interests', { tagSlugs: picks });

    const expected = all.filter((s) => (tagsById.get(s.id) ?? []).some((t) => picks.includes(t)));
    const got = await api.json('/sessions?interestedIn=5&day=' + all[0].day);
    const wantDay = expected.filter((s) => s.day === all[0].day).map((s) => s.id).sort((x, y) => x - y);
    // only the first 60 sessions had their tags read; compare within them
    const inRange = new Set(tagsById.keys());
    assert.deepEqual(got.filter((s) => inRange.has(s.id)).map((s) => s.id).sort((x, y) => x - y),
      wantDay);

    const everything = await api.json('/sessions?interestedIn=5');
    assert.ok(everything.length > 0 && everything.length < all.length, 'narrower than the full list');

    const track = everything[0].track.slug;
    const withTrack = await api.json(`/sessions?interestedIn=5&trackSlug=${track}`);
    assert.deepEqual(withTrack.map((s) => s.id), everything.filter((s) => s.track.slug === track).map((s) => s.id));
  });

  test('no picks matches nothing', async () => {
    await api.put('/users/5/interests', { tagSlugs: [] });
    assert.deepEqual(await api.json('/sessions?interestedIn=5'), []);
  });
});
