import { Router } from 'express';
import { db } from '../db.js';
import { toInterestTag } from '../lib/query.js';
import { converse, voiceAvailable } from '../lib/interviewer.js';

export const interestsRouter = Router();

const MAX_MESSAGES = 40;
const MAX_CHARS = 2000;
const pickable = db.prepare("SELECT name, slug, kind FROM tags WHERE kind IN ('topic', 'tech') ORDER BY id");

const validMessages = (list) => Array.isArray(list) && list.length > 0 && list.length <= MAX_MESSAGES
  && list.every((m) => m && (m.role === 'user' || m.role === 'assistant')
    && typeof m.content === 'string' && m.content.length <= MAX_CHARS)
  && list[list.length - 1].role === 'user';

/** Whether "Talk instead" can be offered — the key itself never leaves the server. */
interestsRouter.get('/voice', (req, res) => res.json({ available: voiceAvailable() }));

interestsRouter.post('/converse', async (req, res) => {
  if (!voiceAvailable()) return res.status(503).json({ error: 'Voice is not configured' });
  const messages = req.body?.messages;
  if (!validMessages(messages)) return res.status(400).json({ error: 'messages must be a short list of user/assistant turns ending with the attendee' });
  const vocabulary = pickable.all();
  try {
    const { reply, done, tagSlugs } = await converse(messages, vocabulary);
    const chosen = new Set(tagSlugs);
    res.json({ reply, done, tags: vocabulary.filter((t) => chosen.has(t.slug)).map(toInterestTag) });
  } catch (err) {
    console.error('✗ interests converse:', err.message);
    res.status(502).json({ error: 'The assistant could not be reached' });
  }
});
