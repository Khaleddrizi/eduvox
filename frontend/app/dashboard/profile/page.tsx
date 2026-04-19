"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { AuthGuard } from "@/components/auth-guard"
import { usePortalI18n } from "@/lib/i18n/i18n-context"

function RedirectInner() {
  const { t } = usePortalI18n()
  const router = useRouter()
  useEffect(() => {
    router.replace("/dashboard/settings")
  }, [router])
  return (
    <div className="flex items-center justify-center py-24">
      <p className="text-sm text-muted-foreground">{t("profile.redirecting")}</p>
    </div>
  )
}

/** @deprecated استخدم `/dashboard/settings` — يُبقى للروابط القديمة. */
export default function ProfileRedirectPage() {
  return (
    <AuthGuard requiredAccountType="parent">
      <RedirectInner />
    </AuthGuard>
  )
}
