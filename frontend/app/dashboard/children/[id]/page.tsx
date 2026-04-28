"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { AuthGuard } from "@/components/auth-guard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { fetchApi, getAuthHeaders, publicApiBase } from "@/lib/api"
import { AdminIssuesStrip } from "@/components/admin/admin-entity-pages"
import { usePortalI18n } from "@/lib/i18n/i18n-context"
import type { AppLocale } from "@/lib/i18n/types"
import { Star, KeyRound, BookOpen, Clock, Lock } from "lucide-react"
import { toast } from "sonner"

interface ApiChild {
  id: number
  name: string
  age: number | null
  diagnostic?: string | null
  alexa_code?: string | null
  stats: { total_sessions: number; total_correct: number; total_asked: number; avg_accuracy: number }
  assigned_program?: { id: number; name: string; question_count: number } | null
}

interface ApiSession {
  id: number
  score: number
  total_questions: number
  accuracy_pct: number
  created_at: string | null
}

interface LibraryProgramOption {
  id: number
  name: string
  status: string
}

interface ParentMeSubscription {
  billing_exempt: boolean
  library_frozen: boolean
  in_grace_period: boolean
  new_program_assign_blocked: boolean
}

interface ParentMeProfile {
  subscription?: ParentMeSubscription
}

function normalizeChild(payload: ApiChild | null | undefined): ApiChild | null {
  if (!payload) return null
  return {
    ...payload,
    stats: {
      total_sessions: payload.stats?.total_sessions ?? 0,
      total_correct: payload.stats?.total_correct ?? 0,
      total_asked: payload.stats?.total_asked ?? 0,
      avg_accuracy: payload.stats?.avg_accuracy ?? 0,
    },
  }
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

function statusFrom(stats: ApiChild["stats"], t: (key: string) => string) {
  if (!stats.total_sessions || stats.avg_accuracy < 30)
    return { label: t("status.needsAttention"), cls: "bg-red-100 text-red-700" }
  if (stats.avg_accuracy < 70) return { label: t("status.monitor"), cls: "bg-amber-100 text-amber-700" }
  return { label: t("status.onTrack"), cls: "bg-emerald-100 text-emerald-700" }
}

function diagnosticLabel(diagnostic: string | null | undefined, t: (key: string) => string) {
  const d = (diagnostic || "").trim()
  if (!d) return t("common.noLevel")
  if (/severe/i.test(d)) return t("common.severitySevere")
  if (/moderate/i.test(d)) return t("common.severityModerate")
  if (/mild/i.test(d)) return t("common.severityMild")
  return d
}

function ChildDetailsContent() {
  const { t, locale } = usePortalI18n()
  const params = useParams<{ id: string }>()
  const childId = params?.id
  const [child, setChild] = useState<ApiChild | null>(null)
  const [sessions, setSessions] = useState<ApiSession[]>([])
  const [tab, setTab] = useState("overview")
  const [loading, setLoading] = useState(true)
  const [isStandalone, setIsStandalone] = useState(false)
  const [libraryPrograms, setLibraryPrograms] = useState<LibraryProgramOption[]>([])
  const [assignSelect, setAssignSelect] = useState<string>("")
  const [assigning, setAssigning] = useState(false)
  const [meProfile, setMeProfile] = useState<ParentMeProfile | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem("adhdAssistCurrentUser")
      if (!raw) return
      const u = JSON.parse(raw) as { account_kind?: string }
      setIsStandalone(u.account_kind === "standalone")
    } catch {
      //
    }
  }, [])

  useEffect(() => {
    if (!isStandalone) return
    let cancelled = false
    fetchApi<ParentMeProfile>("/api/parents/me")
      .then((me) => {
        if (!cancelled) setMeProfile(me)
      })
      .catch(() => {
        //
      })
    return () => {
      cancelled = true
    }
  }, [isStandalone])

  useEffect(() => {
    if (!childId) return
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [childRes, sessionsRes] = await Promise.all([
          fetch(`${publicApiBase}/api/parents/children/${childId}`, { headers: getAuthHeaders() }),
          fetch(`${publicApiBase}/api/parents/children/${childId}/sessions?limit=30`, { headers: getAuthHeaders() }),
        ])
        if (cancelled) return
        if (childRes.ok) {
          const c = (await childRes.json()) as ApiChild
          setChild(normalizeChild(c))
        }
        if (sessionsRes.ok) setSessions(await sessionsRes.json())
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [childId])

  useEffect(() => {
    if (!isStandalone || !childId) return
    let cancelled = false
    async function loadLib() {
      try {
        const res = await fetch(`${publicApiBase}/api/parents/library`, { headers: getAuthHeaders() })
        if (!res.ok || cancelled) return
        const data = (await res.json()) as LibraryProgramOption[]
        setLibraryPrograms((data || []).filter((p) => p.status === "ready"))
      } catch {
        //
      }
    }
    loadLib()
    return () => {
      cancelled = true
    }
  }, [isStandalone, childId])

  useEffect(() => {
    if (!child?.assigned_program?.id) {
      setAssignSelect("")
      return
    }
    setAssignSelect(String(child.assigned_program.id))
  }, [child?.assigned_program?.id])

  const status = useMemo(
    () =>
      statusFrom(child?.stats || { total_sessions: 0, avg_accuracy: 0, total_correct: 0, total_asked: 0 }, t),
    [child, t],
  )

  const assignBlocked =
    !!(meProfile?.subscription?.new_program_assign_blocked && !meProfile?.subscription?.billing_exempt)

  const assignWouldSetNewProgram = useMemo(() => {
    if (!child) return false
    const cur = child.assigned_program?.id ?? null
    const sel = assignSelect === "" ? null : Number(assignSelect)
    if (sel === null) return false
    if (cur === sel) return false
    return true
  }, [child, assignSelect])

  const programOptions = useMemo(() => {
    const list = [...libraryPrograms]
    if (child?.assigned_program?.id && !list.some((p) => p.id === child.assigned_program!.id)) {
      list.push({
        id: child.assigned_program.id,
        name: child.assigned_program.name,
        status: "ready",
      })
    }
    return list
  }, [libraryPrograms, child?.assigned_program])

  const stars = child?.stats?.total_correct ?? 0
  const goalTarget = 50
  const goalProgress = Math.min(100, Math.round((stars / goalTarget) * 100))

  const handleAssignProgram = async () => {
    if (!childId) return
    if (assignBlocked && assignWouldSetNewProgram) {
      toast.error(t("childDetail.subscriptionAssignBlocked"))
      return
    }
    setAssigning(true)
    try {
      const training_program_id = assignSelect === "" ? null : Number(assignSelect)
      const res = await fetch(`${publicApiBase}/api/parents/children/${childId}/assign-program`, {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ training_program_id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error || "assign failed")
      setChild(normalizeChild(data as ApiChild))
      toast.success(t("childDetail.assignSuccess"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "assign failed")
    } finally {
      setAssigning(false)
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">{t("childDetail.loading")}</p>
  if (!child) return <p className="text-sm text-muted-foreground">{t("childDetail.notFound")}</p>

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <Card className="surface-card">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{child.name}</h1>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="outline">
                  {child.age != null ? `${child.age} ${t("common.age")}` : "—"}
                </Badge>
                <Badge variant="outline">{diagnosticLabel(child.diagnostic, t)}</Badge>
                <Badge className={status.cls}>{status.label}</Badge>
                <code className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {child.alexa_code || "—"}
                </code>
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/reports">{t("childDetail.fullReports")}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">{t("childDetail.tabOverview")}</TabsTrigger>
          <TabsTrigger value="sessions">{t("childDetail.tabSessions")}</TabsTrigger>
          <TabsTrigger value="rewards">{t("childDetail.tabRewards")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "overview" ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="surface-card">
            <CardHeader>
              <CardTitle className="text-sm">{t("childDetail.programTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="inline-flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <BookOpen className="h-3.5 w-3.5" /> {t("childDetail.programCurrent")}
              </div>
              <p className="font-semibold">{child.assigned_program?.name || t("childDetail.programMissing")}</p>
            </CardContent>
          </Card>
          <Card className="surface-card">
            <CardHeader>
              <CardTitle className="text-sm">{t("childDetail.codeTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="inline-flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <KeyRound className="h-3.5 w-3.5" /> {t("childDetail.codeHint")}
              </div>
              <code className="rounded bg-slate-100 px-2 py-1 font-mono dark:bg-slate-800">{child.alexa_code || "—"}</code>
            </CardContent>
          </Card>
          <Card className="surface-card">
            <CardHeader>
              <CardTitle className="text-sm">{t("childDetail.performanceTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="text-sm text-muted-foreground">{t("childDetail.avgAccuracy")}</p>
              <p className="text-2xl font-bold">{Math.round(child.stats.avg_accuracy || 0)}%</p>
              <p className="text-xs text-muted-foreground">
                {t("childDetail.sessionsDone").replace("{n}", String(child.stats.total_sessions))}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "overview" && isStandalone ? (
        <Card className="surface-card">
          <CardHeader>
            <CardTitle className="text-sm">{t("childDetail.assignTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {assignBlocked ? (
              <AdminIssuesStrip variant="danger" icon={<Lock className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden />}>
                {t("childDetail.subscriptionAssignBlocked")}
              </AdminIssuesStrip>
            ) : null}
            <p className="text-xs text-muted-foreground">{t("childDetail.assignHint")}</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 min-w-0">
                <Select value={assignSelect || "__none__"} onValueChange={(v) => setAssignSelect(v === "__none__" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("childDetail.assignSelectPh")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("childDetail.assignClear")}</SelectItem>
                    {programOptions.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                onClick={() => void handleAssignProgram()}
                disabled={assigning || (assignBlocked && assignWouldSetNewProgram)}
                className="shrink-0"
              >
                {assigning ? t("childDetail.assignSubmitting") : t("childDetail.assignBtn")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === "sessions" ? (
        <Card className="surface-card">
          <CardHeader>
            <CardTitle>{t("childDetail.lastSessionsTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("childDetail.colDate")}</TableHead>
                  <TableHead>{t("childDetail.colScore")}</TableHead>
                  <TableHead>{t("childDetail.colQuestions")}</TableHead>
                  <TableHead>{t("childDetail.colAccuracy")}</TableHead>
                  <TableHead>{t("childDetail.colDuration")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      {t("childDetail.tableEmpty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  sessions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{formatDateTime(s.created_at, locale)}</TableCell>
                      <TableCell>
                        {s.score}/{s.total_questions}
                      </TableCell>
                      <TableCell>{s.total_questions}</TableCell>
                      <TableCell>{s.accuracy_pct}%</TableCell>
                      <TableCell>{Math.max(1, s.total_questions) * 20}s</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {tab === "rewards" ? (
        <Card className="surface-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-500" /> {t("childDetail.rewardsTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("childDetail.goalLine")}</p>
            <p className="text-2xl font-bold">
              {stars}/{goalTarget}
            </p>
            <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-500"
                style={{ width: `${goalProgress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {goalProgress >= 100
                ? t("childDetail.goalDone")
                : t("childDetail.goalLeft").replace("{n}", String(goalTarget - stars))}
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

export default function ChildDetailsPage() {
  return (
    <AuthGuard requiredAccountType="parent">
      <ChildDetailsContent />
    </AuthGuard>
  )
}
