"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { fetchApi } from "@/lib/api"
import { usePortalI18n } from "@/lib/i18n/i18n-context"
import { toast } from "sonner"

export type SubscriptionComputed = {
  billing_exempt: boolean
  paid_until: string | null
  grace_days: number | null
  library_frozen: boolean
  in_grace_period: boolean
  new_program_assign_blocked: boolean
}

export type AdminSubscriptionRow = {
  id: number
  subscription_paid_until: string | null
  subscription_grace_days: number | null
  subscription_billing_exempt: boolean
  subscription: SubscriptionComputed
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "doctor" | "parent"
  row: AdminSubscriptionRow | null
  onSaved: (next: AdminSubscriptionRow) => void
}

export function subscriptionPillLabel(sub: SubscriptionComputed | undefined, t: (key: string) => string): string {
  if (!sub) return "—"
  if (sub.billing_exempt) return t("subscription.pillExempt")
  if (!sub.paid_until) return t("subscription.pillNoEnd")
  if (sub.library_frozen) return t("subscription.pillFrozen")
  if (sub.in_grace_period) return t("subscription.pillGrace")
  return t("subscription.pillActive")
}

export function AdminSubscriptionDialog({ open, onOpenChange, mode, row, onSaved }: Props) {
  const { t } = usePortalI18n()
  const [paidUntil, setPaidUntil] = useState("")
  const [graceDays, setGraceDays] = useState("")
  const [exempt, setExempt] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !row) return
    setPaidUntil(row.subscription_paid_until ? row.subscription_paid_until.slice(0, 10) : "")
    setGraceDays(row.subscription_grace_days != null ? String(row.subscription_grace_days) : "")
    setExempt(row.subscription_billing_exempt)
  }, [open, row])

  if (!row) return null

  const titleKey = mode === "doctor" ? "subscription.titleDoctor" : "subscription.titleParent"

  const handleSave = async () => {
    setSaving(true)
    try {
      const path =
        mode === "doctor"
          ? `/api/administration/doctors/${row.id}/subscription`
          : `/api/administration/parents/${row.id}/subscription`
      let grace: number | null = null
      if (graceDays.trim() !== "") {
        const n = parseInt(graceDays, 10)
        if (Number.isNaN(n) || n < 0) {
          toast.error(t("subscription.toastErr"))
          return
        }
        grace = n
      }
      const paid = paidUntil.trim() === "" ? null : paidUntil.trim().slice(0, 10)
      const res = await fetchApi<{
        id: number
        subscription_paid_until: string | null
        subscription_grace_days: number | null
        subscription_billing_exempt: boolean
        subscription: SubscriptionComputed
      }>(path, {
        method: "PUT",
        body: JSON.stringify({
          paid_until: paid,
          grace_days: grace,
          billing_exempt: exempt,
        }),
      })
      onSaved({
        id: row.id,
        subscription_paid_until: res.subscription_paid_until,
        subscription_grace_days: res.subscription_grace_days,
        subscription_billing_exempt: res.subscription_billing_exempt,
        subscription: res.subscription,
      })
      toast.success(t("subscription.toastOk"))
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("subscription.toastErr"))
    } finally {
      setSaving(false)
    }
  }

  const state = row.subscription

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t(titleKey)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
            <span className="font-semibold">{t("subscription.state")}: </span>
            {subscriptionPillLabel(state, t)}
          </div>
          <div className="space-y-2">
            <Label htmlFor="sub-paid-until">{t("subscription.paidUntil")}</Label>
            <Input
              id="sub-paid-until"
              type="date"
              value={paidUntil}
              onChange={(e) => setPaidUntil(e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-[11px] text-muted-foreground leading-snug">{t("subscription.paidUntilHint")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sub-grace">{t("subscription.graceDays")}</Label>
            <Input
              id="sub-grace"
              type="number"
              min={0}
              placeholder="—"
              value={graceDays}
              onChange={(e) => setGraceDays(e.target.value)}
              className="text-sm"
            />
            <p className="text-[11px] text-muted-foreground leading-snug">{t("subscription.graceDaysHint")}</p>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox id="sub-exempt" checked={exempt} onCheckedChange={(v) => setExempt(v === true)} />
            <div className="space-y-1">
              <Label htmlFor="sub-exempt" className="cursor-pointer font-medium leading-none">
                {t("subscription.exempt")}
              </Label>
              <p className="text-[11px] text-muted-foreground leading-snug">{t("subscription.exemptHint")}</p>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("children.cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? t("subscription.saving") : t("subscription.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
