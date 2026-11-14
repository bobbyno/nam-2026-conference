import { useMemo } from 'react';
import { useConference, useFetch } from '../lib/store.jsx';
import * as api from '../lib/api.js';
import { buildAgendaDays, focusSession, hoursLabel } from '../lib/agendaDays.js';
import { dayLabel } from '../lib/format.js';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import { SessionCard } from '../components/SessionCard.jsx';
import { Button, EmptyState, ErrorState, SectionHeader, Skeleton, cx } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { hasEnded } from '../lib/clock.js';

/**
 * Read-only: your reserved sessions by day. The store (`reservationFor`) decides
 * what is listed and its status; the fetched schedule only supplies session
 * detail, and is refetched when the set of reservations changes so a session
 * added elsewhere appears too. Seats are changed on the session and schedule pages.
 */
export function MyAgendaPage() {
  useDocumentTitle('My Agenda');
  const { currentUser, reservations, reservationFor, clock } = useConference();
  const userId = currentUser?.id;
  const reservationKey = [...reservations.keys()].sort((a, b) => a - b).join(',');

  const { data, loading, error, reload } = useFetch(
    () => (userId ? api.getSchedule(userId) : Promise.resolve({ days: [] })),
    [userId, reservationKey],
  );

  const days = useMemo(
    () => buildAgendaDays(data?.days ?? [], reservationFor),
    // reservationFor reads the store map; the key changes whenever it does
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, reservations],
  );
  const focusId = focusSession(days, clock);

  return (
    <div className="space-y-8">
      <SectionHeader eyebrow="Your conference" title="My Agenda" />
      {!data && loading ? (
        <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
      ) : error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : days.length === 0 ? (
        <div data-testid="agenda-empty">
          <EmptyState
            icon="ticket"
            title="Nothing on your agenda yet"
            description="Add a session and it takes a seat for you. It will show up here."
            action={<Button to="/schedule" size="sm">Browse the schedule</Button>}
          />
        </div>
      ) : (
        days.map((day) => (
          <section key={day.date} data-testid={`agenda-day-${day.date}`} className="space-y-3">
            <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="font-display text-xl">{dayLabel(day.date)}</h2>
              <p className="text-sm text-muted">
                <span data-testid={`agenda-booked-${day.date}`}>{hoursLabel(day.totalMinutes)} booked</span>
                {day.waitlistedMinutes > 0 && (
                  <span className="ml-2 font-medium text-amber-300" data-testid={`agenda-waitlist-total-${day.date}`}>
                    +{hoursLabel(day.waitlistedMinutes)} waitlisted
                  </span>
                )}
              </p>
            </header>
            <ul className="space-y-2">
              {day.sessions.map((s) => {
                const clashing = day.conflicts.some((c) => c.sessionIds.includes(s.id));
                const focus = s.id === focusId;
                return (
                  <li
                    key={s.id}
                    data-testid={`agenda-row-${s.id}`}
                    data-focus={focus ? 'true' : undefined}
                    className={cx('rounded-xl', focus && 'ring-2 ring-violet-400/70')}
                  >
                    {focus && <span className="sr-only" data-testid="agenda-focus">{s.id}</span>}
                    {(s.reservation === 'waitlisted' || clashing) && (
                      <div className="mb-1 flex flex-wrap gap-2 text-[11px] font-semibold">
                        {s.reservation === 'waitlisted' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-amber-300"
                            data-testid={`agenda-waitlisted-${s.id}`}>
                            <Icon name="clock" className="size-3" /> Waitlisted
                          </span>
                        )}
                        {clashing && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-400/15 px-2 py-0.5 text-rose-300"
                            data-testid={`agenda-clash-${s.id}`}>
                            <Icon name="alert" className="size-3" /> Overlaps another session
                          </span>
                        )}
                      </div>
                    )}
                    <SessionCard
                      session={s}
                      variant="row"
                      readOnly
                      attendance={{ ended: hasEnded(s, clock), checkedIn: s.checkedIn, myStars: s.myStars }}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
