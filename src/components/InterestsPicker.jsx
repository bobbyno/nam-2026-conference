import { useEffect, useRef, useState } from 'react';
import { Button, cx } from './ui.jsx';

const GROUPS = [
  { kind: 'topic', label: 'Topics' },
  { kind: 'tech', label: 'Tech' },
];

/**
 * First-visit picker: which topics and technologies are you here for?
 * Only `topic` and `tech` tags are offered — audience and vibe describe a
 * session's fit, not an interest. Skip saves nothing but still counts as seen.
 */
export function InterestsPicker({ tags, picked, onSave, onClose }) {
  const ref = useRef(null);
  const [chosen, setChosen] = useState(() => new Set(picked));
  const [busy, setBusy] = useState(false);
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
        className="glass relative flex max-h-[90dvh] w-full max-w-xl animate-rise flex-col rounded-t-2xl border border-hairline p-5 shadow-2xl shadow-black/70 focus:outline-none sm:rounded-2xl sm:p-6">
        <h2 id="interests-title" className="font-display text-xl leading-tight">What are you here for?</h2>
        <p className="mt-1 text-[13px] text-muted">
          Pick the topics and tech you care about and the schedule can show just those, under <b>For you</b>.
        </p>

        <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto">
          {GROUPS.map(({ kind, label }) => (
            <section key={kind}>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">{label}</h3>
              <div className="flex flex-wrap gap-1.5">
                {tags.filter((t) => t.kind === kind).map((t) => {
                  const on = chosen.has(t.slug);
                  return (
                    <button key={t.slug} type="button" aria-pressed={on} onClick={() => toggle(t.slug)}
                      data-testid={`interest-${t.slug}`}
                      className={cx('rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors',
                        on ? 'border-violet-400/50 bg-violet-500/15 text-ink' : 'border-hairline text-muted hover:text-ink')}>
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" disabled={busy} onClick={() => save(picked ? [...picked] : [])} data-testid="interests-skip">
            Skip for now
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => save([...chosen])} data-testid="interests-save">
            Save{chosen.size ? ` (${chosen.size})` : ''}
          </Button>
        </div>
      </div>
    </div>
  );
}
