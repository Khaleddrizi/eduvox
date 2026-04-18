"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Menu, X } from "lucide-react"
import { ModeToggle } from "@/components/mode-toggle"

export function SiteHeader() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/adhd-logo.png" alt="EDUVOX" width={40} height={40} className="rounded-md" />
          <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-cyan-500">
            EDUVOX
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-2">
          <ModeToggle />
          <Link href="/login">
            <Button variant="ghost" className="hover:text-primary">
              تسجيل الدخول
            </Button>
          </Link>
          <Link href="/register">
            <Button className="bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-500/90 transition-all duration-300">
              إنشاء حساب مهني
            </Button>
          </Link>
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <ModeToggle />
          <Button variant="ghost" size="icon" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <X /> : <Menu />}
          </Button>
        </div>
      </div>

      {isMenuOpen && (
        <div className="md:hidden border-t">
          <div className="container py-4 space-y-2">
            <Link href="/login" className="block py-2">
              <Button variant="outline" className="w-full">تسجيل الدخول</Button>
            </Link>
            <Link href="/register" className="block py-2">
              <Button className="w-full bg-gradient-to-r from-primary to-cyan-500">إنشاء حساب مهني</Button>
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}
