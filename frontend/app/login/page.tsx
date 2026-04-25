"use client"

import type React from "react"
import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { CheckCircle, AlertCircle } from "lucide-react"
import { login, toAccountType, type AuthRole } from "@/lib/api"
import { PortalI18nProvider, usePortalI18n } from "@/lib/i18n/i18n-context"
import { SiteHeader } from "@/components/site-header"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = usePortalI18n()
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    role: "specialist" as AuthRole,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const roleFromQuery = (searchParams.get("role") || "").toLowerCase()
  const preselectedRole: AuthRole =
    roleFromQuery === "parent"
      ? "parent"
      : roleFromQuery === "administration"
        ? "administration"
        : roleFromQuery === "therapist" || roleFromQuery === "specialist"
          ? "specialist"
          : "specialist"

  useEffect(() => {
    setFormData((prev) => (prev.role === preselectedRole ? prev : { ...prev, role: preselectedRole }))
  }, [preselectedRole])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.id]: e.target.value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setMessage(null)

    if (!formData.email || !formData.password) {
      setMessage({ type: "error", text: t("auth.validation.fillAll") })
      setIsLoading(false)
      return
    }

    try {
      const user = await login(formData.email, formData.password, formData.role)

      const storedUser = {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        accountType: toAccountType(user.role),
        role: user.role,
        auth_token: user.auth_token,
        ...((user.role === "specialist" || user.role === "parent" || user.role === "administration") &&
        user.preferred_locale
          ? { preferred_locale: user.preferred_locale }
          : {}),
        ...(user.role === "parent" ? { account_kind: user.account_kind ?? "linked" } : {}),
      }
      localStorage.setItem("adhdAssistCurrentUser", JSON.stringify(storedUser))
      if (
        (user.role === "specialist" || user.role === "parent" || user.role === "administration") &&
        typeof document !== "undefined"
      ) {
        const loc = user.preferred_locale === "fr" || user.preferred_locale === "en" ? user.preferred_locale : "ar"
        document.documentElement.lang = loc
        document.documentElement.dir = loc === "ar" ? "rtl" : "ltr"
      }

      setMessage({ type: "success", text: t("auth.success.login") })
      const target = user.role === "specialist" ? "/orthophoniste" : user.role === "administration" ? "/administration" : "/dashboard"
      setTimeout(() => router.replace(target), 600)
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : t("auth.error.loginFailed") })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="app-shell flex flex-1 items-center justify-center px-4 py-12">
      <Card className="surface-card w-full max-w-md border-border/70 shadow-xl">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-cyan-500">
            {t("auth.login.title")}
          </CardTitle>
          <CardDescription>{t("auth.login.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {message && (
            <Alert
              className={`mb-4 ${message.type === "success" ? "border-emerald-300/60 bg-emerald-50/80 dark:bg-emerald-950/20" : "border-red-300/60 bg-red-50/80 dark:bg-red-950/20"}`}
            >
              {message.type === "success" ? <CheckCircle className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4 text-red-600" />}
              <AlertDescription className={message.type === "success" ? "text-green-800 dark:text-green-200" : "text-red-800 dark:text-red-200"}>
                {message.text}
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">{t("auth.label.email")}</Label>
                <Input id="email" type="email" placeholder={t("auth.placeholder.email")} value={formData.email} onChange={handleInputChange} required />
              </div>
              <div className="grid gap-2">
                <Label>{t("auth.label.accountType")}</Label>
                <RadioGroup
                  value={formData.role}
                  onValueChange={(v) => setFormData({ ...formData, role: v as AuthRole })}
                  className="flex flex-wrap gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="specialist" id="specialist" />
                    <Label htmlFor="specialist" className="font-normal">
                      {t("auth.role.specialist")}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="parent" id="parent" />
                    <Label htmlFor="parent" className="font-normal">
                      {t("auth.role.parent")}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="administration" id="administration" />
                    <Label htmlFor="administration" className="font-normal">
                      {t("auth.role.administration")}
                    </Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">{t("auth.label.password")}</Label>
                <Input id="password" type="password" value={formData.password} onChange={handleInputChange} required />
              </div>
              <Button type="submit" className="w-full bg-gradient-to-r from-primary to-cyan-500 shadow-sm" disabled={isLoading}>
                {isLoading ? t("auth.login.submitting") : t("auth.login.submit")}
              </Button>
            </div>
          </form>
        </CardContent>
        <CardFooter>
          <p className="text-sm text-muted-foreground text-center w-full">
            {t("auth.login.footerNoAccount")}{" "}
            <Link href="/register" className="text-primary underline-offset-4 hover:underline">
              {t("auth.login.footerRegisterLink")}
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}

function LoginLoading() {
  const { t } = usePortalI18n()
  return (
    <div className="app-shell flex min-h-[40vh] flex-1 items-center justify-center px-4 text-sm text-muted-foreground">
      {t("auth.loadingPage")}
    </div>
  )
}

export default function LoginPage() {
  return (
    <PortalI18nProvider role="public">
      <div className="flex min-h-screen flex-col">
        <SiteHeader variant="login" />
        <Suspense fallback={<LoginLoading />}>
          <LoginForm />
        </Suspense>
      </div>
    </PortalI18nProvider>
  )
}
