// Pure UTC/string date arithmetic — avoids local-timezone off-by-one bugs
// that `new Date(iso)` + local getDate()/setDate() can introduce.

export function addDaysToISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isoDatesBetween(startIso: string, endIso: string): string[] {
  const dates: string[] = [];
  let current = startIso;
  while (current <= endIso) {
    dates.push(current);
    current = addDaysToISO(current, 1);
  }
  return dates;
}

export function formatDayDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}
