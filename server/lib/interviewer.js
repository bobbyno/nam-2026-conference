/**
 * The interests interview: Claude asks a few short questions and answers with
 * the topic/tech tags that fit. The model only ever *suggests* slugs — matchTags
 * is the one place that decides which of them survive.
 */

const MAX_USER_TURNS = 8;

export const voiceAvailable = () => Boolean(process.env.ANTHROPIC_API_KEY);

/** Slugs from `candidates` that exist in `vocabulary`, once each, in vocabulary order. */
export function matchTags(candidates, vocabulary) {
  if (!Array.isArray(candidates)) return [];
  const wanted = new Set(candidates.filter((c) => typeof c === 'string').map((c) => c.trim().toLowerCase()));
  return vocabulary.map((t) => t.slug).filter((slug) => wanted.has(slug));
}

/** One call to the Messages API; no SDK. Returns the model's text. */
async function callClaude({ system, messages }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
      max_tokens: 400,
      system,
      messages,
    }),
  });
  if (!res.ok) throw new Error(`Anthropic answered ${res.status}`);
  const body = await res.json();
  return (body.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

let override = null;
/** Tests swap the model call for a stub; `setModel(null)` restores the real one. */
export const setModel = (fn) => { override = fn; };
export const currentModel = () => override ?? callClaude;

const systemPrompt = (vocabulary) => `You help a conference attendee pick the topics and technologies they care about.
Ask short, friendly questions, one at a time, in plain spoken sentences (no lists, no markdown).
Finish after about 4 turns, or as soon as the attendee says they are done.
You may only choose from these tags (slug: name):
${vocabulary.map((t) => `${t.slug}: ${t.name}`).join('\n')}
Reply with JSON only: {"reply": "<what you say next>", "done": <true when finished>, "tagSlugs": ["<slug>", ...]}.
When done is true, tagSlugs holds every slug that fits what the attendee told you.`;

const parse = (text) => {
  const raw = String(text ?? '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object' && typeof obj.reply === 'string') return obj;
  } catch { /* fall through: plain text is just a reply */ }
  return { reply: String(text ?? '').trim(), done: false, tagSlugs: [] };
};

/** `messages` alternate user/assistant, the attendee last. → `{ reply, done, tagSlugs }`. */
export async function converse(messages, vocabulary, { model = currentModel() } = {}) {
  const text = await model({ system: systemPrompt(vocabulary), messages });
  const out = parse(text);
  const userTurns = messages.filter((m) => m.role === 'user').length;
  return {
    reply: out.reply,
    done: out.done === true || userTurns >= MAX_USER_TURNS,
    tagSlugs: matchTags(out.tagSlugs, vocabulary),
  };
}
