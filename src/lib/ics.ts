export interface Reminder {
  title: string;
  description: string;
  url: string;
  monthsFromNow: number;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** Builds an iCalendar file with one all-day "replace this item" event per kit item. */
export function buildIcs(
  reminders: Reminder[],
  now = new Date(),
  origin = typeof window === "undefined" ? undefined : window.location.origin,
): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GearFit//Kit reminders//EN", "CALSCALE:GREGORIAN"];
  reminders.forEach((r, i) => {
    // Tracking links are relative within the app; exported calendars need absolute URLs.
    const url = origin ? new URL(r.url, origin).href : r.url;
    const description = r.url && url !== r.url ? r.description.split(r.url).join(url) : r.description;
    const start = new Date(now);
    start.setDate(start.getDate() + Math.max(7, Math.round(r.monthsFromNow * 30.4)));
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    lines.push(
      "BEGIN:VEVENT",
      `UID:gearfit-${stamp}-${i}@gearfit`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${fmt(start)}`,
      `DTEND;VALUE=DATE:${fmt(end)}`,
      `SUMMARY:${esc(r.title)}`,
      `DESCRIPTION:${esc(description)}`,
      `URL:${url}`,
      "BEGIN:VALARM",
      "TRIGGER:-P7D",
      "ACTION:DISPLAY",
      `DESCRIPTION:${esc(r.title)}`,
      "END:VALARM",
      "END:VEVENT",
    );
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
