import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './harness.js';

/** Talk to the interests picker: the model is always stubbed, never the network. */

let api;
let close;
let setModel;
before(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  ({ api, close } = await startApi());
  ({ setModel } = await import('../../server/lib/interviewer.js'));
});
after(() => { delete process.env.ANTHROPIC_API_KEY; setModel(null); return close(); });
beforeEach(() => { delete process.env.ANTHROPIC_API_KEY; setModel(null); });

const ask = (messages = [{ role: 'user', content: 'I like AI' }]) => api.post('/interests/converse', { messages });
const tags = async () => (await api.json('/bootstrap')).tags;

describe('interests voice', () => {
  test('without a key it is unavailable and converse is 503', async () => {
    assert.deepEqual(await api.json('/interests/voice'), { available: false });
    assert.equal((await ask()).status, 503);
  });

  test('with a key it is available', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    assert.deepEqual(await api.json('/interests/voice'), { available: true });
  });

  test('only topic and tech tags come back, as camelCase tag objects', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const all = await tags();
    const topic = all.find((t) => t.kind === 'topic');
    const audience = all.find((t) => t.kind === 'audience');
    setModel(async () => JSON.stringify({ reply: 'Thanks!', done: true, tagSlugs: [audience.slug, 'nope', topic.slug] }));
    const res = await ask();
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { reply: 'Thanks!', done: true, tags: [{ name: topic.name, slug: topic.slug, kind: 'topic' }] });
  });

  test('the model is given the real vocabulary and the conversation', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    let seen;
    setModel(async (req) => { seen = req; return '{"reply":"Hi","done":false,"tagSlugs":[]}'; });
    await ask();
    const topic = (await tags()).find((t) => t.kind === 'topic');
    assert.ok(seen.system.includes(topic.slug));
    assert.equal(seen.messages.length, 1);
  });

  test('malformed or over-long message lists are 400', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    setModel(async () => '{}');
    assert.equal((await api.post('/interests/converse', {})).status, 400);
    assert.equal((await ask([])).status, 400);
    assert.equal((await ask([{ role: 'system', content: 'x' }])).status, 400);
    assert.equal((await ask([{ role: 'user', content: 5 }])).status, 400);
    assert.equal((await ask(Array.from({ length: 41 }, () => ({ role: 'user', content: 'x' })))).status, 400);
  });

  test('a failing model call is 502', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    setModel(async () => { throw new Error('upstream down'); });
    assert.equal((await ask()).status, 502);
  });
});
