"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AuthGuard } from "@/components/auth-guard"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fetchApi } from "@/lib/api"
import { toast } from "sonner"
import {
  AdminManagementHeader,
  AdminEntityKpiCard,
  AdminIssuesStrip,
  AdminDirectoryToolbar,
  StatusPill,
  entityStatusFromAccount,
  avatarInitial,
  formatJoinedDate,
} from "@/components/admin/admin-entity-pages"
import {
  AlertTriangle,
  BarChart3,
  Lock,
  Plus,
  ShieldCheck,
  Stethoscope,
  Users,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface AdminDoctor {
  id: number
  email: string
  full_name: string | null
  phone: string | null
  created_at: string | null
  patients_count: number
  is_active: boolean
}

function DoctorsPageContent() {
  const [items, setItems] = useState<AdminDoctor[]>([])
  const [search, setSearch] = useState("")
  const [inactiveOnly, setInactiveOnly] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const data = await fetchApi<AdminDoctor[]>(`/api/administration/doctors?q=${encodeURIComponent(search.trim())}`)
      if (!cancelled) setItems(data)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [search])

  const reload = async () => {
    const data = await fetchApi<AdminDoctor[]>(`/api/administration/doctors?q=${encodeURIComponent(search.trim())}`)
    setItems(data)
  }

  const totalPatients = useMemo(() => items.reduce((sum, i) => sum + (i.patients_count || 0), 0), [items])
  const disabledCount = useMemo(() => items.filter((i) => !i.is_active).length, [items])
  const avgPerDoctor = items.length ? Math.round(totalPatients / items.length) : 0

  const filteredItems = useMemo(() => {
    if (!inactiveOnly) return items
    return items.filter((i) => !i.is_active)
  }, [items, inactiveOnly])

  const toggleStatus = async (doctor: AdminDoctor) => {
    const ok = window.confirm(
      `${doctor.is_active ? "Disable" : "Enable"} this doctor account?\n\nThis action will be logged in Audit Logs.`,
    )
    if (!ok) return
    try {
      await fetchApi(`/api/administration/doctors/${doctor.id}/status`, {
        method: "PUT",
        body: JSON.stringify({ is_active: !doctor.is_active }),
      })
      toast.success(`Doctor ${!doctor.is_active ? "enabled" : "disabled"} successfully. Check Audit Logs.`)
      await reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update doctor status")
    }
  }

  const resetPassword = async (doctor: AdminDoctor) => {
    const ok = window.confirm(
      "Generate a temporary password for this doctor?\n\nThis action will be logged in Audit Logs.",
    )
    if (!ok) return
    try {
      const res = await fetchApi<{ temporary_password: string }>(
        `/api/administration/doctors/${doctor.id}/reset-password`,
        { method: "POST" },
      )
      await navigator.clipboard.writeText(res.temporary_password)
      toast.success("Temporary password copied to clipboard. Check Audit Logs.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reset password")
    }
  }

  const th = "text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"

  return (
    <div className="mx-auto min-w-0 max-w-7xl space-y-6">
      <AdminManagementHeader
        title="Doctors Management"
        description="Review doctor accounts and assigned patient load."
        action={
          <Button asChild className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
            <Link href="/register?role=specialist" target="_blank" rel="noopener noreferrer">
              <Plus className="h-4 w-4" />
              Add Doctor
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <AdminEntityKpiCard
          label="Total Doctors"
          value={items.length}
          subtitle="Registered specialists on the platform"
          iconWrapClass="bg-blue-500/10"
          customIcon={
            <span className="flex items-center justify-center gap-px text-blue-600 dark:text-blue-400" aria-hidden>
              <Stethoscope className="h-3.5 w-3.5" />
              <Plus className="h-3 w-3" strokeWidth={2.5} />
            </span>
          }
        />
        <AdminEntityKpiCard
          label="Total Assigned Children"
          value={totalPatients}
          subtitle="Children linked to specialists"
          icon={Users}
          iconWrapClass="bg-teal-500/10"
          iconClass="text-teal-600 dark:text-teal-400"
        />
        <AdminEntityKpiCard
          label="Average Children per Doctor"
          value={avgPerDoctor}
          subtitle="Mean patient load per specialist"
          icon={BarChart3}
          iconWrapClass="bg-purple-500/10"
          iconClass="text-purple-600 dark:text-purple-400"
        />
      </div>

      {disabledCount === 0 ? (
        <AdminIssuesStrip
          variant="success"
          icon={<ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />}
        >
          No open doctor account issues — all accounts are healthy
        </AdminIssuesStrip>
      ) : (
        <AdminIssuesStrip
          variant="warning"
          icon={<AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />}
        >
          {disabledCount} doctor account{disabledCount === 1 ? "" : "s"} have open issues — review below
        </AdminIssuesStrip>
      )}

      <Card className="overflow-hidden border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
        <AdminDirectoryToolbar
          title="Doctors Directory"
          titleIcon={<Stethoscope className="h-5 w-5 shrink-0 text-primary" aria-hidden />}
          searchPlaceholder="Search by name or email..."
          search={search}
          onSearchChange={setSearch}
          filterActive={inactiveOnly}
          onFilterClick={() => setInactiveOnly((v) => !v)}
        />
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-100 hover:bg-transparent dark:border-slate-800">
                  <TableHead className={th}>Doctor</TableHead>
                  <TableHead className={th}>Email</TableHead>
                  <TableHead className={th}>Phone</TableHead>
                  <TableHead className={th}>Patients</TableHead>
                  <TableHead className={th}>Status</TableHead>
                  <TableHead className={cn(th, "text-right")}>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((row) => {
                  const status = entityStatusFromAccount(row.is_active, row.patients_count, row.created_at)
                  const name = row.full_name || row.email
                  return (
                    <TableRow
                      key={row.id}
                      className="border-slate-100 transition-colors hover:bg-[#f9fafb] dark:border-slate-800 dark:hover:bg-slate-800/40"
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary"
                            aria-hidden
                          >
                            {avatarInitial(row.full_name, row.email)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-bold text-slate-900 dark:text-white">{name}</p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              Joined {formatJoinedDate(row.created_at)}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <a
                          href={`mailto:${row.email}`}
                          className="text-[13px] font-medium text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {row.email}
                        </a>
                      </TableCell>
                      <TableCell>
                        {row.phone ? (
                          <span className="text-[13px] text-slate-700 dark:text-slate-300">{row.phone}</span>
                        ) : (
                          <span className="text-[13px] italic text-slate-400 dark:text-slate-500">No phone</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-[13px] font-bold tabular-nums text-slate-900 dark:text-white">
                          {row.patients_count}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusPill kind={status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {row.is_active ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1 border-amber-300 bg-transparent text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/30"
                              onClick={() => toggleStatus(row)}
                            >
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Disable
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1 border-emerald-400 bg-transparent text-emerald-700 hover:bg-emerald-50 dark:border-emerald-600 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                              onClick={() => toggleStatus(row)}
                            >
                              Enable
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1 border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                            onClick={() => resetPassword(row)}
                          >
                            <Lock className="h-3.5 w-3.5" />
                            Reset pwd
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {!filteredItems.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">
                      No doctors found.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function DoctorsPage() {
  return (
    <AuthGuard requiredAccountType="administration">
      <DoctorsPageContent />
    </AuthGuard>
  )
}
