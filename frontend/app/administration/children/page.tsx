"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AuthGuard } from "@/components/auth-guard"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { fetchApi } from "@/lib/api"
import { toast } from "sonner"
import {
  AdminManagementHeader,
  AdminEntityKpiCard,
  AdminIssuesStrip,
  AdminDirectoryToolbar,
  avatarInitial,
  ClinicalFocusPill,
  severityLevelDisplay,
} from "@/components/admin/admin-entity-pages"
import {
  AlertTriangle,
  ArrowRightLeft,
  Baby,
  CheckCircle2,
  Eye,
  LineChart,
  Stethoscope,
  UserRound,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface AdminChild {
  id: number
  name: string
  age: number | null
  diagnostic: string | null
  alexa_code: string | null
  parent_id: number | null
  specialist_id: number | null
  doctor_name: string
  parent_name: string
  parent_email?: string | null
  sessions_count: number
  avg_accuracy: number
  created_at?: string | null
}

interface OptionItem {
  id: number
  full_name: string | null
  email: string
}

function isOrphanChild(row: AdminChild) {
  return row.parent_name === "—" || row.parent_id == null || !row.parent_email
}

const actionBtn =
  "h-auto min-h-0 gap-1 rounded-md px-2.5 py-[5px] text-[11px] font-semibold leading-tight"

function ChildrenPageContent() {
  const [items, setItems] = useState<AdminChild[]>([])
  const [search, setSearch] = useState("")
  const [parents, setParents] = useState<OptionItem[]>([])
  const [doctors, setDoctors] = useState<OptionItem[]>([])
  const [orphansOnly, setOrphansOnly] = useState(false)
  const [transferRow, setTransferRow] = useState<AdminChild | null>(null)
  const [transferParentId, setTransferParentId] = useState<string>("none")
  const [transferDoctorId, setTransferDoctorId] = useState<string>("")
  const [transferSaving, setTransferSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const data = await fetchApi<AdminChild[]>(`/api/administration/children?q=${encodeURIComponent(search.trim())}`)
      if (!cancelled) setItems(data)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [search])

  useEffect(() => {
    let cancelled = false
    async function loadRefs() {
      const [p, d] = await Promise.all([
        fetchApi<OptionItem[]>("/api/administration/parents"),
        fetchApi<OptionItem[]>("/api/administration/doctors"),
      ])
      if (cancelled) return
      setParents(p)
      setDoctors(d)
    }
    loadRefs()
    return () => {
      cancelled = true
    }
  }, [])

  const sortedItems = useMemo(() => {
    const copy = [...items]
    copy.sort((a, b) => {
      const ao = isOrphanChild(a) ? 1 : 0
      const bo = isOrphanChild(b) ? 1 : 0
      if (bo !== ao) return bo - ao
      return a.name.localeCompare(b.name)
    })
    return copy
  }, [items])

  const filteredItems = useMemo(() => {
    if (!orphansOnly) return sortedItems
    return sortedItems.filter(isOrphanChild)
  }, [sortedItems, orphansOnly])

  const orphanCount = useMemo(() => items.filter(isOrphanChild).length, [items])
  const totalSessions = useMemo(() => items.reduce((s, i) => s + (i.sessions_count || 0), 0), [items])
  const avgSessions = items.length ? Math.round((totalSessions / items.length) * 10) / 10 : 0

  const reload = async () => {
    const data = await fetchApi<AdminChild[]>(`/api/administration/children?q=${encodeURIComponent(search.trim())}`)
    setItems(data)
  }

  const openTransferModal = (row: AdminChild) => {
    setTransferRow(row)
    setTransferParentId(
      row.parent_id != null ? String(row.parent_id) : "none",
    )
    setTransferDoctorId(row.specialist_id != null ? String(row.specialist_id) : "")
  }

  const closeTransferModal = () => {
    setTransferRow(null)
    setTransferParentId("none")
    setTransferDoctorId("")
  }

  const applyTransfer = async () => {
    if (!transferRow || !transferDoctorId) {
      toast.error("Select a doctor")
      return
    }
    const orphan = isOrphanChild(transferRow)
    if (orphan && (transferParentId === "none" || !transferParentId)) {
      toast.error("Select a parent to link this child")
      return
    }

    const body: { parent_id?: number; specialist_id?: number } = {}
    const newDoc = Number(transferDoctorId)
    if (newDoc !== transferRow.specialist_id) {
      body.specialist_id = newDoc
    }

    if (orphan) {
      body.parent_id = Number(transferParentId)
    } else if (transferParentId !== "none") {
      const newP = Number(transferParentId)
      if (newP !== transferRow.parent_id) {
        body.parent_id = newP
      }
    }

    if (Object.keys(body).length === 0) {
      toast.message("No changes to apply")
      return
    }

    setTransferSaving(true)
    try {
      await fetchApi(`/api/administration/children/${transferRow.id}/transfer`, {
        method: "PUT",
        body: JSON.stringify(body),
      })
      toast.success("Assignments updated")
      closeTransferModal()
      await reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transfer failed")
    } finally {
      setTransferSaving(false)
    }
  }

  const th = "text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"

  const currentParentLabel = transferRow
    ? isOrphanChild(transferRow)
      ? "None (orphan)"
      : transferRow.parent_name
    : ""
  const currentDoctorLabel = transferRow?.doctor_name || "—"

  return (
    <div className="mx-auto min-w-0 max-w-7xl space-y-6">
      <AdminManagementHeader
        title="Children Management"
        description="Monitor child ownership, diagnosis, and learning activity."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <AdminEntityKpiCard
          label="Total Children"
          value={items.length}
          subtitle="Profiles registered in the system"
          icon={Baby}
          iconWrapClass="bg-purple-500/10"
          iconClass="text-purple-600 dark:text-purple-400"
          valueClassName="text-purple-700 dark:text-purple-300"
        />
        {orphanCount === 0 ? (
          <AdminEntityKpiCard
            label="Orphan Children"
            value={0}
            subtitle="All children are linked"
            iconWrapClass="bg-emerald-500/15"
            cardClassName="border-emerald-200 bg-[#ecfdf5] dark:border-emerald-800/50 dark:bg-emerald-950/30"
            customIcon={<CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />}
            valueClassName="text-emerald-700 dark:text-emerald-300"
            subtitleClassName="font-medium text-emerald-700 dark:text-emerald-400"
          />
        ) : (
          <AdminEntityKpiCard
            label="Orphan Children"
            value={orphanCount}
            subtitle={`${orphanCount} ${orphanCount === 1 ? "child has" : "children have"} no parent — urgent`}
            iconWrapClass="bg-red-500/10"
            customIcon={<AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden />}
            valueClassName="text-red-600 dark:text-red-400"
            subtitleClassName="font-medium text-red-600 dark:text-red-400"
            borderClassName="border-[#fca5a5] dark:border-red-500/50"
          />
        )}
        <AdminEntityKpiCard
          label="Avg Sessions per Child"
          value={avgSessions}
          subtitle="Mean completed sessions across all children"
          icon={LineChart}
          iconWrapClass="bg-amber-500/10"
          iconClass="text-amber-600 dark:text-amber-400"
          valueClassName="text-amber-800 dark:text-amber-300"
        />
      </div>

      {orphanCount === 0 ? (
        <AdminIssuesStrip
          variant="success"
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />}
        >
          No open child-linking issues — all children are assigned
        </AdminIssuesStrip>
      ) : (
        <AdminIssuesStrip
          variant="danger"
          icon={<AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden />}
        >
          {`${orphanCount} ${orphanCount === 1 ? "child is" : "children are"} unlinked — assign a parent immediately`}
        </AdminIssuesStrip>
      )}

      <Card className="overflow-hidden border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
        <AdminDirectoryToolbar
          title="Children Registry"
          titleIcon={<Baby className="h-5 w-5 shrink-0 text-primary" aria-hidden />}
          searchPlaceholder="Search by child name..."
          search={search}
          onSearchChange={setSearch}
          filterActive={orphansOnly}
          onFilterClick={() => setOrphansOnly((v) => !v)}
        />
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-100 hover:bg-transparent dark:border-slate-800">
                  <TableHead className={th}>Child</TableHead>
                  <TableHead className={th}>Age / Severity</TableHead>
                  <TableHead className={th}>Doctor</TableHead>
                  <TableHead className={th}>Parent</TableHead>
                  <TableHead className={th}>Sessions</TableHead>
                  <TableHead className={th}>Status</TableHead>
                  <TableHead className={cn(th, "text-right")}>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((row) => {
                  const orphan = isOrphanChild(row)
                  const sev = severityLevelDisplay(row.diagnostic)
                  const ageLabel = row.age != null ? `${row.age} yrs` : "—"
                  const noDoctor = !row.doctor_name || row.doctor_name === "—"
                  const sessionsZero = (row.sessions_count || 0) === 0
                  return (
                    <TableRow
                      key={row.id}
                      className={cn(
                        "border-slate-100 transition-colors hover:bg-[#f9fafb] dark:border-slate-800 dark:hover:bg-slate-800/40",
                        orphan && "border-l-[3px] border-l-red-500 bg-red-50/30 dark:bg-red-950/15",
                      )}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-xs font-bold text-purple-800 dark:text-purple-200"
                            aria-hidden
                          >
                            {avatarInitial(row.name, row.name)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-bold text-slate-900 dark:text-white">{row.name}</p>
                            {row.alexa_code ? (
                              <span className="mt-0.5 inline-block rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                                {row.alexa_code}
                              </span>
                            ) : (
                              <span className="mt-0.5 block text-[11px] italic text-slate-400">No Alexa code</span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="text-[13px] font-medium text-slate-900 dark:text-white">{ageLabel}</span>
                          <div className="flex items-center gap-2">
                            <span className={cn("h-2 w-2 shrink-0 rounded-full", sev.dotClass)} aria-hidden />
                            <span className={cn("text-[12px] font-medium", sev.textClass)}>{sev.label}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        {noDoctor ? (
                          <span className="text-[13px] italic text-slate-400 dark:text-slate-500">No doctor</span>
                        ) : (
                          <div className="flex items-center gap-2 min-w-0">
                            <Stethoscope className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
                            <span className="truncate text-[13px] text-slate-800 dark:text-slate-200">
                              {row.doctor_name}
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        {orphan ? (
                          <span className="text-[13px] italic text-red-600 dark:text-red-400">⚠ No parent</span>
                        ) : (
                          <div className="flex items-center gap-2 min-w-0">
                            <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
                            <span className="truncate text-[13px] text-slate-800 dark:text-slate-200">
                              {row.parent_name}
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "text-[13px] font-bold tabular-nums",
                            sessionsZero ? "text-[#d1d5db] dark:text-slate-500" : "text-slate-900 dark:text-white",
                          )}
                        >
                          {row.sessions_count}
                        </span>
                      </TableCell>
                      <TableCell>
                        <ClinicalFocusPill avgAccuracy={row.avg_accuracy} sessionCount={row.sessions_count} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <Button
                            asChild
                            variant="outline"
                            className={cn(
                              actionBtn,
                              "border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/40",
                            )}
                          >
                            <Link href={`/orthophoniste/patient/${row.id}`}>
                              <Eye className="h-3 w-3 shrink-0" />
                              View details
                            </Link>
                          </Button>
                          <Button
                            variant="outline"
                            className={cn(
                              actionBtn,
                              "border-amber-300 text-amber-800 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/30",
                            )}
                            onClick={() => openTransferModal(row)}
                          >
                            <ArrowRightLeft className="h-3 w-3 shrink-0" />
                            Re-assign
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {!filteredItems.length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                      No children found.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={!!transferRow}
        onOpenChange={(o) => {
          if (!o) closeTransferModal()
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{transferRow ? `Re-assign Child: ${transferRow.name}` : "Re-assign Child"}</DialogTitle>
            <DialogDescription>
              Update parent and/or specialist assignments. Changes are logged in Audit Logs.
            </DialogDescription>
          </DialogHeader>

          {transferRow ? (
            <div className="grid gap-5 py-2">
              <div className="grid gap-2">
                <Label className="text-xs text-muted-foreground">Current parent</Label>
                <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/50">
                  {currentParentLabel}
                </p>
                <Label htmlFor="new-parent" className="text-xs font-semibold">
                  New parent
                </Label>
                <Select value={transferParentId} onValueChange={setTransferParentId}>
                  <SelectTrigger id="new-parent" className="w-full">
                    <SelectValue placeholder="Select parent…" />
                  </SelectTrigger>
                  <SelectContent>
                    {isOrphanChild(transferRow) ? (
                      <SelectItem value="none">Select a parent…</SelectItem>
                    ) : null}
                    {parents.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.full_name || p.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label className="text-xs text-muted-foreground">Current doctor</Label>
                <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/50">
                  {currentDoctorLabel}
                </p>
                <Label htmlFor="new-doctor" className="text-xs font-semibold">
                  New doctor
                </Label>
                <Select value={transferDoctorId} onValueChange={setTransferDoctorId}>
                  <SelectTrigger id="new-doctor" className="w-full">
                    <SelectValue placeholder="Select doctor…" />
                  </SelectTrigger>
                  <SelectContent>
                    {doctors.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.full_name || d.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="secondary" className="text-slate-700" onClick={closeTransferModal}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={applyTransfer}
              disabled={transferSaving || !transferDoctorId}
            >
              {transferSaving ? "Applying…" : "Apply Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function ChildrenPage() {
  return (
    <AuthGuard requiredAccountType="administration">
      <ChildrenPageContent />
    </AuthGuard>
  )
}
