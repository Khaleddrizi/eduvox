"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Shield,
  LayoutDashboard,
  Stethoscope,
  Users,
  ScrollText,
  LogOut,
  ShieldAlert,
} from "lucide-react"
import { AppDashboardShell, type DashboardNavItem, type DashboardNavGroup } from "@/components/layout/app-dashboard-shell"
import { PortalI18nProvider, usePortalI18n, notifyLocaleChanged } from "@/lib/i18n/i18n-context"
import type { AppLocale } from "@/lib/i18n/types"
import { cn } from "@/lib/utils"
import { fetchApi } from "@/lib/api"

function setStoredLocale(next: AppLocale) {
  try {
    const raw = localStorage.getItem("adhdAssistCurrentUser")
    if (!raw) return
    const u = JSON.parse(raw) as Record<string, unknown>
    u.preferred_locale = next
    localStorage.setItem("adhdAssistCurrentUser", JSON.stringify(u))
    notifyLocaleChanged()
  } catch {
    //
  }
}

function AdministrationLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { t, locale } = usePortalI18n()
  const [currentUser, setCurrentUser] = useState<{ full_name?: string; email?: string } | null>(null)
  const [localeBusy, setLocaleBusy] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem("adhdAssistCurrentUser")
      if (!raw) return
      setCurrentUser(JSON.parse(raw))
    } catch {
      //
    }
  }, [pathname])

  const navGroups = useMemo<DashboardNavGroup[]>(
    () => [
      {
        label: t("layout.navGroupOverview"),
        items: [{ href: "/administration", label: t("layout.navDashboard"), icon: LayoutDashboard }],
      },
      {
        label: t("layout.navGroupCustomers"),
        items: [
          { href: "/administration/doctors", label: t("layout.navDoctors"), icon: Stethoscope },
          { href: "/administration/parents", label: t("layout.navParents"), icon: Users },
        ],
      },
      {
        label: t("layout.navGroupSystem"),
        items: [
          { href: "/administration/audit", label: t("layout.navAudit"), icon: ScrollText },
          { href: "/administration/security", label: t("layout.navSecurity"), icon: ShieldAlert },
        ],
      },
    ],
    [t],
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

  const displayName = currentUser?.full_name || currentUser?.email || t("layout.displayFallback")

  const adminInitials = useMemo(() => {
    const n = (currentUser?.full_name || currentUser?.email || "Admin").trim()
    const parts = n.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    return n.slice(0, 2).toUpperCase() || "A"
  }, [currentUser?.full_name, currentUser?.email])

  const logout = () => {
    localStorage.removeItem("adhdAssistCurrentUser")
    router.replace("/login?role=administration")
  }

  const pickLocale = useCallback(
    async (code: AppLocale) => {
      if (code === locale || localeBusy) return
      setLocaleBusy(true)
      try {
        await fetchApi("/api/administration/me", {
          method: "PUT",
          body: JSON.stringify({ preferred_locale: code }),
        })
        setStoredLocale(code)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("layout.toastLocaleErr"))
      } finally {
        setLocaleBusy(false)
      }
    },
    [locale, localeBusy, t],
  )

  const sidebarHeader = (
    <div className="border-b border-white/[0.08] px-6 py-6">
      <Link href="/administration" className="flex items-start gap-3 min-w-0">
        <Image src="/eduvox-logo.png" alt="Atheeria" width={130} height={38} className="h-10 w-auto object-contain shrink-0" />
        <div className="min-w-0 pt-0.5">
          <span className="block text-lg font-semibold tracking-tight text-slate-100 truncate">{t("layout.brandTitle")}</span>
          <p className="mt-1 text-[11px] leading-snug text-slate-500">{t("layout.brandSubtitle")}</p>
        </div>
      </Link>
    </div>
  )

  const mobileBarTitle = (
    <div className="flex min-w-0 items-center gap-2">
      <Image src="/eduvox-logo.png" alt="Atheeria" width={104} height={30} className="h-8 w-auto object-contain shrink-0" />
      <span className="truncate text-base font-semibold text-slate-100">{t("layout.brandTitle")}</span>
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
      <div className="mt-2 flex flex-wrap items-center gap-1 rounded-md border border-white/10 bg-black/20 px-1 py-1">
        {(["ar", "fr", "en"] as const).map((code) => {
          const short = code === "ar" ? t("layout.localeAr") : code === "fr" ? t("layout.localeFr") : t("layout.localeEn")
          const active = locale === code
          return (
            <button
              key={code}
              type="button"
              disabled={localeBusy}
              onClick={() => void pickLocale(code)}
              className={cn(
                "rounded px-2 py-0.5 text-[11px] font-semibold transition-colors disabled:opacity-50",
                active
                  ? "bg-[#60a5fa]/20 text-[#93c5fd]"
                  : "text-[#64748b] hover:bg-white/5 hover:text-slate-200",
              )}
            >
              {short}
            </button>
          )
        })}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="mt-3 w-full border-slate-600/80 bg-transparent text-[#94a3b8] hover:bg-[#ffffff08] hover:text-slate-200"
        onClick={logout}
      >
        <LogOut className="mr-2 h-4 w-4" />
        {t("layout.logout")}
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

export default function AdministrationLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalI18nProvider role="admin">
      <AdministrationLayoutInner>{children}</AdministrationLayoutInner>
    </PortalI18nProvider>
  )
}
