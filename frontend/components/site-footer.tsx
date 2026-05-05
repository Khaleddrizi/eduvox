"use client"

import Link from "next/link"
import Image from "next/image"
import { Facebook, Twitter, Instagram, Youtube, Mail, Phone } from "lucide-react"
import { usePortalI18n } from "@/lib/i18n/i18n-context"

export function SiteFooter() {
  const { t } = usePortalI18n()
  const year = new Date().getFullYear()

  return (
    <footer className="border-t bg-background">
      <div className="container py-10">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div className="space-y-4">
            <Image src="/eduvox-logo.png" alt="Atheeria" width={170} height={52} className="h-12 w-auto object-contain" />
            <p className="text-sm text-muted-foreground">{t("footer.tagline")}</p>
            <div className="flex flex-wrap gap-3">
              <Link href="#" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                <Facebook size={20} />
                <span className="sr-only">Facebook</span>
              </Link>
              <Link href="#" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                <Twitter size={20} />
                <span className="sr-only">Twitter</span>
              </Link>
              <Link href="#" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                <Instagram size={20} />
                <span className="sr-only">Instagram</span>
              </Link>
              <Link href="#" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                <Youtube size={20} />
                <span className="sr-only">YouTube</span>
              </Link>
            </div>
          </div>
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider">{t("footer.resources")}</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="#" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  {t("footer.linkBlog")}
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  {t("footer.linkDocs")}
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  {t("footer.linkDownloads")}
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  {t("footer.linkFaq")}
                </Link>
              </li>
            </ul>
          </div>
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider">{t("footer.company")}</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="#" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  {t("footer.linkWho")}
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  {t("footer.linkTeam")}
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  {t("footer.linkCareers")}
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  {t("footer.linkContact")}
                </Link>
              </li>
            </ul>
          </div>
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider">{t("footer.contact")}</h3>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2 text-muted-foreground">
                <Mail size={16} className="text-primary" />
                <span>contact@eduvox.com</span>
              </li>
              <li className="flex items-center gap-2 text-muted-foreground">
                <Phone size={16} className="text-primary" />
                <span>+212 600 000 000</span>
              </li>
              <li className="pt-2">
                <Link
                  href="#"
                  className="inline-flex h-9 items-center justify-center rounded-md bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-500/90 px-4 py-2 text-sm font-medium text-white shadow transition-colors duration-200"
                >
                  {t("footer.ctaContact")}
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-8 border-t pt-8">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <p className="text-xs text-muted-foreground">{t("footer.copyright").replace("{year}", String(year))}</p>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <Link href="#" className="hover:text-primary transition-colors duration-200">
                {t("footer.bottomWho")}
              </Link>
              <Link href="#" className="hover:text-primary transition-colors duration-200">
                {t("footer.bottomContact")}
              </Link>
              <Link href="#" className="hover:text-primary transition-colors duration-200">
                {t("footer.bottomLegal")}
              </Link>
              <Link href="#" className="hover:text-primary transition-colors duration-200">
                {t("footer.bottomPrivacy")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
