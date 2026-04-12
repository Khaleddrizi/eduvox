"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Shield, LayoutDashboard, Stethoscope, Users, Baby, ScrollText, LogOut } from "lucide-react"
import { AppDashboardShell, type DashboardNavItem, type DashboardNavGroup } from "@/components/layout/app-dashboard-shell"

export default function AdministrationLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [currentUser, setCurrentUser] = useState<{ full_name?: string; email?: string } | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem("adhdAssistCurrentUser")
      if (!raw) return
      setCurrentUser(JSON.parse(raw))
    } catch {
      //
    }
  }, [])

  const navGroups = useMemo<DashboardNavGroup[]>(
    () => [
      {
        label: "Overview",
        items: [{ href: "/administration", label: "Dashboard", icon: LayoutDashboard }],
      },
      {
        label: "Users",
        items: [
          { href: "/administration/doctors", label: "Doctors", icon: Stethoscope },
          { href: "/administration/parents", label: "Parents", icon: Users },
          { href: "/administration/children", label: "Children", icon: Baby },
        ],
      },
      {
        label: "System",
        items: [{ href: "/administration/audit", label: "Audit Logs", icon: ScrollText }],
      },
    ],
    [],
  )

  const isNavItemActive = (item: DashboardNavItem) =>
    item.href === "/administration"
      ? pathname === "/administration" || pathname === "/administration/"
      : pathname === item.href || pathname.startsWith(item.href + "/")

  const navItemClassName = (active: boolean) =>
    [
      "flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm transition-colors border-l-2",
      active
        ? "border-[#60a5fa] bg-[#1e3a5f] font-medium text-[#60a5fa]"
        : "border-transparent text-[#94a3b8] hover:bg-[#ffffff08]",
    ].join(" ")

  const displayName = currentUser?.full_name || currentUser?.email || "Administrator"

  const adminInitials = useMemo(() => {
    const n = (currentUser?.full_name || currentUser?.email || "Admin").trim()
    const parts = n.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    return n.slice(0, 2).toUpperCase() || "A"
  }, [currentUser?.full_name, currentUser?.email])

  const logout = () => {
    localStorage.removeItem("adhdAssistCurrentUser")
    router.replace("/login")
  }

  const sidebarHeader = (
    <div className="border-b border-white/[0.08] px-6 py-6">
      <Link href="/administration" className="flex items-start gap-3 min-w-0">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#1e3a5f]/80 ring-2 ring-indigo-400/35 shadow-[0_0_14px_rgba(99,102,241,0.35)]"
          aria-hidden
        >
          <Shield className="h-5 w-5 text-[#93c5fd]" />
        </div>
        <div className="min-w-0 pt-0.5">
          <span className="block text-lg font-semibold tracking-tight text-slate-100 truncate">Admin Console</span>
          <p className="mt-1 text-[11px] leading-snug text-slate-500">System governance</p>
        </div>
      </Link>
    </div>
  )

  const mobileBarTitle = (
    <div className="flex min-w-0 items-center gap-2">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#1e3a5f]/80 ring-1 ring-indigo-400/40"
        aria-hidden
      >
        <Shield className="h-4 w-4 text-[#93c5fd]" />
      </div>
      <span className="truncate text-base font-semibold text-slate-100">Admin Console</span>
    </div>
  )

  const sidebarFooter = (
    <div className="mt-auto border-t border-white/[0.08] p-4">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1e3a5f] text-[11px] font-semibold text-[#94a3b8]"
          aria-hidden
        >
          {adminInitials}
        </div>
        <p className="truncate text-sm text-[#94a3b8]">{displayName}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="mt-3 w-full border-slate-600/80 bg-transparent text-[#94a3b8] hover:bg-[#ffffff08] hover:text-slate-200"
        onClick={logout}
      >
        <LogOut className="mr-2 h-4 w-4" />
        Logout
      </Button>
    </div>
  )

  const darkSheet =
    "border-[#2d2d44] bg-[#1a1a2e] [&>button]:text-slate-400 [&>button]:hover:bg-white/10 [&>button]:hover:text-slate-200"

  return (
    <AppDashboardShell
      outerClassName="min-h-screen bg-slate-100 dark:bg-slate-950"
      navGroups={navGroups}
      isNavItemActive={isNavItemActive}
      sidebarHeader={sidebarHeader}
      sidebarFooter={sidebarFooter}
      mobileBarTitle={mobileBarTitle}
      navItemClassName={navItemClassName}
      navGroupLabelClassName="text-[#64748b]"
      asideClassName="!border-[#2d2d44] !bg-[#1a1a2e] shadow-xl shadow-black/20"
      sheetContentClassName={darkSheet}
      mobileHeaderClassName="border-[#2d2d44] bg-[#1a1a2e] backdrop-blur-md"
      mobileMenuButtonClassName="border-slate-600/80 bg-[#1e3a5f]/40 text-slate-200 hover:bg-[#ffffff08] hover:text-white"
    >
      {children}
    </AppDashboardShell>
  )
}
