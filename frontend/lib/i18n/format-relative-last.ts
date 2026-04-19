import type { AppLocale } from "./types"

/** Relative time for last activity; uses Intl for en/fr/ar. */
export function formatRelativeLast(iso: string | undefined, locale: AppLocale, noActivityLabel: string): string {
  if (!iso) return noActivityLabel
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffSec = Math.round((then - now) / 1000)
  const rtfLoc = locale === "ar" ? "ar" : locale === "fr" ? "fr" : "en"
  const rtf = new Intl.RelativeTimeFormat(rtfLoc, { numeric: "auto" })
  const abs = Math.abs(diffSec)
  if (abs < 45) return rtf.format(diffSec, "second")
  const diffMin = diffSec / 60
  if (Math.abs(diffMin) < 60) return rtf.format(Math.round(diffMin), "minute")
  const diffHr = diffMin / 60
  if (Math.abs(diffHr) < 24) return rtf.format(Math.round(diffHr), "hour")
  const diffDay = diffHr / 24
  if (Math.abs(diffDay) < 7) return rtf.format(Math.round(diffDay), "day")
  const diffWeek = diffDay / 7
  if (Math.abs(diffWeek) < 5) return rtf.format(Math.round(diffWeek), "week")
  const diffMonth = diffDay / 30
  if (Math.abs(diffMonth) < 12) return rtf.format(Math.round(diffMonth), "month")
  const diffYear = diffDay / 365
  return rtf.format(Math.round(diffYear), "year")
}
