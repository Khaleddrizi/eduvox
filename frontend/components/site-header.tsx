"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Menu, X } from "lucide-react"
import { ModeToggle } from "@/components/mode-toggle"
import { PublicLanguageMenu } from "@/components/public-language-menu"
import { usePortalI18n } from "@/lib/i18n/i18n-context"

export type SiteHeaderVariant = "marketing" | "login" | "register"

export function SiteHeader({ variant = "marketing" }: { variant?: SiteHeaderVariant }) {
  const { t } = usePortalI18n()
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const showLogin = variant === "marketing" || variant === "register"
  const showRegister = variant === "marketing" || variant === "login"

  return (
    <header className="sticky top-0 z-30 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/atheeria-logo.png" alt="Atheeria" width={150} height={46} className="h-11 w-auto object-contain" />
        </Link>

        <nav className="hidden md:flex items-center gap-2">
          <PublicLanguageMenu />
          <ModeToggle />
          {showLogin && (
            <Link href="/login">
              <Button variant="ghost" className="hover:text-primary">
                {t("nav.login")}
              </Button>
            </Link>
          )}
          {showRegister && (
            <Link href="/register">
              <Button className="bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-500/90 transition-all duration-300">
                {t("nav.register")}
              </Button>
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <PublicLanguageMenu />
          <ModeToggle />
          <Button variant="ghost" size="icon" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <X /> : <Menu />}
          </Button>
        </div>
      </div>

      {isMenuOpen && (
        <div className="md:hidden border-t">
          <div className="container flex flex-col gap-2 py-4">
            {showLogin && (
              <Link href="/login" className="block">
                <Button variant="outline" className="w-full">
                  {t("nav.login")}
                </Button>
              </Link>
            )}
            {showRegister && (
              <Link href="/register" className="block">
                <Button className="w-full bg-gradient-to-r from-primary to-cyan-500">{t("nav.register")}</Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
