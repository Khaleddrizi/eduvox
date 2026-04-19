"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { EDUVOX_LANDING_LOCALE_KEY } from "@/lib/i18n/messages-public-pages"
import { usePortalI18n, notifyLocaleChanged } from "@/lib/i18n/i18n-context"
import type { AppLocale } from "@/lib/i18n/types"
import { cn } from "@/lib/utils"

function persistLandingLocale(next: AppLocale) {
  try {
    localStorage.setItem(EDUVOX_LANDING_LOCALE_KEY, next)
    notifyLocaleChanged()
  } catch {
    //
  }
}

/** Narrow strip at the start edge (RTL-aware); language controls at the top. */
export function LandingSidebar() {
  const { t, locale } = usePortalI18n()
  const [busy, setBusy] = useState(false)

  const pick = useCallback(
    async (code: AppLocale) => {
      if (code === locale || busy) return
      setBusy(true)
      try {
        persistLandingLocale(code)
      } finally {
        setBusy(false)
      }
    },
    [locale, busy],
  )

  return (
    <aside
      className={cn(
        "fixed inset-y-0 z-40 flex w-14 flex-col items-center border-e bg-background/95 py-3 shadow-sm backdrop-blur sm:w-16",
        "start-0",
      )}
      aria-label="Language"
    >
      <div className="flex w-full flex-col items-center gap-1.5 px-1">
        {(["ar", "fr", "en"] as const).map((code) => {
          const short = code === "ar" ? t("locale.ar") : code === "fr" ? t("locale.fr") : t("locale.en")
          const active = locale === code
          return (
            <button
              key={code}
              type="button"
              disabled={busy}
              onClick={() => void pick(code)}
              className={cn(
                "w-full max-w-[2.5rem] rounded-md py-1 text-[11px] font-semibold transition-colors disabled:opacity-50",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {short}
            </button>
          )
        })}
      </div>
      <div className="mt-4 flex flex-1 flex-col items-center justify-end pb-2">
        <Link href="/" className="rounded-md p-1.5 opacity-80 hover:bg-muted hover:opacity-100" title="EDUVOX">
          <Image src="/adhd-logo.png" alt="EDUVOX" width={28} height={28} className="rounded-md" />
        </Link>
      </div>
    </aside>
  )
}
