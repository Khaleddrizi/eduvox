"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import type { AppLocale, PortalRole } from "./types"
import { readLocaleFromStorage, resolveMessage } from "./messages"

export const ATHEERIA_LOCALE_EVENT = "atheeria-locale-changed"

type Ctx = {
  locale: AppLocale
  role: PortalRole
  t: (key: string) => string
  /** Re-read locale from localStorage (e.g. after settings save). */
  refreshLocale: () => void
}

const PortalI18nContext = createContext<Ctx | null>(null)

export function PortalI18nProvider({ role, children }: { role: PortalRole; children: ReactNode }) {
  const [locale, setLocale] = useState<AppLocale>(() => readLocaleFromStorage(role))

  const refreshLocale = useCallback(() => {
    setLocale(readLocaleFromStorage(role))
  }, [role])

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale
      document.documentElement.dir = locale === "ar" ? "rtl" : "ltr"
    }
  }, [locale])

  useEffect(() => {
    const onChange = () => refreshLocale()
    window.addEventListener(ATHEERIA_LOCALE_EVENT, onChange)
    window.addEventListener("storage", onChange)
    return () => {
      window.removeEventListener(ATHEERIA_LOCALE_EVENT, onChange)
      window.removeEventListener("storage", onChange)
    }
  }, [refreshLocale])

  const t = useCallback(
    (key: string) => {
      return resolveMessage(locale, role, key)
    },
    [locale, role],
  )

  const value = useMemo(() => ({ locale, role, t, refreshLocale }), [locale, role, t, refreshLocale])

  return <PortalI18nContext.Provider value={value}>{children}</PortalI18nContext.Provider>
}

export function usePortalI18n() {
  const ctx = useContext(PortalI18nContext)
  if (!ctx) throw new Error("usePortalI18n must be used within PortalI18nProvider")
  return ctx
}

export function notifyLocaleChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ATHEERIA_LOCALE_EVENT))
  }
}
