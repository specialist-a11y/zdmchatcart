"use client";

/** Shows a time in the viewer's own timezone (the server runs in UTC). */
export default function LocalTime({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
    </time>
  );
}
