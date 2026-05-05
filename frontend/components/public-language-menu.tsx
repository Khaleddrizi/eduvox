"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Languages } from "lucide-react"
import { ATHEERIA_LANDING_LOCALE_KEY } from "@/lib/i18n/messages-public-pages"
import { notifyLocaleChanged, usePortalI18n } from "@/lib/i18n/i18n-context"
import type { AppLocale } from "@/lib/i18n/types"

function persistPublicLocale(next: AppLocale) {
  try {
    localStorage.setItem(ATHEERIA_LANDING_LOCALE_KEY, next)
    notifyLocaleChanged()
  } catch {
    //
  }
}

export function PublicLanguageMenu() {
  const { locale, t } = usePortalI18n()
  const currentLabel = locale === "ar" ? t("locale.optionAr") : locale === "fr" ? t("locale.optionFr") : t("locale.optionEn")

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" aria-label={t("locale.chooserTitle")}>
          <Languages className="h-4 w-4 shrink-0" />
          <span className="max-w-[7rem] truncate text-xs font-medium sm:text-sm">{currentLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>{t("locale.chooserTitle")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={locale} onValueChange={(v) => persistPublicLocale(v as AppLocale)}>
          <DropdownMenuRadioItem value="ar">{t("locale.optionAr")}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="en">{t("locale.optionEn")}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="fr">{t("locale.optionFr")}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
