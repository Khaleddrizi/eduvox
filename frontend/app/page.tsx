"use client"

import { PortalI18nProvider } from "@/lib/i18n/i18n-context"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { LandingSidebar } from "@/components/landing-sidebar"
import { LandingPageMain } from "@/components/landing-page-main"

export default function LandingPage() {
  return (
    <PortalI18nProvider role="public">
      <div className="flex min-h-screen">
        <LandingSidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col ps-14 sm:ps-16">
          <SiteHeader />
          <LandingPageMain />
          <SiteFooter />
        </div>
      </div>
    </PortalI18nProvider>
  )
}
