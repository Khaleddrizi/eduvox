"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AuthGuard } from "@/components/auth-guard"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getAuthHeaders, publicApiBase } from "@/lib/api"
import {
  ArrowRight,
  Users,
  BarChart3,
  Activity,
  Star,
  AlertTriangle,
  CheckCircle2,
  CalendarRange,
} from "lucide-react"

interface ApiChild {
  id: number
  name: string
  age: number | null
  diagnostic?: string | null
  alexa_code?: string | null
  stats: { total_sessions: number; total_correct: number; avg_accuracy: number }
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (!parts[0]) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function childStatus(stats: ApiChild["stats"]) {
  if (!stats.total_sessions || stats.avg_accuracy < 30) return { label: "Needs Attention", cls: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200" }
  if (stats.avg_accuracy < 70) return { label: "Monitor", cls: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100" }
  return { label: "On Track", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" }
}

function severityChip(diagnostic: string | null | undefined) {
  const d = (diagnostic || "").trim()
  if (!d) return { label: "—", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" }
  if (/severe/i.test(d)) return { label: d, cls: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200" }
  if (/moderate/i.test(d)) return { label: d, cls: "bg-orange-100 text-orange-900 dark:bg-orange-950/40 dark:text-orange-100" }
  return { label: d, cls: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100" }
}

function formatTodayChip() {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function ParentPortalContent() {
  const [children, setChildren] = useState<ApiChild[]>([])
  const [loading, setLoading] = useState(true)

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

  const totals = useMemo(() => {
    const totalChildren = children.length
    const totalSessions = children.reduce((sum, c) => sum + (c.stats?.total_sessions ?? 0), 0)
    const totalStars = children.reduce((sum, c) => sum + (c.stats?.total_correct ?? 0), 0)
    const avgAccuracy = totalChildren
      ? Math.round(children.reduce((sum, c) => sum + (c.stats?.avg_accuracy ?? 0), 0) / totalChildren)
      : 0
    return { totalChildren, totalSessions, totalStars, avgAccuracy }
  }, [children])

  const spotlightChild = children[0] ?? null
  const dateChip = useMemo(() => formatTodayChip(), [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Welcome bar */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-bold text-slate-900 dark:text-white leading-tight">Parent Overview</h1>
          <p className="mt-1 text-xs text-muted-foreground max-w-md">
            Quick snapshot — jump to Children or Reports for details.
          </p>
        </div>
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100/90 px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
          {dateChip}
        </span>
      </div>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="surface-card overflow-hidden border-border/70 shadow-sm">
          <CardContent className="flex h-full min-h-[140px] flex-col pt-5 pb-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Children</p>
            <p className="mt-2 text-2xl font-bold leading-none" style={{ color: "#1a8fe3" }}>
              {totals.totalChildren}
            </p>
            <div className="mt-auto flex justify-end pt-4">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-md"
                style={{ backgroundColor: "rgba(26, 143, 227, 0.15)" }}
              >
                <Users className="h-4 w-4" style={{ color: "#1a8fe3" }} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="surface-card overflow-hidden border-border/70 shadow-sm">
          <CardContent className="flex h-full min-h-[140px] flex-col pt-5 pb-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sessions</p>
            <p className="mt-2 text-2xl font-bold leading-none" style={{ color: "#0f766e" }}>
              {totals.totalSessions}
            </p>
            <div className="mt-auto flex justify-end pt-4">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-md"
                style={{ backgroundColor: "rgba(15, 118, 110, 0.15)" }}
              >
                <Activity className="h-4 w-4" style={{ color: "#0f766e" }} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="surface-card overflow-hidden border-border/70 shadow-sm">
          <CardContent className="flex h-full min-h-[140px] flex-col pt-5 pb-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stars</p>
            <p className="mt-2 text-2xl font-bold leading-none" style={{ color: "#d97706" }}>
              {totals.totalStars}
            </p>
            <div className="mt-auto flex justify-end pt-4">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-md"
                style={{ backgroundColor: "rgba(217, 119, 6, 0.15)" }}
              >
                <Star className="h-4 w-4" style={{ color: "#d97706" }} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="surface-card overflow-hidden border-border/70 shadow-sm">
          <CardContent className="flex h-full min-h-[140px] flex-col pt-5 pb-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Average Accuracy</p>
            <p className="mt-2 text-2xl font-bold leading-none" style={{ color: "#534AB7" }}>
              {totals.avgAccuracy}%
            </p>
            <div className="mt-auto flex justify-end pt-4">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-md"
                style={{ backgroundColor: "rgba(83, 74, 183, 0.15)" }}
              >
                <BarChart3 className="h-4 w-4" style={{ color: "#534AB7" }} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Child summary or empty state */}
      {spotlightChild ? (
        <Card className="border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/40">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <div
                className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-base font-bold text-[#1a8fe3]"
                style={{ backgroundColor: "#EBF5FE" }}
              >
                {initials(spotlightChild.name)}
              </div>
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-slate-900 dark:text-white truncate">{spotlightChild.name}</p>
                {children.length > 1 && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Showing first of {children.length} — see all in Children
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-950/50 dark:text-sky-200">
                    {spotlightChild.age != null ? `${spotlightChild.age} yrs` : "Age —"}
                  </span>
                  {(() => {
                    const sev = severityChip(spotlightChild.diagnostic)
                    return (
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${sev.cls}`}>{sev.label}</span>
                    )
                  })()}
                  {(() => {
                    const st = childStatus(spotlightChild.stats)
                    return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                  })()}
                  <code className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {spotlightChild.alexa_code || "—"}
                  </code>
                </div>
              </div>
            </div>
            <Button
              asChild
              className="shrink-0 rounded-full bg-[#1a8fe3] px-5 text-white hover:bg-[#1578c4]"
            >
              <Link href={`/dashboard/children/${spotlightChild.id}`}>
                View details
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3.5 dark:border-amber-900/50 dark:bg-amber-950/25">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-sm text-amber-950 dark:text-amber-100">
            No child linked to your account yet. Contact your specialist to get set up.
          </p>
        </div>
      )}

      {/* Workspace cards */}
      <div className="grid gap-4 md:grid-cols-2 md:items-stretch">
        <Card className="surface-card flex h-full min-h-[280px] flex-col border-border/70 shadow-sm">
          <CardContent className="flex h-full flex-col p-6">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ backgroundColor: "rgba(26, 143, 227, 0.15)" }}
            >
              <Users className="h-5 w-5" style={{ color: "#1a8fe3" }} />
            </div>
            <h2 className="mt-4 text-[15px] font-bold text-slate-900 dark:text-white">Children Workspace</h2>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Deep dive into each child&apos;s learning journey, sessions, and rewards. Everything you need to support
              practice at home in one place.
            </p>
            <ul className="mt-4 space-y-2.5 text-xs text-slate-700 dark:text-slate-300">
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>Overview, Sessions, and Rewards tabs</span>
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>Focus score history per child</span>
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>Stars and reward milestones</span>
              </li>
            </ul>
            <div className="mt-auto pt-6">
              <Button
                asChild
                className="w-full rounded-full bg-[#1a8fe3] text-white hover:bg-[#1578c4]"
              >
                <Link href="/dashboard/children">
                  Open Children →
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="surface-card flex h-full min-h-[280px] flex-col border-border/70 shadow-sm">
          <CardContent className="flex h-full flex-col p-6">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ backgroundColor: "rgba(83, 74, 183, 0.15)" }}
            >
              <CalendarRange className="h-5 w-5" style={{ color: "#534AB7" }} />
            </div>
            <h2 className="mt-4 text-[15px] font-bold text-slate-900 dark:text-white">Reports Workspace</h2>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Visualize progress across time ranges, compare performance, and spot trends early so you can celebrate
              wins and adjust routines.
            </p>
            <ul className="mt-4 space-y-2.5 text-xs text-slate-700 dark:text-slate-300">
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>Weekly and monthly progress charts</span>
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>Accuracy trends over time</span>
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>Downloadable session reports</span>
              </li>
            </ul>
            <div className="mt-auto pt-6">
              <Button asChild variant="outline" className="w-full rounded-full border-slate-300 bg-white dark:bg-transparent">
                <Link href="/dashboard/reports">
                  Open Reports →
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function ParentDashboardPage() {
  return (
    <AuthGuard requiredAccountType="parent">
      <ParentPortalContent />
    </AuthGuard>
  )
}
