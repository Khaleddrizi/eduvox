"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Home, Settings, LogOut, Users, BarChart3, Upload } from "lucide-react"
import { AppDashboardShell, type DashboardNavItem } from "@/components/layout/app-dashboard-shell"
import { PortalI18nProvider, usePortalI18n } from "@/lib/i18n/i18n-context"

function ParentDashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { t } = usePortalI18n()
  const [currentUser, setCurrentUser] = useState<{
    full_name?: string
    email?: string
    preferred_locale?: string
    role?: string
    account_kind?: string
  } | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem("adhdAssistCurrentUser")
      if (!raw) return
      const u = JSON.parse(raw)
      setCurrentUser(u)
    } catch {
      //
    }
  }, [pathname])

  const isStandaloneParent = currentUser?.account_kind === "standalone"

  const displayName = currentUser?.full_name || currentUser?.email || t("common.parent")

  const parentInitials = useMemo(() => {
    const n = (currentUser?.full_name || currentUser?.email || "P").trim()
    const parts = n.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return n.slice(0, 2).toUpperCase()
  }, [currentUser?.full_name, currentUser?.email])

  const nav = useMemo<DashboardNavItem[]>(() => {
    const items: DashboardNavItem[] = [
      { href: "/dashboard", label: t("layout.nav.home"), icon: Home },
      { href: "/dashboard/children", label: t("layout.nav.children"), icon: Users },
    ]
    if (isStandaloneParent) {
      items.push({ href: "/dashboard/library", label: t("layout.nav.library"), icon: Upload })
    }
    items.push(
      { href: "/dashboard/reports", label: t("layout.nav.reports"), icon: BarChart3 },
      { href: "/dashboard/settings", label: t("layout.nav.settings"), icon: Settings },
    )
    return items
  }, [t, isStandaloneParent])

  const isNavItemActive = (item: DashboardNavItem) =>
    item.href === "/dashboard"
      ? pathname === "/dashboard" || pathname === "/dashboard/"
      : pathname === item.href || pathname.startsWith(item.href + "/")

  const navItemClassName = (active: boolean) =>
    [
      "flex items-center gap-3 rounded-lg py-3 pl-3 pr-4 border-l-[3px] transition-all duration-150",
      active
        ? "border-[#1a8fe3] bg-sky-50 text-slate-900 dark:border-sky-400 dark:bg-sky-950/30 dark:text-white"
        : "border-transparent text-gray-700 hover:bg-slate-100/80 dark:text-gray-300 dark:hover:bg-slate-800/60",
    ].join(" ")

  const handleLogout = () => {
    localStorage.removeItem("adhdAssistCurrentUser")
    router.replace("/")
  }

  const sidebarHeader = (
    <div className="p-6 border-b border-gray-200 dark:border-gray-700">
      <Link href="/dashboard" className="block min-w-0">
        <Image src="/eduvox-logo.png" alt="Atheeria" width={150} height={44} className="h-11 w-auto object-contain" />
        <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("layout.portal")}</p>
      </Link>
    </div>
  )

  const mobileBarTitle = (
    <div className="min-w-0">
      <Image src="/eduvox-logo.png" alt="Atheeria" width={120} height={34} className="h-8 w-auto object-contain" />
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground truncate">{t("layout.portal")}</p>
    </div>
  )

  const sidebarFooter = (
    <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3 mt-auto">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-[#0f766e] bg-teal-50 dark:bg-teal-950/50 dark:text-teal-200"
          aria-hidden
        >
          {parentInitials}
        </div>
        <p className="text-sm font-medium truncate text-slate-900 dark:text-slate-100">{displayName}</p>
      </div>
      <Button variant="outline" size="sm" className="w-full" onClick={handleLogout}>
        <LogOut className="h-4 w-4 mr-2" />
        {t("layout.logout")}
      </Button>
    </div>
  )

  return (
    <AppDashboardShell
      outerClassName="bg-gradient-to-br from-slate-50 via-sky-50/60 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950"
      nav={nav}
      isNavItemActive={isNavItemActive}
      sidebarHeader={sidebarHeader}
      sidebarFooter={sidebarFooter}
      mobileBarTitle={mobileBarTitle}
      navItemClassName={navItemClassName}
    >
      {children}
    </AppDashboardShell>
  )
}

export default function ParentDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalI18nProvider role="parent">
      <ParentDashboardLayoutInner>{children}</ParentDashboardLayoutInner>
    </PortalI18nProvider>
  )
}
