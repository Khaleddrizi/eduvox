"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AuthGuard } from "@/components/auth-guard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { fetchApi } from "@/lib/api"
import LinkIcon from "next/link"
import { ArrowLeft, Search, Users, Mail, Phone, Eye, PlusCircle, ArrowUpDown } from "lucide-react"

type PatientStatus = "on_track" | "monitor" | "needs_attention"
type SortKey = "lastActivity" | "sessions" | "focusScore"
type SortDir = "asc" | "desc"
type FilterKey = "all" | PatientStatus | "Mild" | "Moderate" | "Severe"

interface ApiPatient {
  id: number
  name: string
  age: number | null
  diagnostic?: string | null
  alexa_code?: string | null
  stats?: { avg_accuracy?: number; total_sessions?: number; total_correct?: number }
  last_session?: { created_at?: string } | null
  parent?: {
    email: string
    full_name: string | null
    phone?: string | null
  } | null
}

function formatLastActivity(isoDate: string | undefined): string {
  if (!isoDate) return "No activity yet"
  const d = new Date(isoDate)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffHours < 1) return "Just now"
  if (diffHours < 24) return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays} days ago`
  return d.toLocaleDateString()
}

function getStatus(score: number, sessions: number): PatientStatus {
  if (!sessions || sessions <= 0) return "needs_attention"
  if (score < 30) return "needs_attention"
  if (score < 70) return "monitor"
  return "on_track"
}

function getStatusBadge(status: PatientStatus) {
  const config: Record<PatientStatus, { label: string; className: string }> = {
    on_track: { label: "On Track", className: "border-transparent bg-[#dcfce7] text-[#166534]" },
    monitor: { label: "Monitor", className: "border-transparent bg-[#fef3c7] text-[#92400e]" },
    needs_attention: { label: "Needs Attention", className: "border-transparent bg-[#fee2e2] text-[#991b1b]" },
  }
  const item = config[status]
  return <Badge variant="outline" className={item.className}>{item.label}</Badge>
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

function hashToIndex(input: string, mod: number) {
  let h = 0
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0
  return h % mod
}

function avatarStyleForPatient(patient: ApiPatient) {
  const palette = [
    { bg: "bg-sky-100", text: "text-sky-700" },
    { bg: "bg-violet-100", text: "text-violet-700" },
    { bg: "bg-teal-100", text: "text-teal-700" },
    { bg: "bg-orange-100", text: "text-orange-700" },
  ]
  const idx = hashToIndex(`${patient.id}-${patient.name}`, palette.length)
  return palette[idx]
}

function severityDotClass(level: string | null | undefined) {
  if (level === "Severe") return "bg-red-500"
  if (level === "Moderate") return "bg-orange-500"
  if (level === "Mild") return "bg-amber-500"
  return "bg-slate-300"
}

function PatientsPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [patients, setPatients] = useState<ApiPatient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterKey>("all")
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "focusScore", dir: "asc" })

  useEffect(() => {
    let cancelled = false
    async function loadPatients() {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchApi<ApiPatient[]>("/api/specialists/patients")
        if (!cancelled) setPatients(data)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load patients")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadPatients()
    return () => {
      cancelled = true
    }
  }, [])

  const searchedPatients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return patients
    return patients.filter((patient) => {
      const parentName = patient.parent?.full_name?.toLowerCase() || ""
      const parentEmail = patient.parent?.email?.toLowerCase() || ""
      return (
        patient.name.toLowerCase().includes(q) ||
        (patient.alexa_code || "").toLowerCase().includes(q) ||
        parentName.includes(q) ||
        parentEmail.includes(q)
      )
    })
  }, [patients, searchQuery])

  const derived = useMemo(() => {
    return searchedPatients.map((p) => {
      const sessions = p.stats?.total_sessions ?? 0
      const focusScore = Math.round(p.stats?.avg_accuracy ?? 0)
      const lastIso = p.last_session?.created_at || null
      const status = getStatus(focusScore, sessions)
      return {
        raw: p,
        sessions,
        focusScore,
        lastIso,
        lastLabel: formatLastActivity(lastIso || undefined),
        status,
      }
    })
  }, [searchedPatients])

  const counts = useMemo(() => {
    const all = derived.length
    const byStatus: Record<PatientStatus, number> = { needs_attention: 0, monitor: 0, on_track: 0 }
    const bySeverity: Record<"Mild" | "Moderate" | "Severe", number> = { Mild: 0, Moderate: 0, Severe: 0 }
    for (const p of derived) {
      byStatus[p.status] += 1
      const d = p.raw.diagnostic
      if (d === "Mild" || d === "Moderate" || d === "Severe") bySeverity[d] += 1
    }
    return { all, byStatus, bySeverity }
  }, [derived])

  const filtered = useMemo(() => {
    if (filter === "all") return derived
    if (filter === "needs_attention" || filter === "monitor" || filter === "on_track") {
      return derived.filter((p) => p.status === filter)
    }
    return derived.filter((p) => p.raw.diagnostic === filter)
  }, [derived, filter])

  const sorted = useMemo(() => {
    const items = [...filtered]
    items.sort((a, b) => {
      if (sort.key === "focusScore") {
        const diff = a.focusScore - b.focusScore
        return sort.dir === "asc" ? diff : -diff
      }
      if (sort.key === "sessions") {
        const diff = a.sessions - b.sessions
        return sort.dir === "asc" ? diff : -diff
      }
      const aTime = a.lastIso ? new Date(a.lastIso).getTime() : -1
      const bTime = b.lastIso ? new Date(b.lastIso).getTime() : -1
      const diff = aTime - bTime
      return sort.dir === "asc" ? diff : -diff
    })
    return items
  }, [filtered, sort])

  const toggleSort = (key: SortKey) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: "asc" }
      return { key, dir: prev.dir === "asc" ? "desc" : "asc" }
    })
  }

  const totalPatients = patients.length
  const now = new Date()
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const activePatients = patients.filter((p) => {
    const sessions = p.stats?.total_sessions ?? 0
    const lastIso = p.last_session?.created_at
    const isRecent = lastIso ? new Date(lastIso) >= thirtyDaysAgo : false
    return sessions > 0 || isRecent
  }).length
  const needsAttention = patients.filter((p) => {
    const sessions = p.stats?.total_sessions ?? 0
    const score = Math.round(p.stats?.avg_accuracy ?? 0)
    return getStatus(score, sessions) === "needs_attention"
  }).length

  return (
    <div className="min-w-0">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <Link href="/orthophoniste" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-3">
            <ArrowLeft className="h-4 w-4" /> Back to Patients
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white md:text-3xl">Patient Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Review your patients, linked parents, and activity status.</p>
        </div>
        <Button asChild>
          <LinkIcon href="/orthophoniste/patients/new">
            <PlusCircle className="h-4 w-4 mr-2" />
            Add Patient
          </LinkIcon>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card className="surface-card">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Patients</p>
            <p className="text-3xl font-bold mt-1">{totalPatients}</p>
            <p className="text-xs text-muted-foreground mt-1">Under your care</p>
          </CardContent>
        </Card>
        <Card className="surface-card">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Active Patients</p>
            <p className="text-3xl font-bold mt-1 text-emerald-600">{activePatients}</p>
            <p className="text-xs text-muted-foreground mt-1">Had activity this week</p>
          </CardContent>
        </Card>
        <Card className="surface-card">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Needs Attention</p>
            <p className="text-3xl font-bold mt-1 text-red-600">{needsAttention}</p>
            <p className="text-xs mt-1 text-red-600/90">Score &lt; 30% or inactive</p>
          </CardContent>
        </Card>
      </div>

      <Card className="surface-card border-slate-200/80 dark:border-slate-700">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Patients Directory
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Search by child name, Alexa code, or parent information.</p>
            </div>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search patients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-white dark:bg-slate-800"
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(
              [
                { key: "all" as const, label: `All (${counts.all})` },
                { key: "needs_attention" as const, label: `Needs Attention (${counts.byStatus.needs_attention})` },
                { key: "monitor" as const, label: `Monitor (${counts.byStatus.monitor})` },
                { key: "on_track" as const, label: `On Track (${counts.byStatus.on_track})` },
                { key: "Mild" as const, label: "Mild" },
                { key: "Moderate" as const, label: "Moderate" },
                { key: "Severe" as const, label: "Severe" },
              ] as const
            ).map((chip) => {
              const isActive = filter === chip.key
              const count =
                chip.key === "Mild" || chip.key === "Moderate" || chip.key === "Severe"
                  ? counts.bySeverity[chip.key]
                  : null
              const label =
                chip.key === "Mild" || chip.key === "Moderate" || chip.key === "Severe"
                  ? `${chip.label} (${count})`
                  : chip.label
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setFilter(chip.key)}
                  className={[
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    isActive
                      ? "border-primary bg-blue-50 text-primary"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:bg-slate-800/50",
                  ].join(" ")}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="min-w-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead className="hidden lg:table-cell">Parent</TableHead>
                <TableHead className="hidden md:table-cell">Alexa Code</TableHead>
                <TableHead
                  className={[
                    "hidden select-none md:table-cell",
                    sort.key === "lastActivity" ? "text-primary" : "",
                    "cursor-pointer",
                  ].join(" ")}
                  onClick={() => toggleSort("lastActivity")}
                >
                  <span className="inline-flex items-center gap-1">
                    Last Activity <ArrowUpDown className="h-3.5 w-3.5 opacity-70" />
                  </span>
                </TableHead>
                <TableHead
                  className={[
                    "select-none",
                    sort.key === "sessions" ? "text-primary" : "",
                    "cursor-pointer",
                  ].join(" ")}
                  onClick={() => toggleSort("sessions")}
                >
                  <span className="inline-flex items-center gap-1">
                    Sessions <ArrowUpDown className="h-3.5 w-3.5 opacity-70" />
                  </span>
                </TableHead>
                <TableHead
                  className={[
                    "select-none",
                    sort.key === "focusScore" ? "text-primary" : "",
                    "cursor-pointer",
                  ].join(" ")}
                  onClick={() => toggleSort("focusScore")}
                >
                  <span className="inline-flex items-center gap-1">
                    Focus Score <ArrowUpDown className="h-3.5 w-3.5 opacity-70" />
                  </span>
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    Loading patients...
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-destructive">
                    {error}
                  </TableCell>
                </TableRow>
              ) : sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    No patients found.
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map(({ raw: patient, focusScore, sessions, lastLabel, status, lastIso }) => {
                  const avatar = avatarStyleForPatient(patient)
                  const diagnostic = (patient.diagnostic || "No level") as string
                  const isNoActivity = !lastIso
                  return (
                    <TableRow key={patient.id} className="hover:bg-[#f9fafb] dark:hover:bg-slate-800/50">
                      <TableCell>
                        <div className="relative py-4">
                          <div className={`absolute left-0 top-0 h-full w-[3px] ${getRowAccent(status)}`} />
                          <div className="flex items-center gap-3 pl-2">
                            <div className={`h-9 w-9 rounded-full ${avatar.bg} ${avatar.text} flex items-center justify-center font-semibold`}>
                              {(patient.name || "?").trim().charAt(0).toUpperCase()}
                            </div>
                          <div>
                            <p className="font-medium text-slate-900 dark:text-white">{patient.name}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-2">
                              <span>{patient.age ?? "—"} yrs</span>
                              <span aria-hidden>·</span>
                              <span className="inline-flex items-center gap-1">
                                <span className={`h-2 w-2 rounded-full ${severityDotClass(patient.diagnostic)}`} />
                                <span>{diagnostic}</span>
                              </span>
                            </p>
                          </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {patient.parent ? (
                          <div className="space-y-1">
                            <p className="text-sm font-normal">{patient.parent.full_name || "Parent"}</p>
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              <span>{patient.parent.email}</span>
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              {patient.parent.phone ? (
                                <span>{patient.parent.phone}</span>
                              ) : (
                                <span className="text-slate-400">— no phone</span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">No parent linked</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <code className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {patient.alexa_code || "—"}
                        </code>
                      </TableCell>
                      <TableCell className={["hidden md:table-cell", isNoActivity ? "italic text-muted-foreground" : "text-sm text-muted-foreground"].join(" ")}>
                        {lastLabel}
                      </TableCell>
                      <TableCell className={sessions === 0 ? "text-slate-400" : ""}>{sessions}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                            <div className={`h-full rounded-full ${getProgressColor(focusScore)}`} style={{ width: `${focusScore}%` }} />
                          </div>
                          <span className="text-sm w-10">{focusScore}%</span>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(status)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => router.push(`/orthophoniste/patient/${patient.id}`)}>
                          <Eye className="h-4 w-4 mr-1.5" />
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function Page() {
  return (
    <AuthGuard requiredAccountType="therapist">
      <PatientsPage />
    </AuthGuard>
  )
}
