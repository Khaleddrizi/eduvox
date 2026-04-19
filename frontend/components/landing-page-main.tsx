"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  ArrowLeft,
  ArrowRight,
  Users,
  FileText,
  Brain,
  BarChart3,
  ClipboardCheck,
  Gamepad2,
  Heart,
  Target,
} from "lucide-react"
import { usePortalI18n } from "@/lib/i18n/i18n-context"
import { cn } from "@/lib/utils"

export function LandingPageMain() {
  const { t, locale } = usePortalI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const CtaArrow = locale === "ar" ? ArrowLeft : ArrowRight
  const ctaArrowClass =
    locale === "ar" ? "transition-transform group-hover:-translate-x-1" : "transition-transform group-hover:translate-x-1"

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("animate-in")
          }
        })
      },
      { threshold: 0.1 },
    )

    const animatedElements = document.querySelectorAll(".animate-on-scroll")
    animatedElements.forEach((el) => observer.observe(el))

    return () => {
      animatedElements.forEach((el) => observer.unobserve(el))
    }
  }, [])

  return (
    <main className="flex-1" ref={containerRef}>
      <section className="bg-gradient-to-b from-background to-sky-50 dark:from-background dark:to-sky-950/10 pt-10 pb-16 md:pt-16 md:pb-24 overflow-hidden">
        <div className="container grid items-center gap-6 pt-6 md:py-10 lg:grid-cols-2">
          <div className="flex flex-col items-start gap-4 animate-on-scroll">
            <div className="inline-block rounded-lg bg-primary/10 px-3 py-1 text-sm text-primary">{t("hero.badge")}</div>
            <h1 className="text-3xl font-bold leading-tight tracking-tighter md:text-4xl lg:text-5xl lg:leading-[1.1] bg-clip-text text-transparent bg-gradient-to-r from-primary via-cyan-500 to-teal-500">
              {t("hero.title")}
            </h1>
            <p className="text-lg text-muted-foreground md:text-xl">{t("hero.subtitle")}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/login">
                <Button
                  size="lg"
                  className="px-8 gap-2 group bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-500/90 transition-all duration-300"
                >
                  {t("hero.ctaLogin")}
                  <CtaArrow className={cn("h-4 w-4", ctaArrowClass)} />
                </Button>
              </Link>
              <Link href="/register">
                <Button
                  size="lg"
                  variant="outline"
                  className="px-8 border-primary/20 hover:border-primary/40 hover:bg-primary/5 transition-all duration-300"
                >
                  {t("hero.ctaRegister")}
                </Button>
              </Link>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
              <svg className="h-4 w-4 fill-current text-teal-500" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{t("hero.perkTrial")}</span>
              <span className="mx-2">•</span>
              <svg className="h-4 w-4 fill-current text-teal-500" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{t("hero.perkNoCard")}</span>
            </div>
          </div>
          <div className="flex justify-center lg:justify-end animate-on-scroll">
            <div className="relative">
              <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-gradient-to-r from-sky-300/30 to-cyan-300/30 blur-3xl animate-pulse-slow" />
              <div className="absolute -bottom-10 -left-10 h-60 w-60 rounded-full bg-gradient-to-r from-blue-300/30 to-teal-300/30 blur-3xl animate-pulse-slow" />
              <div className="relative z-10">
                <Image
                  src="/enfant-assistant-vocal.png"
                  alt={t("hero.imageAlt")}
                  width={500}
                  height={400}
                  className="rounded-lg shadow-xl"
                  priority
                />
                <div className="absolute -top-10 -left-10 bg-white dark:bg-gray-800 rounded-full p-3 shadow-lg animate-bounce-slow border-2 border-primary/20">
                  <Brain className="h-6 w-6 text-primary" />
                </div>
                <div className="absolute -bottom-5 -right-5 bg-white dark:bg-gray-800 rounded-full p-3 shadow-lg animate-float border-2 border-cyan-500/20">
                  <Target className="h-6 w-6 text-cyan-600" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-gradient-to-b from-sky-50 to-background dark:from-sky-950/10 dark:to-background">
        <div className="container">
          <div className="text-center mb-12 animate-on-scroll">
            <h2 className="text-3xl font-bold mb-3 bg-clip-text text-transparent bg-gradient-to-r from-primary to-cyan-500">
              {t("features.title")}
            </h2>
            <p className="text-muted-foreground max-w-3xl mx-auto text-lg">{t("features.subtitle")}</p>
          </div>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            <div className="animate-on-scroll lg:col-span-2 md:col-span-2">
              <Card className="border-none shadow-md bg-gradient-to-br from-white to-sky-50 dark:from-gray-900 dark:to-sky-950/20 h-full overflow-hidden group hover:shadow-lg transition-all duration-300">
                <CardContent className="pt-6">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-gradient-to-r from-sky-500/10 to-cyan-500/10 p-3 transition-all duration-300 group-hover:scale-110">
                        <ClipboardCheck className="h-8 w-8 text-sky-600" />
                      </div>
                      <h3 className="text-xl font-bold">{t("feat.track.title")}</h3>
                    </div>
                    <ul className="space-y-3 text-muted-foreground ms-14">
                      <li className="flex items-start gap-2">
                        <svg className="h-4 w-4 text-sky-600 mt-1 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{t("feat.track.li1")}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="h-4 w-4 text-sky-600 mt-1 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{t("feat.track.li2")}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="h-4 w-4 text-sky-600 mt-1 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{t("feat.track.li3")}</span>
                      </li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="animate-on-scroll">
              <Card className="border-none shadow-md bg-gradient-to-br from-white to-blue-50 dark:from-gray-900 dark:to-blue-950/20 h-full overflow-hidden group hover:shadow-lg transition-all duration-300">
                <CardContent className="pt-6">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-gradient-to-r from-blue-500/10 to-indigo-500/10 p-3 transition-all duration-300 group-hover:scale-110">
                        <Brain className="h-8 w-8 text-blue-600" />
                      </div>
                      <h3 className="text-xl font-bold">{t("feat.ai.title")}</h3>
                    </div>
                    <ul className="space-y-3 text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <svg className="h-4 w-4 text-blue-600 mt-1 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{t("feat.ai.li1")}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="h-4 w-4 text-blue-600 mt-1 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{t("feat.ai.li2")}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="h-4 w-4 text-blue-600 mt-1 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{t("feat.ai.li3")}</span>
                      </li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="animate-on-scroll">
              <Card className="border-none shadow-md bg-gradient-to-br from-white to-teal-50 dark:from-gray-900 dark:to-teal-950/20 h-full overflow-hidden group hover:shadow-lg transition-all duration-300">
                <CardContent className="pt-6">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-gradient-to-r from-teal-500/10 to-cyan-500/10 p-3 transition-all duration-300 group-hover:scale-110">
                        <Gamepad2 className="h-8 w-8 text-teal-600" />
                      </div>
                      <h3 className="text-xl font-bold">{t("feat.games.title")}</h3>
                    </div>
                    <ul className="space-y-3 text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <svg className="h-4 w-4 text-teal-600 mt-1 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{t("feat.games.li1")}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="h-4 w-4 text-teal-600 mt-1 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{t("feat.games.li2")}</span>
                      </li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="animate-on-scroll">
              <Card className="border-none shadow-md bg-gradient-to-br from-white to-indigo-50 dark:from-gray-900 dark:to-indigo-950/20 h-full overflow-hidden group hover:shadow-lg transition-all duration-300">
                <CardContent className="pt-6">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-gradient-to-r from-indigo-500/10 to-purple-500/10 p-3 transition-all duration-300 group-hover:scale-110">
                        <Users className="h-8 w-8 text-indigo-600" />
                      </div>
                      <h3 className="text-xl font-bold">{t("feat.family.title")}</h3>
                    </div>
                    <ul className="space-y-3 text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <svg className="h-4 w-4 text-indigo-600 mt-1 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{t("feat.family.li1")}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="h-4 w-4 text-indigo-600 mt-1 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{t("feat.family.li2")}</span>
                      </li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="animate-on-scroll">
              <Card className="border-none shadow-md bg-gradient-to-br from-white to-pink-50 dark:from-gray-900 dark:to-pink-950/20 h-full overflow-hidden group hover:shadow-lg transition-all duration-300">
                <CardContent className="pt-6">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-gradient-to-r from-pink-500/10 to-rose-500/10 p-3 transition-all duration-300 group-hover:scale-110">
                        <Heart className="h-8 w-8 text-pink-600" />
                      </div>
                      <h3 className="text-xl font-bold">{t("feat.motivation.title")}</h3>
                    </div>
                    <ul className="space-y-3 text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <svg className="h-4 w-4 text-pink-600 mt-1 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{t("feat.motivation.li1")}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="h-4 w-4 text-pink-600 mt-1 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{t("feat.motivation.li2")}</span>
                      </li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container">
          <div className="text-center mb-12 animate-on-scroll">
            <h2 className="text-3xl font-bold mb-3 bg-clip-text text-transparent bg-gradient-to-r from-primary to-cyan-500">
              {t("steps.title")}
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">{t("steps.subtitle")}</p>
          </div>
          <div className="grid gap-8 md:grid-cols-3 relative">
            <div className="absolute top-24 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent hidden md:block" />
            <div className="relative flex flex-col items-center text-center animate-on-scroll">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 text-white w-10 h-10 flex items-center justify-center font-bold shadow-lg z-10">
                1
              </div>
              <div className="rounded-full bg-gradient-to-br from-sky-100 to-cyan-100 dark:from-sky-900/20 dark:to-cyan-900/20 p-6 mb-4 shadow-md hover:scale-105 transition-transform duration-300">
                <FileText className="h-12 w-12 text-sky-600" />
              </div>
              <h3 className="text-xl font-bold mb-2">{t("steps.s1Title")}</h3>
              <p className="text-muted-foreground">{t("steps.s1Desc")}</p>
            </div>
            <div className="relative flex flex-col items-center text-center animate-on-scroll">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 text-white w-10 h-10 flex items-center justify-center font-bold shadow-lg z-10">
                2
              </div>
              <div className="rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/20 dark:to-indigo-900/20 p-6 mb-4 shadow-md hover:scale-105 transition-transform duration-300">
                <Brain className="h-12 w-12 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold mb-2">{t("steps.s2Title")}</h3>
              <p className="text-muted-foreground">{t("steps.s2Desc")}</p>
            </div>
            <div className="relative flex flex-col items-center text-center animate-on-scroll">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-teal-500 to-cyan-500 text-white w-10 h-10 flex items-center justify-center font-bold shadow-lg z-10">
                3
              </div>
              <div className="rounded-full bg-gradient-to-br from-teal-100 to-cyan-100 dark:from-teal-900/20 dark:to-cyan-900/20 p-6 mb-4 shadow-md hover:scale-105 transition-transform duration-300">
                <BarChart3 className="h-12 w-12 text-teal-600" />
              </div>
              <h3 className="text-xl font-bold mb-2">{t("steps.s3Title")}</h3>
              <p className="text-muted-foreground">{t("steps.s3Desc")}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-gradient-to-b from-background to-blue-50/50 dark:from-background dark:to-blue-950/10">
        <div className="container">
          <div className="text-center mb-12 animate-on-scroll">
            <h2 className="text-3xl font-bold mb-3 bg-clip-text text-transparent bg-gradient-to-r from-primary to-blue-500">
              {t("audience.title")}
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">{t("audience.subtitle")}</p>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            <div className="animate-on-scroll">
              <Card className="bg-gradient-to-br from-white to-blue-50 dark:from-gray-900 dark:to-blue-950/20 border-none shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300">
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center gap-4">
                    <div className="hover:rotate-6 transition-transform duration-300">
                      <Image
                        src="/orthophoniste-professional.png"
                        alt={t("audience.specImgAlt")}
                        width={80}
                        height={80}
                        className="rounded-full border-4 border-blue-100 dark:border-blue-900/30 shadow-md"
                      />
                    </div>
                    <h3 className="text-xl font-bold">{t("audience.specTitle")}</h3>
                    <p className="text-muted-foreground">{t("audience.specDesc")}</p>
                    <ul className="text-sm text-start space-y-2">
                      <li className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {t("audience.specL1")}
                      </li>
                      <li className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {t("audience.specL2")}
                      </li>
                      <li className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {t("audience.specL3")}
                      </li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="animate-on-scroll">
              <Card className="bg-gradient-to-br from-white to-sky-50 dark:from-gray-900 dark:to-sky-950/20 border-none shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300">
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center gap-4">
                    <div className="hover:-rotate-6 transition-transform duration-300">
                      <Image
                        src="/parents-icon.png"
                        alt={t("audience.familyImgAlt")}
                        width={80}
                        height={80}
                        className="rounded-full border-4 border-sky-100 dark:border-sky-900/30 shadow-md"
                      />
                    </div>
                    <h3 className="text-xl font-bold">{t("audience.familyTitle")}</h3>
                    <p className="text-muted-foreground">{t("audience.familyDesc")}</p>
                    <ul className="text-sm text-start space-y-2">
                      <li className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {t("audience.familyL1")}
                      </li>
                      <li className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {t("audience.familyL2")}
                      </li>
                      <li className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {t("audience.familyL3")}
                      </li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="animate-on-scroll">
              <Card className="bg-gradient-to-br from-white to-cyan-50 dark:from-gray-900 dark:to-cyan-950/20 border-none shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300">
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center gap-4">
                    <div className="hover:rotate-6 transition-transform duration-300">
                      <Image
                        src="/happy-child-icon.png"
                        alt={t("audience.childImgAlt")}
                        width={80}
                        height={80}
                        className="rounded-full border-4 border-cyan-100 dark:border-cyan-900/30 shadow-md"
                      />
                    </div>
                    <h3 className="text-xl font-bold">{t("audience.childTitle")}</h3>
                    <p className="text-muted-foreground">{t("audience.childDesc")}</p>
                    <ul className="text-sm text-start space-y-2">
                      <li className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {t("audience.childL1")}
                      </li>
                      <li className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {t("audience.childL2")}
                      </li>
                      <li className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {t("audience.childL3")}
                      </li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-gradient-to-r from-primary to-cyan-500 text-white relative overflow-hidden">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-white/10 blur-3xl animate-pulse-slow" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-white/10 blur-3xl animate-pulse-slow" />
        <div className="container relative z-10">
          <div className="flex flex-col items-center text-center max-w-3xl mx-auto gap-6 animate-on-scroll">
            <h2 className="text-3xl font-bold">{t("cta.title")}</h2>
            <p className="text-white/90 text-lg">{t("cta.subtitle")}</p>
            <div className="flex flex-col sm:flex-row gap-4 mt-2">
              <Link href="/register">
                <Button
                  size="lg"
                  variant="secondary"
                  className="min-w-[240px] bg-white text-primary hover:bg-white/90 transition-all duration-300 hover:scale-105"
                >
                  {t("cta.register")}
                </Button>
              </Link>
              <Link href="/login">
                <Button
                  size="lg"
                  variant="outline"
                  className="min-w-[200px] text-white border-white hover:bg-white hover:text-primary transition-all duration-300 bg-transparent hover:scale-105"
                >
                  {t("cta.login")}
                </Button>
              </Link>
            </div>
            <p className="text-white/80 text-sm flex items-center gap-2">
              <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              {t("cta.note")}
            </p>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 pointer-events-none">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 1440 160"
            className="w-full h-24 md:h-32 fill-white/90 dark:fill-gray-950/90"
            preserveAspectRatio="none"
          >
            <path
              d="M0,96L48,90.7C96,85,192,75,288,80C384,85,480,107,576,112C672,117,768,107,864,96C960,85,1056,75,1152,80C1248,85,1344,107,1392,117.3L1440,128L1440,160L1392,160C1344,160,1248,160,1152,160C1056,160,960,160,864,160C768,160,672,160,576,160C480,160,384,160,288,160C192,160,96,160,48,160L0,160Z"
            />
          </svg>
        </div>
      </section>

      <div className="fixed bottom-10 left-10 z-50 hidden md:block">
        <div className="bg-gradient-to-r from-primary to-cyan-500 text-white p-4 rounded-full shadow-lg cursor-pointer hover:scale-110 transition-transform duration-300 border-2 border-white/20">
          <Brain className="h-6 w-6" />
        </div>
      </div>
    </main>
  )
}
