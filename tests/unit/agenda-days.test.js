import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAgendaDays, focusSession, hoursLabel } from '../../src/lib/agendaDays.js';

const s = (id, day, startsAt, endsAt) => ({ id, day, startsAt, endsAt });
const store = (map) => (id) => map[id] ?? null;

const D1 = '2026-10-12';
const D2 = '2026-10-13';

describe('buildAgendaDays follows the store, not the payload', () => {
  const payload = [
    { date: D2, sessions: [s(9, D2, '09:00', '10:00')] },
    { date: D1, sessions: [s(3, D1, '11:00', '12:00'), s(1, D1, '09:00', '10:30'), s(2, D1, '10:00', '10:45')] },
  ];

  test('days and sessions come back in time order', () => {
    const days = buildAgendaDays(payload, store({ 1: 'confirmed', 2: 'confirmed', 3: 'confirmed', 9: 'confirmed' }));
    assert.deepEqual(days.map((d) => d.date), [D1, D2]);
    assert.deepEqual(days[0].sessions.map((x) => x.id), [1, 2, 3]);
  });

  test('booked minutes count confirmed seats only; waitlisted time is apart', () => {
    const [d1] = buildAgendaDays(payload, store({ 1: 'confirmed', 2: 'waitlisted', 3: 'confirmed' }));
    assert.equal(d1.totalMinutes, 90 + 60);
    assert.equal(d1.waitlistedMinutes, 45);
  });

  test('overlaps are flagged for both statuses, and only for overlaps', () => {
    const [d1] = buildAgendaDays(payload, store({ 1: 'confirmed', 2: 'waitlisted', 3: 'confirmed' }));
    assert.deepEqual(d1.conflicts, [{ type: 'overlap', sessionIds: [1, 2] }]);
  });

  test('back-to-back sessions do not clash', () => {
    const days = buildAgendaDays(
      [{ date: D1, sessions: [s(1, D1, '09:00', '10:00'), s(2, D1, '10:00', '11:00')] }],
      store({ 1: 'confirmed', 2: 'confirmed' }));
    assert.deepEqual(days[0].conflicts, []);
  });

  test('a released session leaves; the clash, totals and an emptied day go with it', () => {
    const days = buildAgendaDays(payload, store({ 1: 'confirmed', 3: 'confirmed' }));
    assert.deepEqual(days.map((d) => d.date), [D1]);
    assert.deepEqual(days[0].sessions.map((x) => x.id), [1, 3]);
    assert.deepEqual(days[0].conflicts, []);
    assert.equal(days[0].totalMinutes, 150);
  });

  test('the store decides the status, not the payload', () => {
    const withStatus = [{ date: D1, sessions: [{ ...s(1, D1, '09:00', '10:00'), reservation: 'confirmed' }] }];
    const [d] = buildAgendaDays(withStatus, store({ 1: 'waitlisted' }));
    assert.equal(d.sessions[0].reservation, 'waitlisted');
    assert.equal(d.totalMinutes, 0);
    assert.equal(d.waitlistedMinutes, 60);
  });

  test('nothing reserved gives no days', () => {
    assert.deepEqual(buildAgendaDays(payload, store({})), []);
    assert.deepEqual(buildAgendaDays([], store({})), []);
  });
});

describe('focusSession picks what is happening now, else what is next', () => {
  const days = buildAgendaDays([
    { date: D1, sessions: [s(1, D1, '09:00', '10:00'), s(2, D1, '11:00', '12:00'), s(3, D1, '11:30', '12:30')] },
    { date: D2, sessions: [s(4, D2, '09:00', '10:00')] },
  ], store({ 1: 'confirmed', 2: 'confirmed', 3: 'waitlisted', 4: 'confirmed' }));

  test('in progress wins', () => assert.equal(focusSession(days, { day: D1, time: '09:30' }), 1));
  test('a session starting exactly now is in progress', () => assert.equal(focusSession(days, { day: D1, time: '11:00' }), 2));
  test('a session ending exactly now is over, so the next one is picked', () => assert.equal(focusSession(days, { day: D1, time: '10:00' }), 2));
  test('before the first session, the first is next', () => assert.equal(focusSession(days, { day: D1, time: '08:00' }), 1));
  test('a waitlisted place is never the focus', () => assert.equal(focusSession(days, { day: D1, time: '12:10' }), null));
  test('nothing after the last session today', () => assert.equal(focusSession(days, { day: D1, time: '13:00' }), null));
  test('other days are never highlighted', () => assert.equal(focusSession(days, { day: '2026-10-20', time: '08:00' }), null));
});

describe('hoursLabel', () => {
  test('whole hours, part hours, minutes', () => {
    assert.equal(hoursLabel(120), '2h');
    assert.equal(hoursLabel(150), '2h 30m');
    assert.equal(hoursLabel(45), '45m');
    assert.equal(hoursLabel(0), '0h');
  });
});
