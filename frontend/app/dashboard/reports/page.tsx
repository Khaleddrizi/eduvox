"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AuthGuard } from "@/components/auth-guard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getAuthHeaders, publicApiBase } from "@/lib/api"
import { cn } from "@/lib/utils"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import {
  TrendingUp,
  CheckCircle2,
  Star,
  Users,
  Download,
  Calendar,
  PieChartIcon,
} from "lucide-react"

interface ApiChild {
  id: number
  name: string
  stats: { total_sessions: number; avg_accuracy: number }
}

interface ApiSession {
  id: number
  patient_id: number
  score: number
  total_questions: number
  accuracy_pct: number
  created_at: string | null
}

type RangeKey = "7d" | "30d" | "all"

function withinRange(value: string | null, range: RangeKey) {
  if (!value) return false
  if (range === "all") return true
  const d = new Date(value).getTime()
  const now = Date.now()
  const days = range === "7d" ? 7 : 30
  const threshold = now - days * 24 * 60 * 60 * 1000
  return d >= threshold
}

function initials(name: string) {
  const t = name.trim()
  return (t[0] || "?").toUpperCase()
}

function accColor(pct: number) {
  if (pct >= 70) return { bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" }
  if (pct >= 30) return { bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" }
  return { bar: "bg-red-500", text: "text-red-600 dark:text-red-400" }
}

function scorePillClass(pct: number) {
  if (pct >= 70) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
  if (pct >= 30) return "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
  return "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200"
}

/** Last 4 weeks from today: W1 oldest … W4 newest; counts only sessions in `sessions`. */
function weeklySeries(sessions: ApiSession[]) {
  const counts = [0, 0, 0, 0]
  const now = Date.now()
  for (const s of sessions) {
    if (!s.created_at) continue
    const daysAgo = (now - new Date(s.created_at).getTime()) / 86400000
    if (daysAgo < 0 || daysAgo >= 28) continue
    const bucket = Math.min(3, Math.floor(daysAgo / 7))
    const idx = 3 - bucket
    counts[idx] += 1
  }
  return [
    { name: "W1", sessions: counts[0] },
    { name: "W2", sessions: counts[1] },
    { name: "W3", sessions: counts[2] },
    { name: "W4", sessions: counts[3] },
  ]
}

function formatTableDate(value: string | null) {
  if (!value) return "—"
  try {
    return new Date(value).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return "—"
  }
}

function exportSessionsCsv(rows: { child: string; date: string; score: string; questions: string; accuracy: string }[]) {
  const header = ["Child", "Date", "Score", "Questions", "Accuracy"]
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`
  const lines = [header.join(","), ...rows.map((r) => [esc(r.child), esc(r.date), r.score, r.questions, esc(r.accuracy)].join(","))]
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `adhd-assist-sessions-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const DONUT_GREEN = "#22c55e"
const DONUT_AMBER = "#f59e0b"
const DONUT_RED = "#ef4444"

function ReportsPageContent() {
  const [children, setChildren] = useState<ApiChild[]>([])
  const [sessions, setSessions] = useState<ApiSession[]>([])
  const [range, setRange] = useState<RangeKey>("30d")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const childrenRes = await fetch(`${publicApiBase}/api/parents/children`, { headers: getAuthHeaders() })
        if (!childrenRes.ok || cancelled) return
        const kids: ApiChild[] = await childrenRes.json()
        if (cancelled) return
        setChildren(kids)

        const allSessions: ApiSession[] = []
        for (const child of kids) {
          const r = await fetch(
            `${publicApiBase}/api/parents/children/${child.id}/sessions?limit=300`,
            { headers: getAuthHeaders() },
          )
          if (r.ok) {
            const data: ApiSession[] = await r.json()
            allSessions.push(...data.map((s) => ({ ...s, patient_id: child.id })))
          }
        }
        if (!cancelled) setSessions(allSessions)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const childNameById = useMemo(() => {
    const m = new Map<number, string>()
    children.forEach((c) => m.set(c.id, c.name))
    return m
  }, [children])

  const filtered = useMemo(() => sessions.filter((s) => withinRange(s.created_at, range)), [sessions, range])

  const byChild = useMemo(() => {
    return children.map((child) => {
      const own = filtered.filter((s) => s.patient_id === child.id)
      const avg = own.length ? own.reduce((sum, s) => sum + s.accuracy_pct, 0) / own.length : 0
      return { id: child.id, name: child.name, sessions: own.length, avgAccuracy: Math.round(avg) }
    })
  }, [children, filtered])

  const totalSessions = filtered.length
  const overallAccuracy = filtered.length
    ? Math.round(filtered.reduce((s, x) => s + x.accuracy_pct, 0) / filtered.length)
    : 0
  const starsEarned = useMemo(() => filtered.reduce((sum, s) => sum + (s.score ?? 0), 0), [filtered])
  const activeChildren = useMemo(() => {
    const ids = new Set(filtered.map((s) => s.patient_id))
    return ids.size
  }, [filtered])

  const lineData = useMemo(() => weeklySeries(filtered), [filtered])
  const lineMax = useMemo(() => Math.max(0, ...lineData.map((d) => d.sessions)), [lineData])

  const distribution = useMemo(() => {
    let green = 0
    let amber = 0
    let red = 0
    for (const s of filtered) {
      const p = s.accuracy_pct
      if (p >= 70) green += 1
      else if (p >= 30) amber += 1
      else red += 1
    }
    const total = green + amber + red
    return {
      total,
      pie: [
        { name: "High (≥70%)", value: green, color: DONUT_GREEN },
        { name: "Mid (30–69%)", value: amber, color: DONUT_AMBER },
        { name: "Low (<30%)", value: red, color: DONUT_RED },
      ].filter((x) => x.value > 0),
      pct: {
        green: total ? Math.round((green / total) * 100) : 0,
        amber: total ? Math.round((amber / total) * 100) : 0,
        red: total ? Math.round((red / total) * 100) : 0,
      },
    }
  }, [filtered])

  const milestones = useMemo(() => {
    let bronze = 0
    let silver = 0
    let gold = 0
    for (const s of filtered) {
      const p = s.accuracy_pct
      if (p >= 85) gold += 1
      else if (p >= 50) silver += 1
      else bronze += 1
    }
    return { bronze, silver, gold }
  }, [filtered])

  const sortedTableRows = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0
      return tb - ta
    })
  }, [filtered])

  const handleExportCsv = useCallback(() => {
    const rows = sortedTableRows.map((s) => ({
      child: childNameById.get(s.patient_id) || "—",
      date: formatTableDate(s.created_at),
      score: `${s.score}/${s.total_questions ?? "?"}`,
      questions: String(s.total_questions ?? ""),
      accuracy: `${Math.round(s.accuracy_pct)}%`,
    }))
    exportSessionsCsv(rows)
  }, [sortedTableRows, childNameById])

  const handleExportPdf = useCallback(() => {
    window.print()
  }, [])

  const rangeLabels: Record<RangeKey, string> = { "7d": "7 days", "30d": "30 days", all: "All" }

  return (
    <div id="parent-reports-print" className="max-w-7xl mx-auto space-y-6">
      {/* Header: title + period + export */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white md:text-3xl">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">Family performance insights across children and sessions.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["7d", "30d", "all"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setRange(key)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                range === key
                  ? "bg-[#1a8fe3] text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800",
              )}
            >
              {rangeLabels[key]}
            </button>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 rounded-lg border-slate-200 bg-white text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-900"
            onClick={handleExportPdf}
          >
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="surface-card border-border/70 shadow-sm">
          <CardContent className="flex items-stretch justify-between gap-3 p-4">
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Total Sessions</p>
              <p className="text-xl font-bold text-[#0f766e]">{loading ? "—" : totalSessions}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{rangeLabels[range]} window</p>
            </div>
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
              style={{ backgroundColor: "rgba(15, 118, 110, 0.15)" }}
            >
              <TrendingUp className="h-4 w-4 text-[#0f766e]" />
            </div>
          </CardContent>
        </Card>
        <Card className="surface-card border-border/70 shadow-sm">
          <CardContent className="flex items-stretch justify-between gap-3 p-4">
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Overall Accuracy</p>
              <p className="text-xl font-bold text-[#534AB7]">{loading ? "—" : `${overallAccuracy}%`}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Across all sessions</p>
            </div>
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
              style={{ backgroundColor: "rgba(83, 74, 183, 0.15)" }}
            >
              <CheckCircle2 className="h-4 w-4 text-[#534AB7]" />
            </div>
          </CardContent>
        </Card>
        <Card className="surface-card border-border/70 shadow-sm">
          <CardContent className="flex items-stretch justify-between gap-3 p-4">
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Stars Earned</p>
              <p className="text-xl font-bold text-[#d97706]">{loading ? "—" : starsEarned}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Correct answers total</p>
            </div>
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
              style={{ backgroundColor: "rgba(217, 119, 6, 0.15)" }}
            >
              <Star className="h-4 w-4 text-[#d97706]" />
            </div>
          </CardContent>
        </Card>
        <Card className="surface-card border-border/70 shadow-sm">
          <CardContent className="flex items-stretch justify-between gap-3 p-4">
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Active Children</p>
              <p className="text-xl font-bold text-[#1a8fe3]">{loading ? "—" : activeChildren}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">With sessions in period</p>
            </div>
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
              style={{ backgroundColor: "rgba(26, 143, 227, 0.15)" }}
            >
              <Users className="h-4 w-4 text-[#1a8fe3]" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts grid */}
      <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
        <Card className="surface-card flex h-full min-h-[420px] flex-col border-border/70 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Performance by Child</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-6">
            <div className="space-y-4">
              {children.length === 0 && !loading ? (
                <p className="text-sm text-muted-foreground">No children linked.</p>
              ) : (
                byChild.map((row) => {
                  const colors = accColor(row.avgAccuracy)
                  const pct = row.sessions ? row.avgAccuracy : 0
                  return (
                    <div key={row.id} className="flex items-center gap-3">
                      <div className="flex min-w-0 items-center gap-2 shrink-0 w-[140px] sm:w-[160px]">
                        <div
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-[#1a8fe3]"
                          style={{ backgroundColor: "#EBF5FE" }}
                        >
                          {initials(row.name)}
                        </div>
                        <span className="truncate text-sm font-medium text-slate-900 dark:text-white">{row.name}</span>
                      </div>
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div className={cn("h-full rounded-full transition-all", colors.bar)} style={{ width: `${pct}%` }} />
                        </div>
                        <span className={cn("w-10 shrink-0 text-right text-sm font-semibold tabular-nums", colors.text)}>
                          {row.sessions ? `${pct}%` : "—"}
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            <div className="mt-auto border-t border-slate-100 pt-4 dark:border-slate-800">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Sessions over time</p>
              <div className="h-[160px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={lineData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} className="text-xs" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, fontSize: 12 }}
                      formatter={(v: number) => [v, "Sessions"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="sessions"
                      stroke={lineMax === 0 ? "#94a3b8" : "#1a8fe3"}
                      strokeWidth={2}
                      dot={{ r: 3, fill: lineMax === 0 ? "#94a3b8" : "#1a8fe3" }}
                      activeDot={{ r: 4 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="surface-card flex h-full min-h-[420px] flex-col border-border/70 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Accuracy Distribution + Stars Milestones</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-6">
            <div className="flex min-h-[180px] flex-1 flex-col items-center justify-center">
              {distribution.total === 0 ? (
                <div className="flex flex-col items-center py-6 text-center">
                  <PieChartIcon className="h-10 w-10 text-slate-300 dark:text-slate-600" strokeWidth={1.25} />
                  <p className="mt-3 text-sm text-muted-foreground">No sessions yet</p>
                </div>
              ) : (
                <div className="flex w-full flex-col items-center sm:flex-row sm:justify-center sm:gap-6">
                  <div className="h-[160px] w-full max-w-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={distribution.pie}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={48}
                          outerRadius={72}
                          paddingAngle={2}
                        >
                          {distribution.pie.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => [v, "Sessions"]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="mt-4 space-y-2 text-xs sm:mt-0">
                    <li className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: DONUT_GREEN }} />
                      High ≥70% — {distribution.pct.green}%
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: DONUT_AMBER }} />
                      Mid 30–69% — {distribution.pct.amber}%
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: DONUT_RED }} />
                      Low &lt;30% — {distribution.pct.red}%
                    </li>
                  </ul>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Stars Milestones
              </p>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { key: "bronze", label: "Bronze", count: milestones.bronze },
                    { key: "silver", label: "Silver", count: milestones.silver },
                    { key: "gold", label: "Gold", count: milestones.gold },
                  ] as const
                ).map((m) => (
                  <div
                    key={m.key}
                    className={cn(
                      "rounded-lg border px-2 py-3 text-center transition-colors",
                      m.count === 0
                        ? "border-slate-100 bg-slate-50/80 text-muted-foreground dark:border-slate-800 dark:bg-slate-900/40"
                        : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950/30",
                    )}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wide">{m.label}</p>
                    <p className={cn("mt-1 text-lg font-bold", m.count === 0 && "text-slate-400 dark:text-slate-500")}>
                      {m.count}
                    </p>
                    <p className="text-[10px] text-muted-foreground">sessions</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Tiers by accuracy: Gold ≥85%, Silver 50–84%, Bronze &lt;50%.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sessions table */}
      <Card className="surface-card border-border/70 shadow-sm print:break-inside-avoid">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-2">
          <CardTitle className="text-base">Recent sessions</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 border-slate-200 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-900"
            onClick={handleExportCsv}
            disabled={sortedTableRows.length === 0}
          >
            <Download className="h-3.5 w-3.5 mr-2" />
            Export CSV
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          {sortedTableRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <Calendar className="h-[26px] w-[26px] text-slate-400 dark:text-slate-500" strokeWidth={1.25} />
              <p className="mt-3 text-xs text-muted-foreground">No sessions recorded yet</p>
              <p className="mt-1 max-w-sm text-[11px] text-slate-400 dark:text-slate-500">
                Sessions will appear here once your child starts a quiz.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left dark:border-slate-800 dark:bg-slate-900/50">
                    <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Child
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Date
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Score
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Questions
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Accuracy
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTableRows.map((s) => {
                    const name = childNameById.get(s.patient_id) || "—"
                    const pct = Math.round(s.accuracy_pct)
                    return (
                      <tr
                        key={s.id}
                        className="border-b border-slate-50 transition-colors hover:bg-slate-50/80 dark:border-slate-800/80 dark:hover:bg-slate-900/40"
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-[#1a8fe3]"
                              style={{ backgroundColor: "#EBF5FE" }}
                            >
                              {initials(name)}
                            </div>
                            <span className="font-medium text-slate-900 dark:text-white truncate max-w-[140px]">
                              {name}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground text-xs">
                          {formatTableDate(s.created_at)}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                              scorePillClass(pct),
                            )}
                          >
                            {s.score}/{s.total_questions ?? "?"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-slate-700 dark:text-slate-300">
                          {s.total_questions ?? "—"}
                        </td>
                        <td className={cn("px-3 py-2.5 font-semibold tabular-nums text-xs", accColor(pct).text)}>
                          {pct}%
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function ReportsPage() {
  return (
    <AuthGuard requiredAccountType="parent">
      <ReportsPageContent />
    </AuthGuard>
  )
}
