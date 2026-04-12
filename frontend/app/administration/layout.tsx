"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Shield, LayoutDashboard, Stethoscope, Users, Baby, ScrollText, LogOut } from "lucide-react"
import { AppDashboardShell, type DashboardNavItem } from "@/components/layout/app-dashboard-shell"

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

  const nav = useMemo<DashboardNavItem[]>(
    () => [
      { href: "/administration", label: "Dashboard", icon: LayoutDashboard },
      { href: "/administration/doctors", label: "Doctors", icon: Stethoscope },
      { href: "/administration/parents", label: "Parents", icon: Users },
      { href: "/administration/children", label: "Children", icon: Baby },
      { href: "/administration/audit", label: "Audit Logs", icon: ScrollText },
    ],
    [],
  )

  const isNavItemActive = (item: DashboardNavItem) =>
    item.href === "/administration"
      ? pathname === "/administration" || pathname === "/administration/"
      : pathname === item.href || pathname.startsWith(item.href + "/")

  const navItemClassName = (active: boolean) =>
    [
      "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
      active
        ? "border-l-[3px] border-primary bg-blue-50/80 text-slate-900 dark:bg-slate-800/40 dark:text-white"
        : "border-l-[3px] border-transparent hover:bg-slate-100/70 dark:hover:bg-slate-800/50 text-gray-700 dark:text-gray-300",
    ].join(" ")

  const displayName = currentUser?.full_name || currentUser?.email || "Administrator"

  const logout = () => {
    localStorage.removeItem("adhdAssistCurrentUser")
    router.replace("/login")
  }

  const sidebarHeader = (
    <div className="p-6 border-b border-gray-200 dark:border-gray-700">
      <Link href="/administration" className="flex items-center gap-2 min-w-0">
        <Shield className="h-5 w-5 text-primary shrink-0" />
        <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-cyan-500 truncate">
          Admin Console
        </span>
      </Link>
      <p className="mt-1 text-xs text-muted-foreground">System governance</p>
    </div>
  )

  const mobileBarTitle = (
    <div className="flex items-center gap-2 min-w-0">
      <Shield className="h-5 w-5 text-primary shrink-0" />
      <span className="text-base font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-cyan-500 truncate">
        Admin Console
      </span>
    </div>
  )

  const sidebarFooter = (
    <div className="p-4 border-t border-gray-200 dark:border-gray-700 mt-auto">
      <p className="text-sm font-medium truncate">{displayName}</p>
      <Button variant="outline" size="sm" className="w-full mt-3" onClick={logout}>
        <LogOut className="h-4 w-4 mr-2" />
        Logout
      </Button>
    </div>
  )

  return (
    <AppDashboardShell
      outerClassName="app-shell min-h-screen"
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
