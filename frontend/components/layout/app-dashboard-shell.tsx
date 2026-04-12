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

export type DashboardNavGroup = {
  label: string
  items: DashboardNavItem[]
}

type AppDashboardShellProps = {
  children: React.ReactNode
  /** Flat nav (default). Ignored when `navGroups` is non-empty. */
  nav?: DashboardNavItem[]
  navGroups?: DashboardNavGroup[]
  isNavItemActive: (item: DashboardNavItem) => boolean
  /** Header block inside sidebar (logo, title) */
  sidebarHeader: ReactNode
  sidebarFooter: ReactNode
  /** Row shown next to the menu button on small screens */
  mobileBarTitle?: ReactNode
  outerClassName?: string
  asideClassName?: string
  mainClassName?: string
  sheetContentClassName?: string
  mobileHeaderClassName?: string
  mobileMenuButtonClassName?: string
  /** Class for uppercase section labels when using `navGroups` */
  navGroupLabelClassName?: string
  navItemClassName: (active: boolean) => string
}

export function AppDashboardShell({
  children,
  nav = [],
  navGroups,
  isNavItemActive,
  sidebarHeader,
  sidebarFooter,
  mobileBarTitle,
  outerClassName,
  asideClassName,
  mainClassName,
  sheetContentClassName,
  mobileHeaderClassName,
  mobileMenuButtonClassName,
  navGroupLabelClassName = "text-slate-500",
  navItemClassName,
}: AppDashboardShellProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const renderNavLink = (item: DashboardNavItem, onNavigate?: () => void) => {
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
  }

  const NavList = ({ onNavigate }: { onNavigate?: () => void }) => {
    if (navGroups && navGroups.length > 0) {
      return (
        <nav className="flex-1 space-y-5 overflow-y-auto p-4">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p
                className={cn(
                  "mb-2 px-4 text-[10px] font-semibold uppercase tracking-wider",
                  navGroupLabelClassName,
                )}
              >
                {group.label}
              </p>
              <div className="space-y-1">{group.items.map((item) => renderNavLink(item, onNavigate))}</div>
            </div>
          ))}
        </nav>
      )
    }
    return (
      <nav className="flex-1 space-y-1 p-4">
        {nav.map((item) => renderNavLink(item, onNavigate))}
      </nav>
    )
  }

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
        <SheetContent
          side="left"
          className={cn(
            "flex w-[min(100vw-3rem,20rem)] flex-col border-r p-0 sm:max-w-sm",
            sheetContentClassName,
          )}
        >
          <SheetTitle className="sr-only">Main navigation</SheetTitle>
          <div className="flex min-h-0 flex-1 flex-col">
            {sidebarHeader}
            <NavList onNavigate={() => setMobileOpen(false)} />
            {sidebarFooter}
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header
          className={cn(
            "sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border/60 bg-white/95 px-4 backdrop-blur dark:bg-slate-900/95 lg:hidden print:hidden",
            mobileHeaderClassName,
          )}
        >
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn("shrink-0", mobileMenuButtonClassName)}
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
