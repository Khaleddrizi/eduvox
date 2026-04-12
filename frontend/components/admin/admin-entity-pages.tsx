"use client"

import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Filter, Search } from "lucide-react"
import { cn } from "@/lib/utils"

export function formatJoinedDate(iso: string | null): string {
  if (!iso) return "Unknown date"
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

export function isWithinDays(iso: string | null, days: number): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return false
  return Date.now() - t < days * 86400000
}

export function AdminManagementHeader({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white md:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function AdminEntityKpiCard(props: {
  label: string
  value: string | number
  subtitle: string
  icon?: LucideIcon
  customIcon?: ReactNode
  iconWrapClass: string
  iconClass?: string
  valueClassName?: string
  subtitleClassName?: string
  borderClassName?: string
  /** Replaces default card surface (e.g. green KPI state) */
  cardClassName?: string
}) {
  const {
    label,
    value,
    subtitle,
    icon: Icon,
    customIcon,
    iconWrapClass,
    iconClass,
    valueClassName,
    subtitleClassName,
    borderClassName,
    cardClassName,
  } = props
  return (
    <Card
      className={cn(
        "relative overflow-hidden border shadow-sm",
        cardClassName ??
          "border-slate-200/90 bg-white dark:border-slate-800 dark:bg-slate-900/50",
        borderClassName,
      )}
    >
      <div
        className={cn(
          "absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg",
          iconWrapClass,
        )}
      >
        {customIcon ? customIcon : Icon ? <Icon className={cn("h-4 w-4", iconClass)} /> : null}
      </div>
      <CardContent className="pb-4 pt-4 pr-14">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
        <p
          className={cn(
            "mt-0.5 text-[22px] font-bold tabular-nums leading-tight",
            valueClassName ?? "text-slate-900 dark:text-white",
          )}
        >
          {value}
        </p>
        <p className={cn("mt-1 text-[11px] leading-snug", subtitleClassName ?? "text-slate-500 dark:text-slate-400")}>
          {subtitle}
        </p>
      </CardContent>
    </Card>
  )
}

export function AdminIssuesStrip(props: {
  variant: "success" | "warning" | "danger"
  icon: ReactNode
  children: ReactNode
}) {
  const { variant, icon, children } = props
  return (
    <div
      className={cn(
        "flex w-full items-center gap-2 rounded-md border px-4 py-[11px] text-[11px] font-medium leading-tight",
        variant === "success" &&
          "border-emerald-200 bg-[#ecfdf5] text-emerald-900 dark:border-emerald-800/50 dark:bg-emerald-950/25 dark:text-emerald-100",
        variant === "warning" &&
          "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800/50 dark:bg-amber-950/25 dark:text-amber-100",
        variant === "danger" &&
          "border-red-200 bg-red-50 text-red-950 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-100",
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  )
}

export function AdminDirectoryToolbar(props: {
  title: string
  titleIcon: ReactNode
  searchPlaceholder: string
  search: string
  onSearchChange: (v: string) => void
  filterActive?: boolean
  onFilterClick: () => void
}) {
  const { title, titleIcon, searchPlaceholder, search, onSearchChange, filterActive, onFilterClick } = props
  return (
    <div className="flex flex-col gap-4 border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        {titleIcon}
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:flex-initial sm:min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-9 bg-slate-100 pl-9 text-sm dark:border-slate-700 dark:bg-slate-800/80"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-9 gap-1.5 border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200/80 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700",
            filterActive &&
              "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-100",
          )}
          onClick={onFilterClick}
        >
          <Filter className="h-3.5 w-3.5" />
          Filter
        </Button>
      </div>
    </div>
  )
}

export function StatusPill(props: { kind: "active" | "disabled" | "pending" }) {
  const { kind } = props
  const map = {
    active:
      "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/80 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
    disabled: "bg-red-100 text-red-800 ring-1 ring-red-200/80 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30",
    pending:
      "bg-slate-100 text-slate-700 ring-1 ring-slate-200/80 dark:bg-slate-500/10 dark:text-slate-300 dark:ring-slate-500/25",
  } as const
  const label = kind === "active" ? "Active" : kind === "disabled" ? "Disabled" : "Pending"
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold", map[kind])}>{label}</span>
  )
}

export function entityStatusFromAccount(
  isActive: boolean,
  count: number,
  createdAt: string | null,
): "active" | "disabled" | "pending" {
  if (!isActive) return "disabled"
  if (count === 0 && isWithinDays(createdAt, 14)) return "pending"
  return "active"
}

export function avatarInitial(name: string | null | undefined, email: string) {
  const n = (name || email || "?").trim()
  return n.charAt(0).toUpperCase()
}

/** Focus / clinical status from session accuracy (same thresholds as doctor portal). */
export function clinicalFocusKind(avgAccuracy: number, sessionCount: number): "ok" | "watch" | "risk" {
  const score = Math.round(avgAccuracy || 0)
  const sessions = sessionCount || 0
  if (!sessions || score < 30) return "risk"
  if (score < 70) return "watch"
  return "ok"
}

export function ClinicalFocusPill(props: { avgAccuracy: number; sessionCount: number }) {
  const kind = clinicalFocusKind(props.avgAccuracy, props.sessionCount)
  const label = kind === "ok" ? "On Track" : kind === "watch" ? "Monitor" : "Needs Attention"
  const cls =
    kind === "ok"
      ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/80 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30"
      : kind === "watch"
        ? "bg-amber-100 text-amber-900 ring-1 ring-amber-200/80 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/30"
        : "bg-red-100 text-red-800 ring-1 ring-red-200/80 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30"
  return <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold", cls)}>{label}</span>
}

export function severityDotAndLabel(diagnostic: string | null): { dotClass: string; label: string } {
  const raw = (diagnostic || "").trim()
  const lower = raw.toLowerCase()
  if (lower.includes("severe")) return { dotClass: "bg-red-500", label: "Severe" }
  if (lower.includes("moderate")) return { dotClass: "bg-orange-500", label: "Moderate" }
  if (lower.includes("mild")) return { dotClass: "bg-amber-500", label: "Mild" }
  if (!raw) return { dotClass: "bg-slate-400", label: "—" }
  return { dotClass: "bg-slate-500", label: raw }
}

/** Dot + label + Tailwind text color for the ADHD level line (Mild / Moderate / Severe). */
export function severityLevelDisplay(diagnostic: string | null): {
  dotClass: string
  label: string
  textClass: string
} {
  const raw = (diagnostic || "").trim()
  const lower = raw.toLowerCase()
  if (lower.includes("severe"))
    return {
      dotClass: "bg-red-500",
      label: "Severe",
      textClass: "text-red-600 dark:text-red-400",
    }
  if (lower.includes("moderate"))
    return {
      dotClass: "bg-orange-500",
      label: "Moderate",
      textClass: "text-orange-600 dark:text-orange-400",
    }
  if (lower.includes("mild"))
    return {
      dotClass: "bg-amber-500",
      label: "Mild",
      textClass: "text-amber-600 dark:text-amber-400",
    }
  if (!raw)
    return {
      dotClass: "bg-slate-400",
      label: "—",
      textClass: "text-slate-500 dark:text-slate-400",
    }
  return {
    dotClass: "bg-slate-500",
    label: raw,
    textClass: "text-slate-600 dark:text-slate-300",
  }
}
