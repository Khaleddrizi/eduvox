"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { CheckCircle, AlertCircle } from "lucide-react"
import { login, toAccountType, type AuthRole } from "@/lib/api"

export default function LoginPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    role: "specialist" as AuthRole,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.id]: e.target.value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setMessage(null)

    if (!formData.email || !formData.password) {
      setMessage({ type: "error", text: "يرجى تعبئة جميع الحقول" })
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
      }
      localStorage.setItem("adhdAssistCurrentUser", JSON.stringify(storedUser))

      setMessage({ type: "success", text: "تم تسجيل الدخول بنجاح! جاري التوجيه..." })
      const target = user.role === "specialist" ? "/orthophoniste" : user.role === "administration" ? "/administration" : "/dashboard"
      setTimeout(() => router.replace(target), 600)
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "فشل تسجيل الدخول." })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="app-shell flex items-center justify-center px-4 py-12">
      <Card className="surface-card w-full max-w-md border-border/70 shadow-xl">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-cyan-500">
            تسجيل الدخول
          </CardTitle>
          <CardDescription>أدخل بياناتك للوصول إلى حسابك</CardDescription>
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
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input id="email" type="email" placeholder="example@domain.com" value={formData.email} onChange={handleInputChange} required />
              </div>
              <div className="grid gap-2">
                <Label>نوع الحساب</Label>
                <RadioGroup
                  value={formData.role}
                  onValueChange={(v) => setFormData({ ...formData, role: v as AuthRole })}
                  className="flex flex-wrap gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="specialist" id="specialist" />
                    <Label htmlFor="specialist" className="font-normal">أخصائي (طبيب)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="parent" id="parent" />
                    <Label htmlFor="parent" className="font-normal">ولي أمر</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="administration" id="administration" />
                    <Label htmlFor="administration" className="font-normal">إدارة</Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">كلمة المرور</Label>
                <Input id="password" type="password" value={formData.password} onChange={handleInputChange} required />
              </div>
              <Button type="submit" className="w-full bg-gradient-to-r from-primary to-cyan-500 shadow-sm" disabled={isLoading}>
                {isLoading ? "جاري تسجيل الدخول..." : "تسجيل الدخول"}
              </Button>
            </div>
          </form>
        </CardContent>
        <CardFooter>
          <p className="text-sm text-muted-foreground text-center w-full">
            ليس لديك حساب مهني؟{" "}
            <Link href="/register" className="text-primary underline-offset-4 hover:underline">
              إنشاء حساب مهني
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
