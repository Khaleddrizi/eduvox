"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { AuthGuard } from "@/components/auth-guard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { fetchApi } from "@/lib/api"
import { AdminIssuesStrip } from "@/components/admin/admin-entity-pages"
import { usePortalI18n } from "@/lib/i18n/i18n-context"
import { readLocaleFromStorage, resolveMessage } from "@/lib/i18n/messages"
import type { AppLocale } from "@/lib/i18n/types"
import {
  UserRound,
  Users,
  Mail,
  Phone,
  Activity,
  Pencil,
  Wand2,
  Info,
  Download,
  CalendarDays,
  Gauge,
  Clock3,
  Lock,
} from "lucide-react"
import { toast } from "sonner"

interface PatientDetails {
  id: number
  name: string
  age: number | null
  diagnostic?: string | null
  alexa_code?: string | null
  created_at?: string | null
  stats?: {
    total_sessions: number
    total_correct: number
    total_asked: number
    avg_accuracy: number
  }
  last_session?: {
    score: number
    total_questions: number
    accuracy_pct: number
    created_at?: string | null
  } | null
  parent?: {
    id: number
    email: string
    full_name: string | null
    phone?: string | null
  } | null
  assigned_program_id?: number | null
  assigned_program?: {
    id: number
    name: string
    status: string
    question_count: number
    pdf_path?: string | null
  } | null
}

interface PatientSession {
  id: number
  score: number
  total_questions: number
  accuracy_pct: number
  created_at: string | null
}

interface SpecialistMeProfile {
  subscription?: {
    billing_exempt: boolean
    new_program_assign_blocked: boolean
  }
}

interface TrainingProgram {
  id: number
  name: string
  status: string
  question_count: number
}

function localeTag(loc: AppLocale) {
  if (loc === "ar") return "ar"
  if (loc === "fr") return "fr-FR"
  return "en-US"
}

function formatDateTime(value: string | null | undefined, locale: AppLocale) {
  if (!value) return "—"
  return new Date(value).toLocaleString(localeTag(locale))
}

function getStatus(score: number, totalSessions: number) {
  if (!totalSessions || totalSessions <= 0 || score < 30) return "needs_attention" as const
  if (score < 70) return "monitor" as const
  return "on_track" as const
}

function getStatusChip(status: ReturnType<typeof getStatus>, t: (key: string) => string) {
  const config = {
    on_track: { cls: "bg-emerald-100 text-emerald-700", key: "status.onTrack" },
    monitor: { cls: "bg-amber-100 text-amber-700", key: "status.monitor" },
    needs_attention: { cls: "bg-red-100 text-red-700", key: "status.needsAttention" },
  }
  const c = config[status]
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${c.cls}`}>{t(c.key)}</span>
  )
}

function diagnosticLabel(diagnostic: string | null | undefined, t: (key: string) => string) {
  if (diagnostic === "Mild") return t("common.severityMild")
  if (diagnostic === "Moderate") return t("common.severityModerate")
  if (diagnostic === "Severe") return t("common.severitySevere")
  return t("common.noLevel")
}

function programStatusLabel(status: string, t: (key: string) => string) {
  if (status === "ready") return t("library.statusReady")
  if (status === "processing") return t("library.statusProcessing")
  if (status === "failed") return t("library.statusFailed")
  return status
}

function severityChip(level: string | null | undefined) {
  if (level === "Mild") return "bg-amber-100 text-amber-700"
  if (level === "Moderate") return "bg-orange-100 text-orange-700"
  if (level === "Severe") return "bg-red-100 text-red-700"
  return "bg-slate-100 text-slate-700"
}

function initials(name: string | null | undefined) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return "P"
  return parts.length === 1 ? parts[0][0].toUpperCase() : `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function PatientDetailsPageContent() {
  const { t, locale } = usePortalI18n()
  const params = useParams<{ id: string }>()
  const patientId = params?.id
  const [patient, setPatient] = useState<PatientDetails | null>(null)
  const [sessions, setSessions] = useState<PatientSession[]>([])
  const [programs, setPrograms] = useState<TrainingProgram[]>([])
  const [assigningProgram, setAssigningProgram] = useState(false)
  const [selectedProgramValue, setSelectedProgramValue] = useState("none")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [meProfile, setMeProfile] = useState<SpecialistMeProfile | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchApi<SpecialistMeProfile>("/api/specialists/me")
      .then((me) => {
        if (!cancelled) setMeProfile(me)
      })
      .catch(() => {
        //
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!patientId) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [patientData, sessionsData, programsData] = await Promise.all([
          fetchApi<PatientDetails>(`/api/specialists/patients/${patientId}`),
          fetchApi<PatientSession[]>(`/api/specialists/patients/${patientId}/sessions?limit=20`),
          fetchApi<TrainingProgram[]>("/api/specialists/library"),
        ])
        if (cancelled) return
        setPatient(patientData)
        setSelectedProgramValue(patientData.assigned_program_id ? String(patientData.assigned_program_id) : "none")
        setSessions(sessionsData)
        setPrograms(programsData.filter((program) => program.status === "ready"))
      } catch (err) {
        if (!cancelled) {
          const loc = readLocaleFromStorage("specialist")
          setError(
            err instanceof Error ? err.message : resolveMessage(loc, "specialist", "patientDetail.loadError"),
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [patientId])

  const assignBlocked =
    !!(meProfile?.subscription?.new_program_assign_blocked && !meProfile?.subscription?.billing_exempt)

  const assignWouldSetNewProgram = useMemo(() => {
    if (!patient) return false
    const cur = patient.assigned_program_id ?? patient.assigned_program?.id ?? null
    const sel = selectedProgramValue === "none" ? null : Number(selectedProgramValue)
    if (sel === null) return false
    if (cur === sel) return false
    return true
  }, [patient, selectedProgramValue])

  const handleAssignProgram = async () => {
    if (!patientId || assigningProgram) return
    if (assignBlocked && assignWouldSetNewProgram) {
      toast.error(t("patientDetail.subscriptionAssignBlocked"))
      return
    }
    setAssigningProgram(true)
    try {
      const updated = await fetchApi<PatientDetails>(`/api/specialists/patients/${patientId}/assign-program`, {
        method: "PUT",
        body: JSON.stringify({
          training_program_id: selectedProgramValue === "none" ? null : Number(selectedProgramValue),
        }),
      })
      setPatient(updated)
      toast.success(
        selectedProgramValue === "none" ? t("patientDetail.toastProgramRemoved") : t("patientDetail.toastProgramSet"),
      )
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : resolveMessage(readLocaleFromStorage("specialist"), "specialist", "patientDetail.toastProgramErr"),
      )
    } finally {
      setAssigningProgram(false)
    }
  }

  const exportSessionsCsv = () => {
    if (!sessions.length) return
    const rows = [
      [
        t("patientDetail.csvHeaderDate"),
        t("patientDetail.csvHeaderScore"),
        t("patientDetail.csvHeaderTotal"),
        t("patientDetail.csvHeaderAccuracy"),
        t("patientDetail.csvHeaderDuration"),
      ],
    ]
    for (const s of sessions) {
      const duration = `${Math.max(1, s.total_questions) * 20}s`
      rows.push([
        formatDateTime(s.created_at, locale),
        String(s.score),
        String(s.total_questions),
        `${s.accuracy_pct}%`,
        duration,
      ])
    }
    const csv = rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `patient-${patientId}-sessions.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      {loading ? (
        <p className="text-sm text-muted-foreground">{t("patientDetail.loading")}</p>
      ) : error || !patient ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {error || t("patientDetail.notFound")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200/70 bg-white/80 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/40">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <div className="h-[52px] w-[52px] rounded-full bg-[#EBF5FE] text-[#1a8fe3] flex items-center justify-center text-lg font-semibold">
                  {(patient.name || "P").trim().charAt(0).toUpperCase()}
                </div>
                <div>
                  <h1 className="text-[20px] font-bold text-slate-900 dark:text-white">{patient.name}</h1>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-blue-50 text-blue-700 px-2.5 py-1 text-xs font-medium">
                      {patient.age != null ? `${patient.age} ${t("common.age")}` : "—"}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${severityChip(patient.diagnostic)}`}>
                      {diagnosticLabel(patient.diagnostic, t)}
                    </span>
                    {getStatusChip(
                      getStatus(Math.round(patient.stats?.avg_accuracy ?? 0), patient.stats?.total_sessions ?? 0),
                      t,
                    )}
                    <code className="rounded-full bg-slate-100 text-slate-700 px-2.5 py-1 text-xs font-mono">{patient.alexa_code || "—"}</code>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="text-xs px-[14px] py-[7px]">
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  {t("patientDetail.edit")}
                </Button>
                <Button size="sm" className="text-xs px-[14px] py-[7px]">
                  <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                  {t("patientDetail.assignProgram")}
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="surface-card">
              <CardHeader className="border-b border-slate-200/70 dark:border-slate-700/70">
                <CardTitle className="flex items-center gap-2 text-[13px] font-bold">
                  <span className="h-7 w-7 rounded-md bg-[#EBF5FE] text-[#1a8fe3] inline-flex items-center justify-center"><UserRound className="h-4 w-4" /></span>
                  {t("patientDetail.infoTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0 text-sm">
                <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-[12px] text-muted-foreground">{t("patientDetail.age")}</span>
                  <span className="text-[12px] font-semibold">
                    {patient.age != null ? `${patient.age} ${t("common.age")}` : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-[12px] text-muted-foreground">{t("patientDetail.adhdLevel")}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${severityChip(patient.diagnostic)}`}>
                    {patient.diagnostic ? diagnosticLabel(patient.diagnostic, t) : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-[12px] text-muted-foreground">{t("patientDetail.childCode")}</span>
                  <code className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[12px] font-mono">{patient.alexa_code || "—"}</code>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-[12px] text-muted-foreground">{t("patientDetail.created")}</span>
                  <span className="text-[12px] font-semibold">{formatDateTime(patient.created_at, locale)}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="surface-card">
              <CardHeader className="border-b border-slate-200/70 dark:border-slate-700/70">
                <CardTitle className="flex items-center gap-2 text-[13px] font-bold">
                  <span className="h-7 w-7 rounded-md bg-[#EBF5FE] text-[#1a8fe3] inline-flex items-center justify-center"><Wand2 className="h-4 w-4" /></span>
                  {t("patientDetail.programTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {assignBlocked ? (
                  <AdminIssuesStrip variant="danger" icon={<Lock className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden />}>
                    {t("patientDetail.subscriptionAssignBlocked")}
                  </AdminIssuesStrip>
                ) : null}
                <Select
                  value={selectedProgramValue}
                  onValueChange={setSelectedProgramValue}
                  disabled={assigningProgram}
                >
                  <SelectTrigger className="bg-[#f9fafb] border-slate-300">
                    <SelectValue placeholder={t("patientDetail.programPh")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("patientDetail.programNone")}</SelectItem>
                    {programs.map((program) => (
                      <SelectItem key={program.id} value={String(program.id)}>
                        {program.name} ({program.question_count} {t("common.questions")})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="inline-flex items-start gap-2 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 mt-0.5" />
                  <span>{t("patientDetail.programHint")}</span>
                </div>
                <Button
                  className="w-full"
                  onClick={handleAssignProgram}
                  disabled={assigningProgram || (assignBlocked && assignWouldSetNewProgram)}
                >
                  <Wand2 className="h-4 w-4 mr-2" />
                  {assigningProgram ? t("patientDetail.assigning") : t("patientDetail.assignBtn")}
                </Button>

                {patient.assigned_program ? (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                    <p className="font-medium">{patient.assigned_program.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("patientDetail.programMeta")
                        .replace("{status}", programStatusLabel(patient.assigned_program.status, t))
                        .replace("{n}", String(patient.assigned_program.question_count))}
                    </p>
                  </div>
                ) : (
                  <p className="text-muted-foreground">{t("patientDetail.noProgramHint")}</p>
                )}
              </CardContent>
            </Card>

            <Card className="surface-card">
              <CardHeader className="border-b border-slate-200/70 dark:border-slate-700/70">
                <CardTitle className="flex items-center gap-2 text-[13px] font-bold">
                  <span className="h-7 w-7 rounded-md bg-[#EBF5FE] text-[#1a8fe3] inline-flex items-center justify-center"><Users className="h-4 w-4" /></span>
                  {t("patientDetail.parentTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <div className="h-[34px] w-[34px] rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs font-semibold">
                    {initials(patient.parent?.full_name || t("common.parent"))}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {patient.parent?.full_name || t("common.parent")}
                    </p>
                    <p className="text-xs text-muted-foreground">{t("patientDetail.parentLinked")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{patient.parent?.email || t("patientDetail.noParentEmail")}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  {patient.parent?.phone ? (
                    <span>{patient.parent.phone}</span>
                  ) : (
                    <span className="italic text-slate-400">{t("patientDetail.noPhone")}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 sm:gap-6 md:grid-cols-3">
            <Card className="surface-card">
              <CardHeader className="pb-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
                  <Activity className="h-3.5 w-3.5" /> {t("patientDetail.kpiSessions")}
                </p>
              </CardHeader>
              <CardContent>
                <p className={`text-3xl font-bold ${(patient.stats?.total_sessions ?? 0) === 0 ? "text-[#d1d5db]" : "text-slate-900 dark:text-white"}`}>
                  {patient.stats?.total_sessions ?? 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t("patientDetail.kpiSessionsHint")}</p>
              </CardContent>
            </Card>
            <Card className="surface-card">
              <CardHeader className="pb-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
                  <Gauge className="h-3.5 w-3.5" /> {t("patientDetail.kpiAccuracy")}
                </p>
              </CardHeader>
              <CardContent>
                {(() => {
                  const avg = Math.round(patient.stats?.avg_accuracy ?? 0)
                  const barColor = avg >= 70 ? "bg-emerald-500" : avg >= 30 ? "bg-amber-500" : "bg-red-500"
                  return (
                    <>
                      <p className={`text-3xl font-bold ${avg === 0 ? "text-[#d1d5db]" : "text-slate-900 dark:text-white"}`}>{avg}%</p>
                      <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                        <div className={`h-full ${barColor}`} style={{ width: `${avg}%` }} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{t("patientDetail.kpiAccuracyHint")}</p>
                    </>
                  )
                })()}
              </CardContent>
            </Card>
            <Card className="surface-card">
              <CardHeader className="pb-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
                  <Clock3 className="h-3.5 w-3.5" /> {t("patientDetail.kpiLast")}
                </p>
              </CardHeader>
              <CardContent>
                {patient.last_session ? (
                  <>
                    <p className="text-3xl font-bold text-slate-900 dark:text-white">
                      {patient.last_session.score}/{patient.last_session.total_questions}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDateTime(patient.last_session?.created_at, locale)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm italic text-muted-foreground">{t("patientDetail.noSessionsYet")}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t("patientDetail.noSessionsHint")}</p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="surface-card">
            <CardHeader className="border-b border-slate-200/70 dark:border-slate-700/70">
              <div className="flex items-center justify-between gap-3">
                <CardTitle>{t("patientDetail.sessionsTitle")}</CardTitle>
                <Button variant="outline" size="sm" className="text-xs" onClick={exportSessionsCsv} disabled={!sessions.length}>
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  {t("patientDetail.exportCsv")}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/80 dark:bg-slate-900/40">
                  <TableRow>
                    <TableHead className="text-[10px] uppercase tracking-wider text-slate-400">
                      {t("patientDetail.csvHeaderDate")}
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-slate-400">
                      {t("patientDetail.csvHeaderScore")}
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-slate-400">
                      {t("patientDetail.csvHeaderTotal")}
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-slate-400">
                      {t("patientDetail.csvHeaderAccuracy")}
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-slate-400">
                      {t("patientDetail.csvHeaderDuration")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-40">
                        <div className="flex flex-col items-center justify-center text-center">
                          <CalendarDays className="h-7 w-7 text-slate-400 mb-2" />
                          <p className="text-[12px] text-muted-foreground">{t("patientDetail.sessionsEmpty")}</p>
                          <p className="text-[11px] text-slate-400">{t("patientDetail.sessionsEmptyHint")}</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    sessions.map((session) => (
                      <TableRow key={session.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50">
                        <TableCell>{formatDateTime(session.created_at, locale)}</TableCell>
                        <TableCell>
                          <span
                            className={[
                              "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                              session.accuracy_pct >= 70
                                ? "bg-emerald-100 text-emerald-700"
                                : session.accuracy_pct >= 30
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-red-100 text-red-700",
                            ].join(" ")}
                          >
                            {session.score}/{session.total_questions}
                          </span>
                        </TableCell>
                        <TableCell>{session.total_questions}</TableCell>
                        <TableCell
                          className={
                            session.accuracy_pct >= 70
                              ? "text-emerald-700"
                              : session.accuracy_pct >= 30
                                ? "text-amber-700"
                                : "text-red-700"
                          }
                        >
                          {session.accuracy_pct}%
                        </TableCell>
                        <TableCell>{Math.max(1, session.total_questions) * 20}s</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

export default function Page() {
  return (
    <AuthGuard requiredAccountType="therapist">
      <PatientDetailsPageContent />
    </AuthGuard>
  )
}
