"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AuthGuard } from "@/components/auth-guard"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { fetchApi } from "@/lib/api"
import { Baby, Download, Filter, List, Shield, Stethoscope, UserRound } from "lucide-react"
import { cn } from "@/lib/utils"

interface AuditLog {
  id: number
  admin_id: number
  action: string
  target_type: string
  target_id: number | null
  details: Record<string, unknown>
  created_at: string | null
}

type EventCategory = "login" | "create" | "update" | "delete"
type QuickChip = "all" | EventCategory

const ACTION_OPTIONS = [
  { value: "all", label: "All actions" },
  { value: "doctor_status_update", label: "doctor_status_update" },
  { value: "parent_created", label: "parent_created" },
  { value: "child_transfer", label: "child_transfer" },
  { value: "admin_login", label: "admin_login" },
  { value: "password_reset", label: "password_reset" },
] as const

const TARGET_OPTIONS = [
  { value: "all", label: "All target types" },
  { value: "doctor", label: "doctor" },
  { value: "parent", label: "parent" },
  { value: "child", label: "child" },
  { value: "admin", label: "admin" },
] as const

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const

function inferEventCategory(action: string): EventCategory {
  const a = action.toLowerCase()
  if (a.includes("login") || a.includes("signin") || a.endsWith("_auth")) return "login"
  if (a.includes("deleted") || a.includes("delete") || a.includes("remove")) return "delete"
  if (
    a.includes("created") ||
    a.includes("create") ||
    a.includes("register") ||
    a.includes("signup") ||
    a.includes("_add")
  )
    return "create"
  return "update"
}

function categoryStyle(cat: EventCategory): {
  label: string
  badge: string
  dot: string
  border: string
} {
  switch (cat) {
    case "login":
      return {
        label: "Login",
        badge: "bg-blue-100 text-blue-800 ring-blue-200/80 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/30",
        dot: "bg-[#1a8fe3]",
        border: "border-l-[#1a8fe3]",
      }
    case "create":
      return {
        label: "Create",
        badge: "bg-emerald-100 text-emerald-800 ring-emerald-200/80 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
        dot: "bg-[#16a34a]",
        border: "border-l-[#16a34a]",
      }
    case "delete":
      return {
        label: "Delete",
        badge: "bg-red-100 text-red-800 ring-red-200/80 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30",
        dot: "bg-[#dc2626]",
        border: "border-l-[#dc2626]",
      }
    default:
      return {
        label: "Update",
        badge: "bg-amber-100 text-amber-900 ring-amber-200/80 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/30",
        dot: "bg-[#d97706]",
        border: "border-l-[#d97706]",
      }
  }
}

function formatAuditTime(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  const now = new Date()
  const isToday =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  const hm = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  if (isToday) return `Today · ${hm}`
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  return `${dd}/${mm} · ${hm}`
}

function targetIconSquare(targetType: string) {
  const t = targetType.toLowerCase()
  if (t === "doctor")
    return {
      wrap: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
      Icon: Stethoscope,
    }
  if (t === "parent")
    return {
      wrap: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
      Icon: UserRound,
    }
  if (t === "child")
    return {
      wrap: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
      Icon: Baby,
    }
  return {
    wrap: "bg-slate-200/80 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
    Icon: Shield,
  }
}

function targetDisplayLabel(log: AuditLog) {
  const tt = log.target_type || "—"
  const id = log.target_id != null ? `#${log.target_id}` : "—"
  return `${tt} ${id}`
}

function detailsPill(details: Record<string, unknown>, max = 72) {
  const raw = JSON.stringify(details ?? {})
  const truncated = raw.length > max ? `${raw.slice(0, max)}…` : raw
  return { raw, truncated }
}

function escapeCsvCell(s: string) {
  if (s.includes('"') || s.includes(",") || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`
  return s
}

function AuditPageContent() {
  const [baseLogs, setBaseLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [draftAction, setDraftAction] = useState<string>("all")
  const [draftTarget, setDraftTarget] = useState<string>("all")
  const [draftSearch, setDraftSearch] = useState("")
  const [appliedAction, setAppliedAction] = useState<string>("all")
  const [appliedTarget, setAppliedTarget] = useState<string>("all")
  const [appliedSearch, setAppliedSearch] = useState("")
  const [quickChip, setQuickChip] = useState<QuickChip>("all")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(20)

  const loadFromServer = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      qs.set("limit", "200")
      let clientFilter: ((act: string) => boolean) | null = null

      if (appliedAction !== "all") {
        if (appliedAction === "parent_created") {
          clientFilter = (act) => /create|register|signup|parent/i.test(act.toLowerCase())
        } else if (appliedAction === "admin_login") {
          clientFilter = (act) => /login|signin|auth/i.test(act.toLowerCase())
        } else if (appliedAction === "password_reset") {
          clientFilter = (act) => /password_reset|reset-password/i.test(act.toLowerCase())
        } else {
          qs.set("action", appliedAction)
        }
      }
      if (appliedTarget !== "all") {
        qs.set("target_type", appliedTarget)
      }
      if (appliedSearch.trim()) {
        qs.set("q", appliedSearch.trim().toLowerCase())
      }

      const data = await fetchApi<AuditLog[]>(`/api/administration/audit-logs?${qs.toString()}`)
      let rows = data
      if (clientFilter) {
        rows = rows.filter((l) => clientFilter!(l.action))
      }
      setBaseLogs(rows)
      setPage(1)
    } catch {
      setBaseLogs([])
    } finally {
      setLoading(false)
    }
  }, [appliedAction, appliedTarget, appliedSearch])

  useEffect(() => {
    loadFromServer()
  }, [loadFromServer])

  const hasActiveFilters =
    appliedAction !== "all" ||
    appliedTarget !== "all" ||
    appliedSearch.trim() !== "" ||
    quickChip !== "all"

  useEffect(() => {
    if (hasActiveFilters) return
    const t = window.setInterval(() => {
      loadFromServer()
    }, 25000)
    return () => window.clearInterval(t)
  }, [hasActiveFilters, loadFromServer])

  const filteredLogs = useMemo(() => {
    if (quickChip === "all") return baseLogs
    return baseLogs.filter((l) => inferEventCategory(l.action) === quickChip)
  }, [baseLogs, quickChip])

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageSlice = useMemo(() => {
    const p = Math.min(page, totalPages)
    const start = (p - 1) * pageSize
    return filteredLogs.slice(start, start + pageSize)
  }, [filteredLogs, page, pageSize, totalPages])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const applyFilters = () => {
    setAppliedAction(draftAction)
    setAppliedTarget(draftTarget)
    setAppliedSearch(draftSearch)
  }

  const resetFilters = () => {
    setDraftAction("all")
    setDraftTarget("all")
    setDraftSearch("")
    setAppliedAction("all")
    setAppliedTarget("all")
    setAppliedSearch("")
    setQuickChip("all")
    setPage(1)
  }

  const clearFiltersOnly = () => {
    resetFilters()
  }

  const exportCsv = () => {
    const headers = ["Type", "Action", "Target type", "Target id", "Time", "Details"]
    const lines = [
      headers.join(","),
      ...filteredLogs.map((log) => {
        const cat = inferEventCategory(log.action)
        const st = categoryStyle(cat)
        const { raw } = detailsPill(log.details, 99999)
        return [
          escapeCsvCell(st.label),
          escapeCsvCell(log.action),
          escapeCsvCell(log.target_type),
          escapeCsvCell(log.target_id != null ? String(log.target_id) : ""),
          escapeCsvCell(log.created_at || ""),
          escapeCsvCell(raw),
        ].join(",")
      }),
    ]
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const th = "text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"

  const chipDefs: { key: QuickChip; label: string; dotClass: string; activeClass: string }[] = [
    { key: "all", label: "All", dotClass: "bg-slate-400", activeClass: "bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-white" },
    { key: "create", label: "Create", dotClass: "bg-[#16a34a]", activeClass: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100" },
    { key: "login", label: "Login", dotClass: "bg-[#1a8fe3]", activeClass: "bg-blue-100 text-blue-900 dark:bg-blue-950/50 dark:text-blue-100" },
    { key: "update", label: "Update", dotClass: "bg-[#d97706]", activeClass: "bg-amber-100 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100" },
    { key: "delete", label: "Delete", dotClass: "bg-[#dc2626]", activeClass: "bg-red-100 text-red-900 dark:bg-red-950/40 dark:text-red-100" },
  ]

  return (
    <div className="mx-auto min-w-0 max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white md:text-3xl">Audit Logs</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Track all administration actions and security events.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
          onClick={exportCsv}
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>

      <Card className="border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
        <CardHeader className="border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-500" aria-hidden />
            <span className="text-[13px] font-bold text-slate-900 dark:text-white">Filters</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="grid gap-1.5">
              <label className="sr-only" htmlFor="audit-action">
                Action
              </label>
              <Select value={draftAction} onValueChange={setDraftAction}>
                <SelectTrigger id="audit-action" className="h-10 w-full bg-slate-50 dark:bg-slate-800/80">
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <label className="sr-only" htmlFor="audit-target">
                Target type
              </label>
              <Select value={draftTarget} onValueChange={setDraftTarget}>
                <SelectTrigger id="audit-target" className="h-10 w-full bg-slate-50 dark:bg-slate-800/80">
                  <SelectValue placeholder="All target types" />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 lg:col-span-1">
              <Input
                placeholder="Search in details..."
                value={draftSearch}
                onChange={(e) => setDraftSearch(e.target.value)}
                className="h-10 bg-slate-50 dark:bg-slate-800/80"
              />
            </div>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
              <Button type="button" className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90" onClick={applyFilters}>
                Apply
              </Button>
              <Button type="button" variant="outline" className="flex-1 border-slate-200 dark:border-slate-600" onClick={resetFilters}>
                Reset
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            {chipDefs.map((c) => {
              const active = quickChip === c.key
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => {
                    setQuickChip(c.key)
                    setPage(1)
                  }}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border border-transparent px-3 py-1.5 text-[12px] font-semibold transition-colors",
                    active ? c.activeClass : "bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800",
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full", c.dotClass)} aria-hidden />
                  {c.label}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <List className="h-5 w-5 text-slate-600 dark:text-slate-400" aria-hidden />
              <span className="text-base font-semibold text-slate-900 dark:text-white">Log Entries</span>
            </div>
            {!hasActiveFilters ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Live
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                Filtered view
              </span>
            )}
          </div>
          <p className="text-[13px] text-slate-500 dark:text-slate-400">
            Showing {filteredLogs.length} {filteredLogs.length === 1 ? "entry" : "entries"}
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-8 text-center text-sm text-slate-500">Loading…</p>
          ) : !filteredLogs.length ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <List className="h-7 w-7 text-slate-400" aria-hidden />
              <p className="mt-3 text-[13px] text-slate-600 dark:text-slate-400">No audit logs found</p>
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                Try adjusting your filters or check back later.
              </p>
              <button
                type="button"
                className="mt-4 text-[12px] font-medium text-blue-600 hover:underline dark:text-blue-400"
                onClick={clearFiltersOnly}
              >
                Clear filters
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-100 hover:bg-transparent dark:border-slate-800">
                      <TableHead className={th}>Type</TableHead>
                      <TableHead className={th}>Action</TableHead>
                      <TableHead className={th}>Target</TableHead>
                      <TableHead className={th}>Time</TableHead>
                      <TableHead className={th}>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageSlice.map((log) => {
                      const cat = inferEventCategory(log.action)
                      const st = categoryStyle(cat)
                      const { Icon, wrap } = targetIconSquare(log.target_type)
                      const pill = detailsPill(log.details)
                      return (
                        <TableRow
                          key={log.id}
                          className={cn(
                            "border-slate-100 transition-colors hover:bg-[#f9fafb] dark:border-slate-800 dark:hover:bg-slate-800/40",
                            "border-l-[3px]",
                            st.border,
                          )}
                        >
                          <TableCell>
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
                                st.badge,
                              )}
                            >
                              <span className={cn("h-1.5 w-1.5 rounded-full", st.dot)} aria-hidden />
                              {st.label}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="font-mono text-[12px] text-slate-700 dark:text-slate-300">{log.action}</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className={cn(
                                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-md",
                                  wrap,
                                )}
                              >
                                <Icon className="h-3 w-3" aria-hidden />
                              </div>
                              <span className="truncate text-[13px] text-slate-800 dark:text-slate-200" title={targetDisplayLabel(log)}>
                                {targetDisplayLabel(log)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-[13px] text-slate-700 dark:text-slate-300">
                            {formatAuditTime(log.created_at)}
                          </TableCell>
                          <TableCell className="max-w-[220px]">
                            <span
                              className="inline-block max-w-full truncate rounded-md bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                              title={pill.raw}
                            >
                              {pill.truncated}
                            </span>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    ← Previous
                  </Button>
                  <span className="flex items-center gap-2 text-[12px] text-slate-600 dark:text-slate-400">
                    Page{" "}
                    <span className="inline-flex min-w-[2rem] justify-center rounded-full bg-blue-100 px-2 py-0.5 text-[12px] font-bold text-blue-800 dark:bg-blue-950/60 dark:text-blue-200">
                      {safePage}
                    </span>{" "}
                    of {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next →
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Rows per page:</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => {
                      setPageSize(Number(v))
                      setPage(1)
                    }}
                  >
                    <SelectTrigger className="h-8 w-[88px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function AuditPage() {
  return (
    <AuthGuard requiredAccountType="administration">
      <AuditPageContent />
    </AuthGuard>
  )
}
