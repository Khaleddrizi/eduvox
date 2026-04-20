"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
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
import { AlertTriangle, Baby, CheckCircle2, CreditCard, Lock, Plus, ShieldCheck, UserRound, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { usePortalI18n } from "@/lib/i18n/i18n-context"
import {
  AdminSubscriptionDialog,
  subscriptionPillLabel,
  type AdminSubscriptionRow,
} from "@/components/admin/admin-subscription-dialog"

type ParentAccountTab = "standalone" | "linked"

type AdminParent = AdminSubscriptionRow & {
  email: string
  full_name: string | null
  phone: string | null
  created_at: string | null
  children_count: number
  is_active: boolean
  account_kind?: string
}

interface ChildRef {
  id: number
  name: string
  parent_id: number | null
}

const actionBtn =
  "h-auto min-h-0 gap-1 rounded-md px-2.5 py-[5px] text-[11px] font-semibold leading-tight"

function ParentsPageInner() {
  const { t, locale } = usePortalI18n()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const accountTab: ParentAccountTab = searchParams.get("account_kind") === "linked" ? "linked" : "standalone"

  const navigateAccountTab = useCallback(
    (next: ParentAccountTab) => {
      const qs = new URLSearchParams(searchParams.toString())
      qs.set("account_kind", next)
      router.replace(`${pathname}?${qs.toString()}`, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  const [items, setItems] = useState<AdminParent[]>([])
  const [allChildren, setAllChildren] = useState<ChildRef[]>([])
  const [search, setSearch] = useState("")
  const [inactiveOnly, setInactiveOnly] = useState(false)
  const [subDialogOpen, setSubDialogOpen] = useState(false)
  const [subRow, setSubRow] = useState<AdminParent | null>(null)

  const loadChildren = useCallback(async () => {
    try {
      const data = await fetchApi<ChildRef[]>("/api/administration/children?q=")
      setAllChildren(data.map((c) => ({ id: c.id, name: c.name, parent_id: c.parent_id ?? null })))
    } catch {
      setAllChildren([])
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const qs = new URLSearchParams()
      qs.set("q", search.trim())
      qs.set("account_kind", accountTab)
      const data = await fetchApi<AdminParent[]>(`/api/administration/parents?${qs.toString()}`)
      if (!cancelled) setItems(data)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [search, accountTab])

  useEffect(() => {
    loadChildren()
  }, [loadChildren])

  const reload = async () => {
    const qs = new URLSearchParams()
    qs.set("q", search.trim())
    qs.set("account_kind", accountTab)
    const data = await fetchApi<AdminParent[]>(`/api/administration/parents?${qs.toString()}`)
    setItems(data)
    await loadChildren()
  }

  const namesByParentId = useMemo(() => {
    const m = new Map<number, string[]>()
    for (const c of allChildren) {
      if (c.parent_id != null) {
        const list = m.get(c.parent_id) || []
        list.push(c.name)
        m.set(c.parent_id, list)
      }
    }
    return m
  }, [allChildren])

  const linkedChildrenTotal = useMemo(() => items.reduce((s, i) => s + (i.children_count || 0), 0), [items])
  const unlinkedParentsCount = useMemo(() => items.filter((i) => (i.children_count || 0) === 0).length, [items])
  const disabledCount = useMemo(() => items.filter((i) => !i.is_active).length, [items])

  const filteredItems = useMemo(() => {
    if (!inactiveOnly) return items
    return items.filter((i) => !i.is_active)
  }, [items, inactiveOnly])

  const displayParents = useMemo(() => {
    const list = [...filteredItems]
    list.sort((a, b) => {
      const az = (a.children_count || 0) === 0 ? 1 : 0
      const bz = (b.children_count || 0) === 0 ? 1 : 0
      if (bz !== az) return bz - az
      return (a.full_name || a.email).localeCompare(b.full_name || b.email)
    })
    return list
  }, [filteredItems])

  const toggleStatus = async (row: AdminParent) => {
    const ok = window.confirm(row.is_active ? t("parents.confirmDisable") : t("parents.confirmEnable"))
    if (!ok) return
    try {
      await fetchApi(`/api/administration/parents/${row.id}/status`, {
        method: "PUT",
        body: JSON.stringify({ is_active: !row.is_active }),
      })
      toast.success(t("parents.toastStatusOk"))
      await reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("parents.toastStatusErr"))
    }
  }

  const openSubscription = (row: AdminParent) => {
    setSubRow(row)
    setSubDialogOpen(true)
  }

  const mergeSubscription = (next: AdminSubscriptionRow) => {
    setItems((prev) =>
      prev.map((p) =>
        p.id === next.id
          ? {
              ...p,
              subscription_paid_until: next.subscription_paid_until,
              subscription_grace_days: next.subscription_grace_days,
              subscription_billing_exempt: next.subscription_billing_exempt,
              subscription: next.subscription,
            }
          : p,
      ),
    )
    setSubRow((cur) =>
      cur && cur.id === next.id
        ? {
            ...cur,
            subscription_paid_until: next.subscription_paid_until,
            subscription_grace_days: next.subscription_grace_days,
            subscription_billing_exempt: next.subscription_billing_exempt,
            subscription: next.subscription,
          }
        : cur,
    )
  }

  const resetPassword = async (row: AdminParent) => {
    const ok = window.confirm(t("parents.confirmResetPw"))
    if (!ok) return
    try {
      const res = await fetchApi<{ temporary_password: string }>(
        `/api/administration/parents/${row.id}/reset-password`,
        { method: "POST" },
      )
      await navigator.clipboard.writeText(res.temporary_password)
      toast.success(t("parents.toastPwCopied"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("parents.toastPwErr"))
    }
  }

  const th = "text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"

  return (
    <div className="mx-auto min-w-0 max-w-7xl space-y-6">
      <AdminManagementHeader
        title={t("parents.title")}
        description={accountTab === "standalone" ? t("parents.descriptionStandalone") : t("parents.descriptionLinked")}
        action={
          accountTab === "standalone" ? (
            <Button asChild className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
              <Link href="/register?role=parent" target="_blank" rel="noopener noreferrer">
                <Plus className="h-4 w-4" />
                {t("parents.addCta")}
              </Link>
            </Button>
          ) : null
        }
      />

      <div
        className="inline-flex h-10 w-full max-w-md items-center justify-center rounded-lg bg-muted/80 p-1 text-muted-foreground sm:w-auto"
        role="tablist"
        aria-label={t("parents.title")}
      >
        <button
          type="button"
          role="tab"
          aria-selected={accountTab === "standalone"}
          className={cn(
            "inline-flex flex-1 items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-all sm:flex-none",
            accountTab === "standalone"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => navigateAccountTab("standalone")}
        >
          {t("parents.tabStandalone")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={accountTab === "linked"}
          className={cn(
            "inline-flex flex-1 items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-all sm:flex-none",
            accountTab === "linked"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => navigateAccountTab("linked")}
        >
          {t("parents.tabLinked")}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <AdminEntityKpiCard
          label={t("parents.kpiTotal")}
          value={items.length}
          subtitle={`${t("parents.kpiTotalSub")} · ${t("parents.kpiInTab")}`}
          icon={UserRound}
          iconWrapClass="bg-teal-500/10"
          iconClass="text-teal-600 dark:text-teal-400"
          valueClassName="text-teal-700 dark:text-teal-300"
        />
        <AdminEntityKpiCard
          label={t("parents.kpiLinked")}
          value={linkedChildrenTotal}
          subtitle={t("parents.kpiLinkedSub")}
          icon={Baby}
          iconWrapClass="bg-blue-500/10"
          iconClass="text-blue-600 dark:text-blue-400"
          valueClassName="text-blue-700 dark:text-blue-300"
        />
        {unlinkedParentsCount === 0 ? (
          <AdminEntityKpiCard
            label={t("parents.kpiUnlinkedOk")}
            value={0}
            subtitle={t("parents.kpiUnlinkedOkSub")}
            iconWrapClass="bg-emerald-500/10"
            customIcon={<CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />}
            valueClassName="text-emerald-600 dark:text-emerald-400"
            subtitleClassName="text-emerald-600 dark:text-emerald-400"
          />
        ) : (
          <AdminEntityKpiCard
            label={t("parents.kpiUnlinkedOk")}
            value={unlinkedParentsCount}
            subtitle={
              unlinkedParentsCount === 1
                ? t("parents.kpiUnlinkedBadOne")
                : t("parents.kpiUnlinkedBadMany").replace("{count}", String(unlinkedParentsCount))
            }
            iconWrapClass="bg-red-500/10"
            customIcon={<AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden />}
            valueClassName="text-red-600 dark:text-red-400"
            subtitleClassName="font-medium text-red-600 dark:text-red-400"
            borderClassName="border-[#fca5a5] dark:border-red-500/50"
          />
        )}
      </div>

      {disabledCount === 0 ? (
        <AdminIssuesStrip
          variant="success"
          icon={<ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />}
        >
          {t("parents.stripOk")}
        </AdminIssuesStrip>
      ) : (
        <AdminIssuesStrip
          variant="warning"
          icon={<AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />}
        >
          {disabledCount === 1
            ? t("parents.stripWarnOne")
            : t("parents.stripWarnMany").replace("{count}", String(disabledCount))}
        </AdminIssuesStrip>
      )}

      <Card className="overflow-hidden border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
        <AdminDirectoryToolbar
          title={t("parents.directoryTitle")}
          titleIcon={<Users className="h-5 w-5 shrink-0 text-primary" aria-hidden />}
          searchPlaceholder={t("parents.searchPh")}
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
                  <TableHead className={th}>{t("parents.colParent")}</TableHead>
                  <TableHead className={th}>{t("parents.colEmail")}</TableHead>
                  <TableHead className={th}>{t("parents.colPhone")}</TableHead>
                  <TableHead className={th}>{t("parents.colChildren")}</TableHead>
                  <TableHead className={th}>{t("parents.colStatus")}</TableHead>
                  <TableHead className={th}>{t("subscription.colShort")}</TableHead>
                  <TableHead className={cn(th, "text-right")}>{t("parents.colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayParents.map((row) => {
                  const status = entityStatusFromAccount(row.is_active, row.children_count, row.created_at)
                  const name = row.full_name || row.email
                  const childNames = namesByParentId.get(row.id) || []
                  const noKids = (row.children_count || 0) === 0
                  return (
                    <TableRow
                      key={row.id}
                      className={cn(
                        "border-slate-100 transition-colors hover:bg-[#f9fafb] dark:border-slate-800 dark:hover:bg-slate-800/40",
                        noKids && "border-l-[3px] border-l-red-500 bg-red-50/25 dark:bg-red-950/15",
                      )}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-xs font-bold text-teal-800 dark:text-teal-200"
                            aria-hidden
                          >
                            {avatarInitial(row.full_name, row.email)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-bold text-slate-900 dark:text-white">{name}</p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {t("entity.joinedPrefix")}
                              {formatJoinedDate(row.created_at, locale, t("entity.unknownDate"))}
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
                          <span className="text-[13px] italic text-slate-400 dark:text-slate-500">{t("entity.noPhone")}</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[280px]">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[13px] font-bold tabular-nums text-slate-900 dark:text-white">
                            {row.children_count}
                          </span>
                          {noKids ? (
                            <span className="text-[12px] italic text-red-600 dark:text-red-400">{t("entity.noChildrenChip")}</span>
                          ) : (
                            childNames.map((n, idx) => (
                              <span
                                key={`${row.id}-${idx}-${n}`}
                                className="inline-flex max-w-[140px] truncate rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-medium text-teal-900 dark:bg-teal-500/20 dark:text-teal-100"
                                title={n}
                              >
                                {n}
                              </span>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusPill kind={status} />
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            row.subscription?.library_frozen
                              ? "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200"
                              : row.subscription?.in_grace_period
                                ? "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
                                : row.subscription?.billing_exempt
                                  ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                  : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200",
                          )}
                        >
                          {subscriptionPillLabel(row.subscription, t)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {accountTab === "standalone" ? (
                            <Button
                              variant="outline"
                              className={cn(
                                actionBtn,
                                "border-sky-200 text-sky-800 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-200 dark:hover:bg-sky-950/40",
                              )}
                              onClick={() => openSubscription(row)}
                            >
                              <CreditCard className="h-3 w-3 shrink-0" />
                              {t("parents.btnSubscription")}
                            </Button>
                          ) : null}
                          {row.is_active ? (
                            <Button
                              variant="outline"
                              className={cn(
                                actionBtn,
                                "border-amber-300 bg-transparent text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/30",
                              )}
                              onClick={() => toggleStatus(row)}
                            >
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              {t("entity.disable")}
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              className={cn(
                                actionBtn,
                                "border-emerald-400 bg-transparent text-emerald-700 hover:bg-emerald-50 dark:border-emerald-600 dark:text-emerald-400 dark:hover:bg-emerald-950/30",
                              )}
                              onClick={() => toggleStatus(row)}
                            >
                              {t("entity.enable")}
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            className={cn(
                              actionBtn,
                              "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800",
                            )}
                            onClick={() => resetPassword(row)}
                          >
                            <Lock className="h-3 w-3 shrink-0" />
                            {t("entity.resetPassword")}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {!displayParents.length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                      {accountTab === "standalone" ? t("parents.emptyStandalone") : t("parents.emptyLinked")}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AdminSubscriptionDialog
        open={subDialogOpen}
        onOpenChange={setSubDialogOpen}
        mode="parent"
        row={subRow}
        onSaved={mergeSubscription}
      />
    </div>
  )
}

function ParentsPageFallback() {
  return <p className="px-4 py-8 text-sm text-muted-foreground">…</p>
}

export default function ParentsPage() {
  return (
    <AuthGuard requiredAccountType="administration">
      <Suspense fallback={<ParentsPageFallback />}>
        <ParentsPageInner />
      </Suspense>
    </AuthGuard>
  )
}
