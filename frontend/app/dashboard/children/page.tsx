"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AuthGuard } from "@/components/auth-guard"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { getAuthHeaders, publicApiBase } from "@/lib/api"
import { usePortalI18n } from "@/lib/i18n/i18n-context"
import type { AppLocale } from "@/lib/i18n/types"
import { Search, ArrowRight, UserPlus } from "lucide-react"

interface ApiChild {
  id: number
  name: string
  age: number | null
  diagnostic?: string | null
  alexa_code?: string | null
  stats: { total_sessions: number; total_correct?: number; avg_accuracy: number }
  assigned_program?: { id: number; name: string; question_count?: number } | null
  last_session?: { created_at: string | null } | null
}

function statusTier(stats: ApiChild["stats"]) {
  if (!stats.total_sessions || stats.avg_accuracy < 30) return "attention" as const
  if (stats.avg_accuracy < 70) return "monitor" as const
  return "on_track" as const
}

function statusFrom(stats: ApiChild["stats"], t: (key: string) => string) {
  if (!stats.total_sessions || stats.avg_accuracy < 30)
    return { label: t("status.needsAttention"), cls: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200" }
  if (stats.avg_accuracy < 70)
    return { label: t("status.monitor"), cls: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100" }
  return { label: t("status.onTrack"), cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" }
}

function severityChip(diagnostic: string | null | undefined, t: (key: string) => string) {
  const d = (diagnostic || "").trim()
  if (!d) return { label: t("dashboard.severityNone"), cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" }
  if (/severe/i.test(d))
    return { label: t("common.severitySevere"), cls: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200" }
  if (/moderate/i.test(d))
    return { label: t("common.severityModerate"), cls: "bg-orange-100 text-orange-900 dark:bg-orange-950/40 dark:text-orange-100" }
  if (/mild/i.test(d))
    return { label: t("common.severityMild"), cls: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100" }
  return { label: d, cls: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100" }
}

function focusBarColor(accuracy: number, hasSessions: boolean) {
  if (!hasSessions || accuracy < 30) return "bg-red-500"
  if (accuracy < 70) return "bg-amber-500"
  return "bg-emerald-500"
}

function localeTag(loc: AppLocale) {
  if (loc === "ar") return "ar"
  if (loc === "fr") return "fr-FR"
  return "en-US"
}

function formatSessionDate(value: string | null | undefined, locale: AppLocale) {
  if (!value) return null
  try {
    return new Date(value).toLocaleDateString(localeTag(locale), {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  } catch {
    return null
  }
}

function ChildCard({ child, t, locale }: { child: ApiChild; t: (key: string) => string; locale: AppLocale }) {
  const tier = statusTier(child.stats)
  const status = statusFrom(child.stats, t)
  const sev = severityChip(child.diagnostic, t)
  const acc = Math.round(child.stats.avg_accuracy ?? 0)
  const stars = child.stats.total_correct ?? 0
  const sessions = child.stats.total_sessions ?? 0
  const programName = child.assigned_program?.name?.trim()
  const lastDate = formatSessionDate(child.last_session?.created_at ?? undefined, locale)

  const borderL =
    tier === "attention"
      ? "border-l-red-500"
      : tier === "monitor"
        ? "border-l-amber-500"
        : "border-l-emerald-500"

  const firstLetter = (child.name.trim()[0] || "?").toUpperCase()

  return (
    <article
      className={[
        "overflow-hidden rounded-lg border border-[#e5e7eb] bg-white shadow-sm transition-all duration-150",
        "hover:border-[#d1d5db] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]",
        "dark:border-slate-700 dark:bg-slate-950/40 dark:hover:border-slate-600",
        "border-l-[3px]",
        borderL,
      ].join(" ")}
    >
      {/* Header */}
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-bold text-[#1a8fe3]"
            style={{ backgroundColor: "#EBF5FE" }}
          >
            {firstLetter}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold text-slate-900 dark:text-white truncate">{child.name}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-950/50 dark:text-sky-200">
                {child.age != null ? `${child.age} ${t("common.age")}` : t("common.ageUnknown")}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${sev.cls}`}>{sev.label}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.cls}`}>{status.label}</span>
              <code className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {child.alexa_code || "—"}
              </code>
            </div>
          </div>
        </div>
        <Button
          asChild
          variant="secondary"
          className="shrink-0 rounded-lg border-0 bg-sky-100 text-[#1a8fe3] hover:bg-sky-200 dark:bg-sky-950/50 dark:text-sky-200 dark:hover:bg-sky-900/60"
        >
          <Link href={`/dashboard/children/${child.id}`}>
            {t("childrenPage.profile")}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="border-t border-slate-100 dark:border-slate-800" />

      {/* Stats row */}
      <div className="grid grid-cols-2 divide-x divide-slate-100 sm:grid-cols-4 dark:divide-slate-800">
        <div className="px-3 py-3 text-center sm:px-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("childrenPage.kpiSessions")}</p>
          <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{sessions}</p>
        </div>
        <div className="px-3 py-3 text-center sm:px-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("childrenPage.kpiStars")}</p>
          <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{stars}</p>
        </div>
        <div className="px-3 py-3 text-center sm:px-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("childrenPage.kpiAccuracy")}</p>
          <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{acc}%</p>
        </div>
        <div className="px-3 py-3 text-center sm:px-2 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("childrenPage.kpiProgram")}</p>
          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white truncate" title={programName || undefined}>
            {programName ? (
              programName
            ) : (
              <span className="font-normal italic text-slate-400 dark:text-slate-500">{t("childrenPage.programNone")}</span>
            )}
          </p>
        </div>
      </div>

      <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300 shrink-0">{t("childrenPage.focusLabel")}</span>
          <div className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={`h-full rounded-full transition-all ${focusBarColor(acc, sessions > 0)}`}
              style={{ width: `${Math.min(100, Math.max(0, acc))}%` }}
            />
          </div>
          <span className="text-xs font-semibold tabular-nums text-slate-900 dark:text-white w-10 text-right shrink-0">
            {acc}%
          </span>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden />
          {lastDate ? (
            <span>{t("childrenPage.lastSession").replace("{date}", lastDate)}</span>
          ) : (
            <span className="italic text-slate-400 dark:text-slate-500">{t("childrenPage.noSessionsYet")}</span>
          )}
        </div>
      </div>
    </article>
  )
}

function ChildrenPageContent() {
  const { t, locale } = usePortalI18n()
  const [children, setChildren] = useState<ApiChild[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`${publicApiBase}/api/parents/children`, { headers: getAuthHeaders() })
        if (!res.ok || cancelled) return
        const data: ApiChild[] = await res.json()
        if (!cancelled) setChildren(data)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return children
    return children.filter((c) => c.name.toLowerCase().includes(q))
  }, [children, query])

  const gridClass = children.length > 1 ? "grid gap-4 md:grid-cols-2" : "grid gap-4 grid-cols-1"

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header + search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white md:text-3xl">{t("childrenPage.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("childrenPage.subtitle")}</p>
        </div>
        <div className="relative w-full min-w-[220px] sm:w-auto sm:max-w-xs shrink-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("childrenPage.searchPh")}
            className="h-10 rounded-[8px] border-slate-200 bg-white pl-9 shadow-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8">{t("childrenPage.loading")}</p>
      ) : children.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/60 py-16 text-center dark:border-slate-700 dark:bg-slate-950/30">
          <UserPlus className="h-10 w-10 text-slate-400 dark:text-slate-500" strokeWidth={1.25} aria-hidden />
          <p className="mt-4 text-sm font-medium text-muted-foreground">{t("childrenPage.emptyTitle")}</p>
          <p className="mt-1 max-w-sm px-4 text-xs text-slate-400 dark:text-slate-500">{t("childrenPage.emptyHint")}</p>
        </div>
      ) : (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("childrenPage.listTitle").replace("{n}", String(children.length))}
          </p>

          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6">{t("childrenPage.noMatch")}</p>
          ) : (
            <div className={gridClass}>
              {filtered.map((child) => (
                <ChildCard key={child.id} child={child} t={t} locale={locale} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function ChildrenPage() {
  return (
    <AuthGuard requiredAccountType="parent">
      <ChildrenPageContent />
    </AuthGuard>
  )
}
