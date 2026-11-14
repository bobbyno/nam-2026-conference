import { useEffect, useRef, useState } from 'react';
import { Button, cx } from './ui.jsx';
import { converse, getVoiceStatus } from '../lib/api.js';
import { cancelSpeech, listen, recognitionCtor, speak } from '../lib/speech.js';

const GREETING = 'Tell me what you are here for, and I will tick the matching topics and tech.';

const GROUPS = [
  { kind: 'topic', label: 'Topics' },
  { kind: 'tech', label: 'Tech' },
];

/**
 * First-visit picker, opened by itself until the attendee saves or skips:
 * which topics and technologies are you here for?
 * Only `topic` and `tech` tags are offered — audience and vibe describe a
 * session's fit, not an interest. Skip saves nothing but still counts as seen.
 */
export function InterestsPicker({ tags, picked, onSave, onClose }) {
  const ref = useRef(null);
  const [chosen, setChosen] = useState(() => new Set(picked));
  const [busy, setBusy] = useState(false);
  const [canTalk, setCanTalk] = useState(false);
  const [talk, setTalk] = useState(null); // { lines, phase } while a conversation runs
  const [talkError, setTalkError] = useState('');
  const runRef = useRef(0);
  const closeRef = useRef(onClose);
  closeRef.current = busy ? () => {} : onClose;

  useEffect(() => {
    const opener = document.activeElement;
    ref.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  // "Talk instead" needs a browser that can listen and a server that has a key.
  useEffect(() => {
    if (!recognitionCtor()) return undefined;
    let live = true;
    getVoiceStatus().then((v) => { if (live) setCanTalk(!!v?.available); }).catch(() => {});
    return () => { live = false; runRef.current += 1; cancelSpeech(); };
  }, []);

  const stopTalk = () => { runRef.current += 1; cancelSpeech(); setTalk(null); };

  /** Greeting, then listen → ask Claude → speak, until Claude is done; the tags it returns are added to the chips. */
  const startTalk = async () => {
    const run = ++runRef.current;
    const alive = () => runRef.current === run;
    let lines = [{ role: 'assistant', content: GREETING }];
    setTalkError('');
    setTalk({ lines, phase: 'speaking' });
    try {
      await speak(GREETING);
      for (;;) {
        if (!alive()) return;
        setTalk({ lines, phase: 'listening' });
        const heard = await listen();
        if (!alive()) return;
        lines = [...lines, { role: 'user', content: heard }];
        setTalk({ lines, phase: 'thinking' });
        const out = await converse(lines.slice(1));
        if (!alive()) return;
        lines = [...lines, { role: 'assistant', content: out.reply }];
        setTalk({ lines, phase: 'speaking' });
        await speak(out.reply);
        if (!alive()) return;
        if (out.done) {
          setChosen((prev) => new Set([...prev, ...out.tags.map((t) => t.slug)]));
          setTalk(null);
          return;
        }
      }
    } catch (err) {
      if (!alive()) return;
      setTalk(null);
      setTalkError(err.message || 'The conversation stopped');
    }
  };

  const toggle = (slug) => setChosen((prev) => {
    const next = new Set(prev);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    return next;
  });

  const save = async (slugs) => {
    setBusy(true);
    try { await onSave(slugs); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-end sm:place-items-center" role="dialog"
      aria-modal="true" aria-labelledby="interests-title" data-testid="interests-picker">
      <button type="button" aria-label="Close" onClick={onClose} disabled={busy}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div ref={ref} tabIndex={-1}
        className="glass relative flex max-h-[92dvh] w-full max-w-3xl animate-rise flex-col rounded-t-2xl border border-violet-400/30 p-6 shadow-2xl shadow-black/70 focus:outline-none sm:rounded-3xl sm:p-10">
        <h2 id="interests-title" className="font-display text-2xl leading-tight sm:text-4xl">What are you here for?</h2>
        <p className="mt-2 text-sm text-muted sm:text-base">
          Pick the topics and tech you care about and the schedule can show just those, under <b>For you</b>.
        </p>

        {talkError && <p role="alert" data-testid="interests-talk-error" className="mt-4 text-sm text-rose-300">{talkError}</p>}
        {talk ? (
          <div className="mt-6 min-h-0 flex-1 space-y-3 overflow-y-auto" data-testid="interests-transcript" aria-live="polite">
            <p className="text-xs text-faint">What you say is sent to Claude, through this app's server, to pick your tags.</p>
            {talk.lines.map((l, i) => (
              <p key={i} className={cx('rounded-2xl px-4 py-2 text-sm sm:text-base', l.role === 'user' ? 'ml-8 bg-violet-500/15' : 'mr-8 border border-hairline')}>
                {l.content}
              </p>
            ))}
            <p className="text-sm text-muted" data-testid="interests-talk-phase">
              {{ listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…' }[talk.phase]}
            </p>
            <Button variant="ghost" onClick={stopTalk} data-testid="interests-talk-stop">Stop</Button>
          </div>
        ) : (
        <div className="mt-6 min-h-0 flex-1 space-y-6 overflow-y-auto">
          {GROUPS.map(({ kind, label }) => (
            <section key={kind}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">{label}</h3>
              <div className="flex flex-wrap gap-2">
                {tags.filter((t) => t.kind === kind).map((t) => {
                  const on = chosen.has(t.slug);
                  return (
                    <button key={t.slug} type="button" aria-pressed={on} onClick={() => toggle(t.slug)}
                      data-testid={`interest-${t.slug}`}
                      className={cx('rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                        on ? 'border-violet-400/50 bg-violet-500/15 text-ink' : 'border-hairline text-muted hover:text-ink')}>
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        )}

        <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {canTalk && (
            <Button variant="ghost" disabled={busy || !!talk} onClick={startTalk} data-testid="interests-talk">
              Talk instead
            </Button>
          )}
          <Button variant="ghost" disabled={busy || !!talk} onClick={() => save(picked ? [...picked] : [])} data-testid="interests-skip">
            Skip for now
          </Button>
          <Button variant="primary" disabled={busy || !!talk} onClick={() => save([...chosen])} data-testid="interests-save">
            Save{chosen.size ? ` (${chosen.size})` : ''}
          </Button>
        </div>
      </div>
    </div>
  );
}
