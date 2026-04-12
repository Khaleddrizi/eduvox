"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Home, User, LogOut, Users, BarChart3 } from "lucide-react"

export default function ParentDashboardLayout({ children }: { children: React.ReactNode }) {
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

  const displayName = currentUser?.full_name || currentUser?.email || "Parent"

  const parentInitials = useMemo(() => {
    const n = (currentUser?.full_name || currentUser?.email || "P").trim()
    const parts = n.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return n.slice(0, 2).toUpperCase()
  }, [currentUser?.full_name, currentUser?.email])

  const nav = useMemo(
    () => [
      { href: "/dashboard", label: "Dashboard", icon: Home },
      { href: "/dashboard/children", label: "Children", icon: Users },
      { href: "/dashboard/reports", label: "Reports", icon: BarChart3 },
      { href: "/dashboard/profile", label: "Profile", icon: User },
    ],
    [],
  )

  const handleLogout = () => {
    localStorage.removeItem("adhdAssistCurrentUser")
    router.replace("/")
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-sky-50/60 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <aside className="w-64 border-r border-border/60 bg-white/90 dark:bg-slate-900/70 shadow-lg backdrop-blur flex flex-col print:hidden">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <Link href="/dashboard" className="block">
            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-cyan-500">
              ADHD Assist
            </span>
            <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Parent Portal</p>
          </Link>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {nav.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard" || pathname === "/dashboard/"
                : pathname === item.href || pathname.startsWith(item.href + "/")
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "flex items-center gap-3 rounded-lg py-3 pl-3 pr-4 border-l-[3px] transition-all duration-150",
                  isActive
                    ? "border-[#1a8fe3] bg-sky-50 text-slate-900 dark:border-sky-400 dark:bg-sky-950/30 dark:text-white"
                    : "border-transparent text-gray-700 hover:bg-slate-100/80 dark:text-gray-300 dark:hover:bg-slate-800/60",
                ].join(" ")}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
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
            Logout
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-6 md:p-8 print:p-4 print:w-full">{children}</main>
    </div>
  )
}

