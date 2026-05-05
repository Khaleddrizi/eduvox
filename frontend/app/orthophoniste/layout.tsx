"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Activity, Users, BarChart3, Upload, Settings, LogOut } from "lucide-react"
import { AppDashboardShell, type DashboardNavItem } from "@/components/layout/app-dashboard-shell"
import { PortalI18nProvider, usePortalI18n } from "@/lib/i18n/i18n-context"

function OrthophonisteLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { t } = usePortalI18n()
  const [currentUser, setCurrentUser] = useState<{ full_name?: string; email?: string } | null>(null)

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

  const displayName = currentUser?.full_name || currentUser?.email || t("common.specialist")

  const nav = useMemo<DashboardNavItem[]>(
    () => [
      { href: "/orthophoniste", label: t("layout.nav.home"), icon: Activity },
      { href: "/orthophoniste/patients", label: t("layout.nav.patients"), icon: Users },
      { href: "/orthophoniste/analytics", label: t("layout.nav.analytics"), icon: BarChart3 },
      { href: "/orthophoniste/library", label: t("layout.nav.library"), icon: Upload },
      { href: "/orthophoniste/settings", label: t("layout.nav.settings"), icon: Settings },
    ],
    [t],
  )

  const isNavItemActive = (item: DashboardNavItem) =>
    pathname === item.href || (item.href !== "/orthophoniste" && pathname.startsWith(item.href))

  const navItemClassName = (active: boolean) =>
    [
      "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
      active
        ? "border-l-[3px] border-primary bg-blue-50/80 text-slate-900 dark:bg-slate-800/40 dark:text-white"
        : "border-l-[3px] border-transparent hover:bg-slate-100/70 dark:hover:bg-slate-800/50 text-gray-700 dark:text-gray-300",
    ].join(" ")

  const handleLogout = () => {
    localStorage.removeItem("adhdAssistCurrentUser")
    router.replace("/")
  }

  const sidebarHeader = (
    <div className="p-6 border-b border-gray-200 dark:border-gray-700">
      <Link href="/" className="flex items-center gap-2 min-w-0">
        <Image src="/eduvox-logo.png" alt="Atheeria" width={126} height={38} className="h-9 w-auto object-contain shrink-0" />
      </Link>
    </div>
  )

  const mobileBarTitle = (
    <Image src="/eduvox-logo.png" alt="Atheeria" width={104} height={30} className="h-7 w-auto object-contain" />
  )

  const sidebarFooter = (
    <div className="p-4 border-t border-gray-200 dark:border-gray-700 mt-auto">
      <p className="text-sm font-medium truncate">{displayName}</p>
      <Button variant="outline" size="sm" className="w-full mt-3" onClick={handleLogout}>
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

export default function OrthophonisteLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalI18nProvider role="specialist">
      <OrthophonisteLayoutInner>{children}</OrthophonisteLayoutInner>
    </PortalI18nProvider>
  )
}
