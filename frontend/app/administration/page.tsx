"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AuthGuard } from "@/components/auth-guard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { fetchApi } from "@/lib/api"
import {
  Activity,
  AlertTriangle,
  Baby,
  Bot,
  ChevronRight,
  ScrollText,
  Shield,
  Stethoscope,
  Users,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

interface AdminOverview {
  total_doctors: number
  total_parents: number
  total_children: number
  total_alexa_users: number
  sessions_today: number
  orphan_children: number
}

interface IncidentsPayload {
  disabled_doctors: Array<{ id: number; email: string; full_name: string | null }>
  disabled_parents: Array<{ id: number; email: string; full_name: string | null }>
  orphan_children: Array<{ id: number; name: string; age: number | null; diagnostic: string | null }>
}

interface AuditLog {
  id: number
  admin_id: number
  action: string
  target_type: string
  target_id: number | null
  details: Record<string, unknown>
  created_at: string | null
}

function humanizeAction(action: string) {
  return action
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

function auditDotClass(action: string) {
  const a = action.toLowerCase()
  if (a.includes("login") || a.includes("auth") || a.includes("signin")) return "bg-blue-500 shadow-[0_0_0_3px_rgba(59,130,246,0.25)]"
  if (a.includes("delete") || a.includes("remove")) return "bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.25)]"
  if (a.includes("create") || a.includes("add") || a.includes("register") || a.includes("signup"))
    return "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.25)]"
  return "bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.25)]"
}

function formatAuditDateTime(iso: string | null) {
  if (!iso) return { date: "—", time: "" }
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
  }
}

function KpiCard(props: {
  label: string
  value: number
  valueClassName: string
  subtitle: string
  subtitleClassName?: string
  icon: LucideIcon
  iconWrapClass: string
  iconClass: string
  borderClassName?: string
}) {
  const { label, value, valueClassName, subtitle, subtitleClassName, icon: Icon, iconWrapClass, iconClass, borderClassName } = props
  return (
    <Card
      className={cn(
        "relative overflow-hidden border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/50",
        borderClassName,
      )}
    >
      <div
        className={cn(
          "absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg",
          iconWrapClass,
        )}
      >
        <Icon className={cn("h-4 w-4", iconClass)} />
      </div>
      <CardContent className="pb-5 pt-5 pr-14">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
        <p className={cn("mt-1 text-3xl font-bold tabular-nums", valueClassName)}>{value}</p>
        <p className={cn("mt-1 text-xs", subtitleClassName ?? "text-slate-500 dark:text-slate-400")}>{subtitle}</p>
      </CardContent>
    </Card>
  )
}

function AdministrationHome() {
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [incidents, setIncidents] = useState<IncidentsPayload | null>(null)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [data, incidentsData] = await Promise.all([
          fetchApi<AdminOverview>("/api/administration/overview"),
          fetchApi<IncidentsPayload>("/api/administration/incidents"),
        ])
        if (!cancelled) {
          setOverview(data)
          setIncidents(incidentsData)
        }
      } catch {
        //
      }
      try {
        const logsData = await fetchApi<AuditLog[]>("/api/administration/audit-logs?limit=5")
        if (!cancelled) setAuditLogs(logsData)
      } catch {
        if (!cancelled) setAuditLogs([])
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const disabledDoctors = incidents?.disabled_doctors || []
  const disabledParents = incidents?.disabled_parents || []
  const orphanList = incidents?.orphan_children || []
  const totalIncidents = disabledDoctors.length + disabledParents.length + orphanList.length

  const orphanCount = overview?.orphan_children ?? orphanList.length

  const incidentViewHref = useMemo(() => {
    if (disabledDoctors.length > 0) return "/administration/doctors"
    if (disabledParents.length > 0) return "/administration/parents"
    return "/administration/children"
  }, [disabledDoctors.length, disabledParents.length])

  const alexaZero = (overview?.total_alexa_users ?? 0) === 0
  const sessionsZero = (overview?.sessions_today ?? 0) === 0

  return (
    <div className="mx-auto min-w-0 max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white md:text-3xl">Administration Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Organize accounts, monitor system activity, and protect platform data.
        </p>
      </div>

      {/* System status banner */}
      {totalIncidents === 0 ? (
        <div className="flex w-full flex-col gap-3 rounded-lg border border-emerald-200 bg-[#ecfdf5] px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-emerald-800/60 dark:bg-emerald-950/30">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
              All systems operational — platform running normally
            </p>
          </div>
          <p className="text-xs font-medium text-emerald-700/90 dark:text-emerald-300/80 sm:text-right">Last checked: just now</p>
        </div>
      ) : orphanList.length > 0 ? (
        <div className="flex w-full flex-col gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/50 dark:bg-red-950/30">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
            <p className="text-sm font-medium text-red-950 dark:text-red-100">
              {totalIncidents} open incident{totalIncidents === 1 ? "" : "s"} — orphan children need linking
            </p>
          </div>
          <p className="text-xs text-red-800/90 dark:text-red-300/80 sm:text-right">Last checked: just now</p>
        </div>
      ) : (
        <div className="flex w-full flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-amber-800/60 dark:bg-amber-950/25">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
              {totalIncidents} open incident{totalIncidents === 1 ? "" : "s"} — review required
            </p>
          </div>
          <p className="text-xs text-amber-800/90 dark:text-amber-300/80 sm:text-right">Last checked: just now</p>
        </div>
      )}

      {loading ? <p className="text-sm text-slate-500">Loading…</p> : null}

      {/* KPI rows */}
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            label="Doctors"
            value={overview?.total_doctors ?? 0}
            valueClassName="text-blue-600 dark:text-blue-400"
            subtitle="Registered specialists"
            icon={Stethoscope}
            iconWrapClass="bg-blue-500/10"
            iconClass="text-blue-600 dark:text-blue-400"
          />
          <KpiCard
            label="Parents"
            value={overview?.total_parents ?? 0}
            valueClassName="text-teal-600 dark:text-teal-400"
            subtitle="Family accounts"
            icon={Users}
            iconWrapClass="bg-teal-500/10"
            iconClass="text-teal-600 dark:text-teal-400"
          />
          <KpiCard
            label="Children"
            value={overview?.total_children ?? 0}
            valueClassName="text-purple-600 dark:text-purple-400"
            subtitle="Patients in the system"
            icon={Baby}
            iconWrapClass="bg-purple-500/10"
            iconClass="text-purple-600 dark:text-purple-400"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            label="Alexa Users"
            value={overview?.total_alexa_users ?? 0}
            valueClassName={alexaZero ? "text-[#d1d5db] dark:text-slate-500" : "text-amber-600 dark:text-amber-400"}
            subtitle="Linked Alexa accounts"
            icon={Bot}
            iconWrapClass="bg-amber-500/10"
            iconClass={alexaZero ? "text-[#d1d5db] dark:text-slate-500" : "text-amber-600 dark:text-amber-400"}
          />
          <KpiCard
            label="Sessions Today"
            value={overview?.sessions_today ?? 0}
            valueClassName={sessionsZero ? "text-[#d1d5db] dark:text-slate-500" : "text-emerald-600 dark:text-emerald-400"}
            subtitle="Quiz sessions since midnight (UTC)"
            icon={Activity}
            iconWrapClass="bg-emerald-500/10"
            iconClass={sessionsZero ? "text-[#d1d5db] dark:text-slate-500" : "text-emerald-600 dark:text-emerald-400"}
          />
          <KpiCard
            label="Orphan Children"
            value={orphanCount}
            valueClassName={
              orphanCount === 0 ? "text-[#d1d5db] dark:text-slate-500" : "text-red-600 dark:text-red-400"
            }
            subtitle={
              orphanCount === 0
                ? "No unlinked children"
                : `${orphanCount} ${orphanCount === 1 ? "child needs" : "children need"} linking`
            }
            subtitleClassName={
              orphanCount === 0 ? "text-emerald-600 dark:text-emerald-400" : "font-medium text-red-600 dark:text-red-400"
            }
            icon={Baby}
            iconWrapClass={orphanCount === 0 ? "bg-slate-100 dark:bg-slate-800" : "bg-red-500/10"}
            iconClass={orphanCount === 0 ? "text-slate-400" : "text-red-600 dark:text-red-400"}
            borderClassName={orphanCount > 0 ? "border-[#fca5a5] dark:border-red-500/50" : undefined}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Incident Snapshot */}
        <Card className="border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-4 dark:border-slate-800">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
              <Shield className="h-5 w-5 text-indigo-500" />
              Incident Snapshot
            </CardTitle>
            <Link
              href={incidentViewHref}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
            >
              View all →
            </Link>
          </CardHeader>
          <CardContent className="space-y-0 pt-4">
            {totalIncidents === 0 ? (
              <div className="mb-4 rounded-md border border-emerald-200 bg-[#ecfdf5] px-3 py-2 text-sm font-medium text-emerald-900 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-100">
                0 open incidents — platform is healthy
              </div>
            ) : (
              <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-100">
                {totalIncidents} open incident{totalIncidents === 1 ? "" : "s"} — attention needed
              </div>
            )}

            <Link
              href="/administration/doctors"
              className={cn(
                "flex items-center gap-3 border-b border-slate-100 py-3.5 pl-3 transition-colors hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-800/40",
                disabledDoctors.length > 0 && "border-l-[3px] border-l-red-500 bg-red-50/50 dark:bg-red-950/20",
              )}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-500/15">
                <Stethoscope className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-white">Doctor issues</p>
                <p
                  className={cn(
                    "text-xs",
                    disabledDoctors.length > 0
                      ? "font-medium text-red-600 dark:text-red-400"
                      : "text-slate-500 dark:text-slate-400",
                  )}
                >
                  {disabledDoctors.length === 0
                    ? "0 unresolved · All clear"
                    : `${disabledDoctors.length} unresolved · Review required`}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
            </Link>

            <Link
              href="/administration/parents"
              className={cn(
                "flex items-center gap-3 border-b border-slate-100 py-3.5 pl-3 transition-colors hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-800/40",
                disabledParents.length > 0 && "border-l-[3px] border-l-red-500 bg-red-50/50 dark:bg-red-950/20",
              )}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-teal-500/15">
                <Users className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-white">Parent issues</p>
                <p
                  className={cn(
                    "text-xs",
                    disabledParents.length > 0
                      ? "font-medium text-red-600 dark:text-red-400"
                      : "text-slate-500 dark:text-slate-400",
                  )}
                >
                  {disabledParents.length === 0
                    ? "0 unresolved · All clear"
                    : `${disabledParents.length} unresolved · Review required`}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
            </Link>

            <Link
              href="/administration/children"
              className={cn(
                "flex items-center gap-3 py-3.5 pl-3 transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40",
                orphanList.length > 0 && "border-l-[3px] border-l-red-500 bg-red-50/50 dark:bg-red-950/20",
              )}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-purple-500/15">
                <Baby className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-white">Orphan children</p>
                <p
                  className={cn(
                    "text-xs",
                    orphanList.length > 0
                      ? "font-medium text-red-600 dark:text-red-400"
                      : "text-slate-500 dark:text-slate-400",
                  )}
                >
                  {orphanList.length === 0
                    ? "0 unlinked · All assigned"
                    : `${orphanList.length} unlinked · Needs assignment`}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
            </Link>
          </CardContent>
        </Card>

        {/* Recent Audit Logs */}
        <Card className="border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-4 dark:border-slate-800">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
              <ScrollText className="h-5 w-5 text-slate-600 dark:text-slate-300" />
              Recent Audit Logs
            </CardTitle>
            <Link href="/administration/audit" className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
              View all →
            </Link>
          </CardHeader>
          <CardContent className="pt-4">
            {!auditLogs.length ? (
              <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No recent activity</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {auditLogs.map((log) => {
                  const { date, time } = formatAuditDateTime(log.created_at)
                  return (
                    <li key={log.id} className="flex gap-3 py-3 first:pt-0">
                      <div className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", auditDotClass(log.action))} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-900 dark:text-slate-100">{humanizeAction(log.action)}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {log.target_type}
                          {log.target_id != null ? ` · #${log.target_id}` : ""} · {date}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">{time}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function AdministrationPage() {
  return (
    <AuthGuard requiredAccountType="administration">
      <AdministrationHome />
    </AuthGuard>
  )
}
