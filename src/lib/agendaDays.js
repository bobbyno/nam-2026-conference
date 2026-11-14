import { toMinutes } from './clock.js';

const minutesOf = (s) => toMinutes(s.endsAt) - toMinutes(s.startsAt);
const overlaps = (a, b) => toMinutes(a.startsAt) < toMinutes(b.endsAt) && toMinutes(b.startsAt) < toMinutes(a.endsAt);

/**
 * The attendee's days, built from the fetched schedule but with the store's
 * `reservationFor` as the truth: a released session leaves, the status follows
 * the store, and conflicts and both minute totals are recomputed (dropping
 * days left empty). Booked minutes are confirmed seats only; queued time is
 * `waitlistedMinutes`. Conflicts count both statuses, like `scheduleFor`.
 */
export function buildAgendaDays(days, reservationFor) {
  return days
    .map((day) => {
      const sessions = day.sessions
        .map((s) => ({ ...s, reservation: reservationFor(s.id) }))
        .filter((s) => s.reservation)
        .sort((a, b) => toMinutes(a.startsAt) - toMinutes(b.startsAt) || a.id - b.id);
      const conflicts = [];
      sessions.forEach((a, i) => sessions.slice(i + 1).forEach((b) => {
        if (overlaps(a, b)) conflicts.push({ type: 'overlap', sessionIds: [a.id, b.id] });
      }));
      const sum = (status) => sessions
        .filter((s) => s.reservation === status)
        .reduce((total, s) => total + minutesOf(s), 0);
      return { ...day, sessions, conflicts, totalMinutes: sum('confirmed'), waitlistedMinutes: sum('waitlisted') };
    })
    .filter((day) => day.sessions.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The confirmed session in progress on `clock.day`, else the next one that
 * starts later that day; `null` on any other day or after the last.
 */
export function focusSession(days, clock) {
  const day = days.find((d) => d.date === clock?.day);
  if (!day) return null;
  const now = toMinutes(clock.time);
  const mine = day.sessions.filter((s) => s.reservation === 'confirmed');
  const live = mine.find((s) => toMinutes(s.startsAt) <= now && now < toMinutes(s.endsAt));
  return (live ?? mine.find((s) => toMinutes(s.startsAt) > now))?.id ?? null;
}

/** 120 → "2h", 150 → "2h 30m", 45 → "45m". */
export function hoursLabel(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0 && m > 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
