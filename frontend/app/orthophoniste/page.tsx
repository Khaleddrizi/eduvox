"use client"

import { useState, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AuthGuard } from "@/components/auth-guard"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { getAuthHeaders, publicApiBase } from "@/lib/api"
import {
  Users,
  Brain,
  Search,
  Eye,
  CheckCircle2,
  AlertTriangle,
  ArrowUpDown,
} from "lucide-react"

type PatientStatus = "on_track" | "monitor" | "needs_attention"

type SortKey = "focusScore" | "lastActivity"
type SortDir = "asc" | "desc"

interface ApiPatient {
  id: number
  name: string
  age: number | null
  diagnostic?: string | null
  alexa_code?: string | null
  stats?: { avg_accuracy?: number; total_sessions?: number }
  last_session?: { created_at?: string } | null
}

interface DisplayPatient {
  id: number
  name: string
  age: number
  alexaCode: string
  lastActivity: string
  lastActivityIso: string | null
  focusScore: number
  status: PatientStatus
  hasActivity: boolean
}

function formatLastActivity(isoDate: string | undefined): string {
  if (!isoDate) return "No activity yet"
  const d = new Date(isoDate)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffMins < 60) return diffMins <= 1 ? "Just now" : `${diffMins} minutes ago`
  if (diffHours < 24) return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays} days ago`
  return d.toLocaleDateString()
}

function apiToDisplay(p: ApiPatient): DisplayPatient {
  const lastIso = p.last_session?.created_at || null
  const hasActivity = Boolean(lastIso)
  const focusScore = Math.round(p.stats?.avg_accuracy ?? 0)
  let status: PatientStatus = "on_track"
  if (!hasActivity || focusScore < 30) status = "needs_attention"
  else if (focusScore < 70) status = "monitor"
  return {
    id: p.id,
    name: p.name,
    age: p.age ?? 0,
    alexaCode: p.alexa_code || "—",
    lastActivity: formatLastActivity(lastIso || undefined),
    lastActivityIso: lastIso,
    focusScore,
    status,
    hasActivity,
  }
}

function getStatusBadge(status: PatientStatus) {
  const config = {
    on_track: { label: "On Track", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
    monitor: { label: "Monitor", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" },
    needs_attention: { label: "Needs Attention", className: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30" },
  }
  const c = config[status]
  return <Badge variant="outline" className={c.className}>{c.label}</Badge>
}

function getProgressColor(score: number) {
  if (score >= 70) return "bg-emerald-500"
  if (score >= 30) return "bg-amber-500"
  return "bg-red-500"
}

function getRowAccent(status: PatientStatus) {
  if (status === "on_track") return "bg-emerald-500"
  if (status === "monitor") return "bg-amber-500"
  return "bg-red-500"
}

function DoctorPortalContent() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [patients, setPatients] = useState<DisplayPatient[]>([])
  const [patientsLoading, setPatientsLoading] = useState(true)
  const [patientsError, setPatientsError] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "lastActivity", dir: "desc" })

  useEffect(() => {
    let cancelled = false
    async function load() {
      setPatientsLoading(true)
      setPatientsError(null)
      try {
        const res = await fetch(`${publicApiBase}/api/doctor/dashboard-summary`, {
          headers: getAuthHeaders(),
        })
        if (cancelled) return
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          setPatientsError(err.error || "Failed to load patients")
          setPatients([])
          return
        }
        const data: ApiPatient[] = await res.json()
        setPatients(data.map(apiToDisplay))
      } catch (e) {
        if (!cancelled) {
          setPatientsError("Failed to load patients")
          setPatients([])
        }
      } finally {
        if (!cancelled) setPatientsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const filteredPatients = useMemo(() => {
    if (!searchQuery.trim()) return patients
    const q = searchQuery.toLowerCase()
    return patients.filter((p) => p.name.toLowerCase().includes(q))
  }, [patients, searchQuery])

  const sortedPatients = useMemo(() => {
    const items = [...filteredPatients]
    items.sort((a, b) => {
      if (sort.key === "focusScore") {
        const diff = a.focusScore - b.focusScore
        return sort.dir === "asc" ? diff : -diff
      }
      const aTime = a.lastActivityIso ? new Date(a.lastActivityIso).getTime() : -1
      const bTime = b.lastActivityIso ? new Date(b.lastActivityIso).getTime() : -1
      const diff = aTime - bTime
      return sort.dir === "asc" ? diff : -diff
    })
    return items
  }, [filteredPatients, sort])

  const kpis = useMemo(() => {
    const totalPatients = patients.length
    const needsAttention = patients.filter((p) => p.status === "needs_attention").length
    const avgFocusScore = totalPatients
      ? Math.round(patients.reduce((sum, p) => sum + (p.focusScore || 0), 0) / totalPatients)
      : 0
    const now = new Date()
    const sevenDaysAgo = new Date(now)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const activeThisWeek = patients.filter((p) => p.lastActivityIso && new Date(p.lastActivityIso) >= sevenDaysAgo).length
    const alertCount = needsAttention
    return { totalPatients, needsAttention, avgFocusScore, activeThisWeek, alertCount }
  }, [patients])

  const toggleSort = (key: SortKey) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: "desc" }
      return { key, dir: prev.dir === "desc" ? "asc" : "desc" }
    })
  }

  return (
    <div className="min-w-0 p-6 md:p-8">
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">Overview of all patients and attention alerts</p>
      </div>

      {/* KPI summary */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-4">
        <Card className="surface-card">
          <CardContent className="pt-6">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total Patients</p>
            <p className="mt-1 text-3xl font-bold text-sky-700 dark:text-sky-400">{kpis.totalPatients}</p>
          </CardContent>
        </Card>
        <Card className="surface-card">
          <CardContent className="pt-6">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Needs Attention</p>
            <p className="mt-1 text-3xl font-bold text-red-700 dark:text-red-400">{kpis.needsAttention}</p>
          </CardContent>
        </Card>
        <Card className="surface-card">
          <CardContent className="pt-6">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Avg Focus Score</p>
            <p className="mt-1 text-3xl font-bold text-amber-700 dark:text-amber-400">{kpis.avgFocusScore}%</p>
          </CardContent>
        </Card>
        <Card className="surface-card">
          <CardContent className="pt-6">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Active This Week</p>
            <p className="mt-1 text-3xl font-bold text-emerald-700 dark:text-emerald-400">{kpis.activeThisWeek}</p>
          </CardContent>
        </Card>
      </div>

        {/* Attention Alerts banner */}
        <div
          className={[
            "mb-6 flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-2 text-sm",
            kpis.alertCount > 0
              ? "border-red-200/70 bg-red-50/70 text-red-800 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-200"
              : "border-emerald-200/70 bg-emerald-50/70 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200",
          ].join(" ")}
        >
          <div className="flex items-center gap-2">
            {kpis.alertCount > 0 ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            <span className="font-medium">
              {kpis.alertCount > 0
                ? `${kpis.alertCount} attention alert${kpis.alertCount === 1 ? "" : "s"}`
                : "No attention alerts at the moment"}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">Focus score & recent activity</span>
        </div>

        {/* Patients Overview */}
        <Card className="border-slate-200 dark:border-slate-700 shadow-sm">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                  <Users className="h-5 w-5 text-primary" />
                  <span className="text-[15px] font-semibold">Patients Overview</span>
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Table of all children under your care</p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search patients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="min-w-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-200 dark:border-slate-700 hover:bg-transparent">
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-400">Patient Name</TableHead>
                  <TableHead className="hidden text-[11px] uppercase tracking-wider text-slate-400 sm:table-cell">Age</TableHead>
                  <TableHead className="hidden text-[11px] uppercase tracking-wider text-slate-400 lg:table-cell">Alexa Code</TableHead>
                  <TableHead
                    className="hidden cursor-pointer select-none text-[11px] uppercase tracking-wider text-slate-400 md:table-cell"
                    onClick={() => toggleSort("lastActivity")}
                    title="Sort by last activity"
                  >
                    <span className="inline-flex items-center gap-1">
                      Last Activity <ArrowUpDown className="h-3.5 w-3.5 opacity-70" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none text-[11px] uppercase tracking-wider text-slate-400"
                    onClick={() => toggleSort("focusScore")}
                    title="Sort by focus score"
                  >
                    <span className="inline-flex items-center gap-1">
                      Overall Focus Score <ArrowUpDown className="h-3.5 w-3.5 opacity-70" />
                    </span>
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-400">Status</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-400 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patientsLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      Loading patients...
                    </TableCell>
                  </TableRow>
                ) : patientsError ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-destructive">
                      {patientsError}
                    </TableCell>
                  </TableRow>
                ) : filteredPatients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      No patients found.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedPatients.map((patient) => (
                    <TableRow
                      key={patient.id}
                      className="border-slate-100 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
                    >
                      <TableCell className="relative py-5">
                        <div className={`absolute left-0 top-0 h-full w-[3px] ${getRowAccent(patient.status)}`} />
                        <div className="flex items-center gap-3 pl-2">
                          <Avatar className="h-9 w-9 border-2 border-slate-200 dark:border-slate-700">
                            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                              {patient.name.split(" ").map((n) => n[0]).join("")}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-slate-900 dark:text-white">{patient.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden py-5 text-slate-600 dark:text-slate-400 sm:table-cell">{patient.age} yrs</TableCell>
                      <TableCell className="hidden py-5 lg:table-cell">
                        <code className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[12px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {patient.alexaCode}
                        </code>
                      </TableCell>
                      <TableCell
                        className={[
                          "hidden py-5 md:table-cell",
                          patient.hasActivity ? "text-slate-600 dark:text-slate-400" : "italic text-muted-foreground",
                        ].join(" ")}
                      >
                        {patient.lastActivity}
                      </TableCell>
                      <TableCell className="py-5 text-[13px]">
                        <div className="flex items-center gap-2 min-w-[140px]">
                          <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                            <div
                              className={[
                                "h-full rounded-full transition-all",
                                patient.hasActivity ? getProgressColor(patient.focusScore) : "bg-slate-300 dark:bg-slate-600",
                              ].join(" ")}
                              style={{ width: `${patient.focusScore}%` }}
                            />
                          </div>
                          <span
                            className={[
                              "text-sm font-semibold w-10",
                              patient.hasActivity
                                ? patient.focusScore >= 70
                                  ? "text-emerald-700 dark:text-emerald-400"
                                  : patient.focusScore >= 30
                                    ? "text-amber-700 dark:text-amber-400"
                                    : "text-red-700 dark:text-red-400"
                                : "text-muted-foreground",
                            ].join(" ")}
                          >
                            {patient.focusScore}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-5">{getStatusBadge(patient.status)}</TableCell>
                      <TableCell className="py-5 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-primary border-primary/30 hover:bg-primary/10"
                          onClick={() => router.push(`/orthophoniste/patient/${patient.id}`)}
                        >
                          <Eye className="h-4 w-4 mr-1.5" />
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
    </div>
  )
}

export default function DoctorPortalPage() {
  return (
    <AuthGuard requiredAccountType="therapist">
      <DoctorPortalContent />
    </AuthGuard>
  )
}
