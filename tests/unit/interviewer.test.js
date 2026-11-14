import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { matchTags, converse } from '../../server/lib/interviewer.js';

const vocab = [
  { slug: 'ai', name: 'AI', kind: 'topic' },
  { slug: 'security', name: 'Security', kind: 'topic' },
  { slug: 'react', name: 'React', kind: 'tech' },
];
const say = (text) => async () => text;
const turn = (n) => Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }));

describe('matchTags', () => {
  test('keeps vocabulary slugs only, in vocabulary order, once each', () => {
    assert.deepEqual(matchTags(['react', 'AI', ' ai ', 'nope', 'react'], vocab), ['ai', 'react']);
  });
  test('drops non-strings and non-lists', () => {
    assert.deepEqual(matchTags([1, null, {}, 'security'], vocab), ['security']);
    assert.deepEqual(matchTags('ai', vocab), []);
    assert.deepEqual(matchTags(undefined, vocab), []);
  });
});

describe('converse', () => {
  test('parses the JSON reply and filters tag slugs through the vocabulary', async () => {
    const out = await converse(turn(1), vocab, {
      model: say('{"reply":"Great, done.","done":true,"tagSlugs":["react","audience-x","ai"]}'),
    });
    assert.deepEqual(out, { reply: 'Great, done.', done: true, tagSlugs: ['ai', 'react'] });
  });
  test('non-JSON text becomes a reply that is not done', async () => {
    assert.deepEqual(await converse(turn(1), vocab, { model: say('What do you build?') }),
      { reply: 'What do you build?', done: false, tagSlugs: [] });
  });
  test('JSON inside a code fence is still read', async () => {
    const out = await converse(turn(1), vocab, { model: say('```json\n{"reply":"ok","done":false,"tagSlugs":["ai"]}\n```') });
    assert.equal(out.reply, 'ok');
    assert.deepEqual(out.tagSlugs, ['ai']);
  });
  test('the system prompt lists the allowed slugs and the history is passed on', async () => {
    let seen;
    await converse(turn(3), vocab, { model: async (req) => { seen = req; return '{"reply":"x","done":false,"tagSlugs":[]}'; } });
    for (const t of vocab) assert.ok(seen.system.includes(t.slug));
    assert.equal(seen.messages.length, 3);
  });
  test('the eighth user turn forces done with the tags so far', async () => {
    const out = await converse(turn(15), vocab, { model: say('{"reply":"more?","done":false,"tagSlugs":["ai"]}') });
    assert.equal(out.done, true);
    assert.deepEqual(out.tagSlugs, ['ai']);
    const early = await converse(turn(13), vocab, { model: say('{"reply":"more?","done":false,"tagSlugs":[]}') });
    assert.equal(early.done, false);
  });
});
