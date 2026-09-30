export const VERSION = '2.0.0';
export function time(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const n = Date.parse(value); return Number.isFinite(n) ? n : null;
}
export function nextSlot(now, minutes) {
  let d = new Date(now); d.setUTCSeconds(0, 0); d = new Date(d.getTime() + 60000);
  while (!minutes.includes(d.getUTCMinutes())) d = new Date(d.getTime() + 60000);
  return d;
}
export function resetAt(now) {
  const d = new Date(now); d.setUTCHours(7, 0, 0, 0);
  return d.getTime() > now ? d.getTime() - 86400000 : d.getTime();
}
export function rewardCurrent(data, now) {
  const t = time(data?.last_verified_claim_at);
  return t !== null && t >= resetAt(now) && t <= now;
}
export function nextCheckin(now, data) {
  const anchor = Date.UTC(2026, 0, 5, 0, 15);
  let next = anchor + (Math.floor((now - anchor) / 25200000) + 1) * 25200000;
  const day = new Date(now); day.setUTCHours(0, 0, 0, 0);
  for (let offset = 0; offset < 3; offset++) {
    for (const [h, m] of [[5,55],[6,55],[7,55],[8,55],[16,0],[17,0]]) {
      const candidate = day.getTime() + offset * 86400000 + h * 3600000 + m * 60000;
      if (candidate <= now) continue;
      const localHour = Number(new Intl.DateTimeFormat('en-US', {timeZone:'America/New_York', hour:'numeric', hourCycle:'h23'}).format(candidate));
      const heavy = m === 55 && [1,2,3].includes(localHour);
      const noon = m === 0 && localHour === 12 && !rewardCurrent(data, candidate);
      if (heavy || noon) next = Math.min(next, candidate);
    }
  }
  return new Date(next);
}
export function researchHealth(data, now) {
  const checked = time(data?.checked_at), due = time(data?.next_check_at), state = data?.status;
  if (!data || checked === null) return ['UNKNOWN', 'warn', 'No valid research status received.'];
  if (checked > now + 60000 || now - checked > 3 * 3600000 + 600000) return ['STALE', 'bad', 'Live TFD status is overdue for a resync.'];
  if (state === 'deferred_game_active') return now - checked > 20 * 60000
    ? ['RECHECK OVERDUE', 'warn', 'Last known state was in game; a new check is overdue.']
    : ['PLAYING / DEFERRED', 'playing', 'Game active: claim/restart intentionally deferred.'];
  if (state !== 'researching') return ['ATTENTION', 'bad', data.detail || 'Research needs attention.'];
  if (due === null || now - due > 10 * 60000) return ['CHECK OVERDUE', 'bad', 'Scheduled live TFD check is overdue or missing.'];
  return due > now ? ['SLEEPING', 'good', 'Research active; waiting for the next live check.'] : ['CHECK DUE', 'warn', 'Waiting for a live check; completion is not yet verified.'];
}
export function watchdogHealth(data, now) {
  const checked = time(data?.checked_at);
  if (!data || checked === null) return ['UNKNOWN', 'warn', 'No watchdog heartbeat received.'];
  if (checked > now + 60000 || now - checked > 65 * 60000) return ['STALE', 'bad', 'Watchdog heartbeat overdue; recovery is unconfirmed.'];
  if (['rescue_dispatched','self_healed','rescue_cooldown'].includes(data.status)) return ['RECOVERY REQUESTED', 'warn', data.detail || 'Waiting to verify recovery.'];
  if (data.status === 'running') return ['RUN IN PROGRESS', 'warn', data.detail];
  if (['healthy','playing_deferred'].includes(data.status)) return ['HEALTHY', 'good', data.detail || 'Last watchdog check passed.'];
  return ['ATTENTION', 'bad', data.detail || 'Watchdog could not verify health.'];
}
