"use client"

import { AdminIssuesStrip } from "@/components/admin/admin-entity-pages"
import { AlertTriangle, Lock } from "lucide-react"

export type SubscriptionFlags = {
  billing_exempt?: boolean
  library_frozen?: boolean
  in_grace_period?: boolean
} | null

type Props = {
  subscription: SubscriptionFlags
  messageFrozen: string
  messageGrace: string
}

export function SubscriptionLibraryBanner({ subscription, messageFrozen, messageGrace }: Props) {
  if (!subscription || subscription.billing_exempt) return null
  if (subscription.library_frozen) {
    return (
      <AdminIssuesStrip variant="danger" icon={<Lock className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden />}>
        {messageFrozen}
      </AdminIssuesStrip>
    )
  }
  if (subscription.in_grace_period) {
    return (
      <AdminIssuesStrip
        variant="warning"
        icon={<AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />}
      >
        {messageGrace}
      </AdminIssuesStrip>
    )
  }
  return null
}
