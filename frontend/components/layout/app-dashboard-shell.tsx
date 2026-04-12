"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

export type DashboardNavItem = {
  href: string
  label: string
  icon: LucideIcon
}

type AppDashboardShellProps = {
  children: React.ReactNode
  nav: DashboardNavItem[]
  isNavItemActive: (item: DashboardNavItem) => boolean
  /** Header block inside sidebar (logo, title) */
  sidebarHeader: ReactNode
  sidebarFooter: ReactNode
  /** Row shown next to the menu button on small screens */
  mobileBarTitle?: ReactNode
  outerClassName?: string
  asideClassName?: string
  mainClassName?: string
  navItemClassName: (active: boolean) => string
}

export function AppDashboardShell({
  children,
  nav,
  isNavItemActive,
  sidebarHeader,
  sidebarFooter,
  mobileBarTitle,
  outerClassName,
  asideClassName,
  mainClassName,
  navItemClassName,
}: AppDashboardShellProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const NavList = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="flex-1 p-4 space-y-1">
      {nav.map((item) => {
        const Icon = item.icon
        const active = isNavItemActive(item)
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={navItemClassName(active)}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )

  return (
    <div className={cn("flex min-h-screen", outerClassName)}>
      <aside
        className={cn(
          "hidden w-64 shrink-0 flex-col border-r border-border/60 bg-white/90 shadow-lg backdrop-blur dark:bg-slate-900/70 lg:flex print:hidden",
          asideClassName,
        )}
      >
        {sidebarHeader}
        <NavList />
        {sidebarFooter}
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="flex w-[min(100vw-3rem,20rem)] flex-col border-r p-0 sm:max-w-sm">
          <SheetTitle className="sr-only">Main navigation</SheetTitle>
          <div className="flex min-h-0 flex-1 flex-col">
            {sidebarHeader}
            <NavList onNavigate={() => setMobileOpen(false)} />
            {sidebarFooter}
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border/60 bg-white/95 px-4 backdrop-blur dark:bg-slate-900/95 lg:hidden print:hidden">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">{mobileBarTitle}</div>
        </header>
        <main className={cn("min-w-0 flex-1 overflow-auto p-4 sm:p-6 md:p-8 print:w-full print:p-4", mainClassName)}>
          {children}
        </main>
      </div>
    </div>
  )
}
