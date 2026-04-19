"use client"

import { useEffect, useMemo, useState } from "react"
import { AuthGuard } from "@/components/auth-guard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { fetchApi } from "@/lib/api"
import { usePortalI18n } from "@/lib/i18n/i18n-context"
import { readLocaleFromStorage, resolveMessage } from "@/lib/i18n/messages"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
  LabelList,
} from "recharts"
import { BarChart3, TrendingUp, Users, CheckCircle2, Clock, ArrowUpRight, ArrowDownRight } from "lucide-react"

type PeriodKey = "7d" | "30d" | "3m"

interface ProgressionRow {
  semaine: string
  progression: number
  objectif: number
}

interface DiagnosticDistributionRow {
  name: string
  value: number
  count: number
  color: string
}

interface DiagnosticGroupRow {
  groupe: string
  enfants: number
  progression: number
}

interface RecentActivityRow {
  id: number
  message: string
  time: string
  accuracy: number
}

interface SpecialistAnalytics {
  total_patients: number
  patients_added_this_month: number
  quiz_today: number
  quiz_yesterday: number
  avg_progression: number
  assiduity_avg: number
  progression_by_week: ProgressionRow[]
  diagnostic_distribution: DiagnosticDistributionRow[]
  diagnostic_by_group: DiagnosticGroupRow[]
  recent_activities: RecentActivityRow[]
  sessions_by_day: { day: string; count: number }[]
}

function scoreColor(score: number) {
  if (score >= 70) return "text-emerald-700"
  if (score >= 30) return "text-amber-700"
  return "text-red-700"
}

function severityColor(name: string) {
  if (name === "Mild") return "#f59e0b"
  if (name === "Moderate") return "#f97316"
  if (name === "Severe") return "#ef4444"
  return "#94a3b8"
}

function AnalyticsPage() {
  const { t } = usePortalI18n()
  const [analytics, setAnalytics] = useState<SpecialistAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<PeriodKey>("7d")

  useEffect(() => {
    let cancelled = false
    async function loadAnalytics() {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchApi<SpecialistAnalytics>(`/api/specialists/dashboard?period=${period}`)
        if (!cancelled) setAnalytics(data)
      } catch (err) {
        if (!cancelled) {
          const loc = readLocaleFromStorage("specialist")
          setError(
            err instanceof Error ? err.message : resolveMessage(loc, "specialist", "analytics.loadError"),
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadAnalytics()
    return () => {
      cancelled = true
    }
  }, [period])

  const progressionDelta = useMemo(() => {
    const rows = analytics?.progression_by_week || []
    if (rows.length < 2) return { delta: 0, sign: "none" as const }
    const last = rows[rows.length - 1]?.progression ?? 0
    const prev = rows[rows.length - 2]?.progression ?? 0
    const delta = Math.round((last - prev) * 10) / 10
    if (delta > 0) return { delta, sign: "up" as const }
    if (delta < 0) return { delta: Math.abs(delta), sign: "down" as const }
    return { delta: 0, sign: "none" as const }
  }, [analytics])

  const peak = useMemo(() => {
    const rows = analytics?.progression_by_week || []
    let best = { semaine: "", progression: -1, objectif: 0 }
    for (const r of rows) if (r.progression > best.progression) best = r
    return best
  }, [analytics])

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t("analytics.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("analytics.subtitle")}</p>
        </div>
        <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800/70">
          {([
            { key: "7d" as const, labelKey: "analytics.range7d" },
            { key: "30d" as const, labelKey: "analytics.range30d" },
            { key: "3m" as const, labelKey: "analytics.range3m" },
          ] as const).map((btn) => (
            <button
              key={btn.key}
              type="button"
              onClick={() => setPeriod(btn.key)}
              className={[
                "px-3 py-1.5 text-sm font-medium rounded-lg transition-colors",
                period === btn.key
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white",
              ].join(" ")}
            >
              {t(btn.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">{t("analytics.loading")}</CardContent>
        </Card>
      ) : error || !analytics ? (
        <Card>
          <CardContent className="py-10 text-center text-destructive">
            {error || t("analytics.loadError")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="surface-card">
              <CardContent className="pt-6 min-h-[122px]">
                <div className="flex h-full items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-400">{t("analytics.kpiPatients")}</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{analytics.total_patients}</p>
                    <p className="mt-1 text-[12px] text-slate-400">{t("analytics.kpiPatientsHint")}</p>
                  </div>
                  <div className="h-9 w-9 rounded-lg bg-[#EBF5FE] flex items-center justify-center">
                    <Users className="h-5 w-5 text-[#1a8fe3]" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="surface-card">
              <CardContent className="pt-6 min-h-[122px]">
                <div className="flex h-full items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-400">{t("analytics.kpiToday")}</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{analytics.quiz_today}</p>
                    <p className="mt-1 text-[12px] text-slate-400">
                      {t("analytics.kpiTodayHint").replace("{n}", String(analytics.quiz_yesterday))}
                    </p>
                  </div>
                  <div className="h-9 w-9 rounded-lg bg-[#E1F5EE] flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-[#0f766e]" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="surface-card">
              <CardContent className="pt-6 min-h-[122px]">
                <div className="flex h-full items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-400">{t("analytics.kpiProgress")}</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{analytics.avg_progression}%</p>
                    <p
                      className={[
                        "mt-1 text-[12px] inline-flex items-center gap-1",
                        progressionDelta.sign === "up"
                          ? "text-emerald-700"
                          : progressionDelta.sign === "down"
                            ? "text-red-700"
                            : "text-slate-400",
                      ].join(" ")}
                    >
                      {progressionDelta.sign === "up" ? <ArrowUpRight className="h-3.5 w-3.5" /> : progressionDelta.sign === "down" ? <ArrowDownRight className="h-3.5 w-3.5" /> : null}
                      {progressionDelta.sign === "none"
                        ? t("analytics.kpiProgressFlat")
                        : t("analytics.kpiProgressDelta")
                            .replace("{sign}", progressionDelta.sign === "up" ? "+" : "-")
                            .replace("{n}", String(progressionDelta.delta))}
                    </p>
                  </div>
                  <div className="h-9 w-9 rounded-lg bg-[#EEEDFE] flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-[#6d28d9]" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="surface-card">
              <CardContent className="pt-6 min-h-[122px]">
                <div className="flex h-full items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-400">{t("analytics.kpiAssiduity")}</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{analytics.assiduity_avg}%</p>
                    <p
                      className={[
                        "mt-1 text-[12px]",
                        analytics.assiduity_avg < 30 ? "text-red-700" : "text-emerald-700",
                      ].join(" ")}
                    >
                      {analytics.assiduity_avg < 30 ? t("analytics.kpiAssiduityLow") : t("analytics.kpiAssiduityOk")}
                    </p>
                  </div>
                  <div className="h-9 w-9 rounded-lg bg-[#FAEEDA] flex items-center justify-center">
                    <Clock className="h-5 w-5 text-[#b45309]" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="surface-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  {t("analytics.weeklyTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[380px] flex flex-col">
                <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-sky-500" /> {t("analytics.legendProgress")}
                  </div>
                  <div className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-slate-400" /> {t("analytics.legendTarget")}
                  </div>
                </div>
                <div className="flex-1 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analytics.progression_by_week}>
                      <CartesianGrid strokeDasharray="3 3" />
                      {[25, 50, 75, 100].map((v) => (
                        <ReferenceLine key={v} y={v} stroke="#e2e8f0" strokeDasharray="4 4" />
                      ))}
                      <XAxis dataKey="semaine" />
                      <YAxis domain={[0, 100]} />
                      <Tooltip
                        formatter={(value: number) => [`${value}%`, t("analytics.tooltipProgress")]}
                        labelFormatter={(label) => t("analytics.tooltipPeriod").replace("{label}", String(label))}
                      />
                      <Area type="monotone" dataKey="progression" stroke="none" fill="#0ea5e9" fillOpacity={0.1} />
                      <Line
                        type="monotone"
                        dataKey="progression"
                        stroke="#0ea5e9"
                        strokeWidth={2.5}
                        dot={(props: any) => {
                          const isPeak = props?.payload?.semaine === peak.semaine && props?.payload?.progression === peak.progression
                          return (
                            <circle
                              cx={props.cx}
                              cy={props.cy}
                              r={isPeak ? 5 : 3}
                              fill={isPeak ? "#0ea5e9" : "#38bdf8"}
                              stroke="#ffffff"
                              strokeWidth={2}
                            />
                          )
                        }}
                      />
                      <Line type="monotone" dataKey="objectif" stroke="#94a3b8" strokeDasharray="5 5" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {peak.progression >= 0 && (
                  <div className="mt-3 text-xs text-muted-foreground">
                    <span className="font-medium text-slate-700 dark:text-slate-200">الذروة:</span> {peak.progression}%
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="surface-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  {t("analytics.diagTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[380px] flex flex-col">
                <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-amber-500" /> {t("common.severityMild")}
                  </div>
                  <div className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-orange-500" /> {t("common.severityModerate")}
                  </div>
                  <div className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-red-500" /> {t("common.severitySevere")}
                  </div>
                </div>
                <div className="flex-1 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.diagnostic_by_group}>
                      <CartesianGrid strokeDasharray="3 3" />
                      {[25, 50, 75, 100].map((v) => (
                        <ReferenceLine key={v} y={v} stroke="#e2e8f0" strokeDasharray="4 4" />
                      ))}
                      <XAxis dataKey="groupe" />
                      <YAxis domain={[0, 100]} />
                      <Tooltip formatter={(value: number) => [`${value}%`, t("analytics.avgProgress")]} />
                      <Bar dataKey="progression" radius={[4, 4, 0, 0]}>
                        {(analytics.diagnostic_by_group || []).map((row) => (
                          <Cell key={row.groupe} fill={severityColor(row.groupe)} />
                        ))}
                        <LabelList dataKey="progression" position="top" formatter={(v: number) => `${v}%`} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="surface-card">
              <CardHeader>
                <CardTitle>{t("analytics.recentTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="h-[420px] flex flex-col">
                <div className="flex-1 space-y-4 overflow-auto pr-1">
                {analytics.recent_activities.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">{t("analytics.recentEmpty")}</p>
                ) : (
                  analytics.recent_activities.map((activity) => (
                    <div key={activity.id} className="flex items-start justify-between gap-4 rounded-lg border border-slate-200/70 dark:border-slate-700 p-4">
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{activity.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">{activity.time}</p>
                      </div>
                      <span className={`text-sm font-semibold whitespace-nowrap ${scoreColor(activity.accuracy)}`}>
                        {Math.round(activity.accuracy)}%
                      </span>
                    </div>
                  ))
                )}
                </div>
              </CardContent>
            </Card>

            <Card className="surface-card">
              <CardHeader>
                <CardTitle>{t("analytics.distTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="h-[420px] flex flex-col">
                <div className="space-y-4">
                  {(["Mild", "Moderate", "Severe"] as const).map((name) => {
                    const row = analytics.diagnostic_distribution.find((x) => x.name === name)
                    const pct = row?.value ?? 0
                    const barColor = name === "Mild" ? "bg-amber-500" : name === "Moderate" ? "bg-orange-500" : "bg-red-500"
                    const nameLabel =
                      name === "Mild"
                        ? t("common.severityMild")
                        : name === "Moderate"
                          ? t("common.severityModerate")
                          : t("common.severitySevere")
                    return (
                      <div key={name}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-slate-900 dark:text-white">{nameLabel}</span>
                          <span className="text-muted-foreground">{pct}%</span>
                        </div>
                        <div className="mt-2 h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="mt-auto pt-6">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{t("analytics.sessionsWeek")}</p>
                  <div className="mt-3 flex items-end justify-between gap-2">
                    {(analytics.sessions_by_day || []).map((d) => {
                      const max = Math.max(1, ...(analytics.sessions_by_day || []).map((x) => x.count))
                      const h = Math.round((d.count / max) * 40)
                      const active = d.count > 0
                      return (
                        <div key={d.day} className="flex flex-col items-center gap-1">
                          <div className="h-10 w-5 flex items-end">
                            <div
                              className={active ? "w-full rounded bg-[#1a8fe3]" : "w-full rounded bg-[#EBF5FE]"}
                              style={{ height: `${Math.max(3, h)}px` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground">{d.day[0]}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Page() {
  return (
    <AuthGuard requiredAccountType="therapist">
      <AnalyticsPage />
    </AuthGuard>
  )
}
