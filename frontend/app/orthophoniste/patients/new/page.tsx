"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AuthGuard } from "@/components/auth-guard"
import { AdminIssuesStrip } from "@/components/admin/admin-entity-pages"
import { fetchApi, getAuthHeaders, publicApiBase } from "@/lib/api"
import { usePortalI18n } from "@/lib/i18n/i18n-context"
import { toast } from "sonner"
import { Users, UserPlus, Loader2, Copy, Check } from "lucide-react"

const ADHD_LEVELS = ["Mild", "Moderate", "Severe"] as const

interface TrainingProgram {
  id: number
  name: string
  status: string
  question_count: number
}

interface ParentLookupChild {
  id: number
  name: string
  age: number | null
  diagnostic?: string | null
  alexa_code?: string | null
}

interface SpecialistMeProfile {
  subscription?: {
    billing_exempt: boolean
    new_program_assign_blocked: boolean
  }
}

interface ParentLookupResult {
  exists: boolean
  conflict_role?: "specialist"
  parent: {
    id: number
    email: string
    full_name: string | null
    phone?: string | null
  } | null
  children: ParentLookupChild[]
}

function levelLabel(level: (typeof ADHD_LEVELS)[number], t: (key: string) => string) {
  if (level === "Mild") return t("common.severityMild")
  if (level === "Moderate") return t("common.severityModerate")
  return t("common.severitySevere")
}

function AddPatientPage() {
  const router = useRouter()
  const { t } = usePortalI18n()
  const [loading, setLoading] = useState(false)
  const [childName, setChildName] = useState("")
  const [childAge, setChildAge] = useState<number | "">("")
  const [adhdLevel, setAdhdLevel] = useState<string>("")
  const [parentName, setParentName] = useState("")
  const [parentEmail, setParentEmail] = useState("")
  const [parentPhone, setParentPhone] = useState("")
  const [programs, setPrograms] = useState<TrainingProgram[]>([])
  const [selectedProgramId, setSelectedProgramId] = useState("none")
  const [parentLookup, setParentLookup] = useState<ParentLookupResult | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [successData, setSuccessData] = useState<{ tempPassword?: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [meProfile, setMeProfile] = useState<SpecialistMeProfile | null>(null)

  const assignBlocked =
    !!(meProfile?.subscription?.new_program_assign_blocked && !meProfile?.subscription?.billing_exempt)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [libRes, meRes] = await Promise.allSettled([
        fetchApi<TrainingProgram[]>("/api/specialists/library"),
        fetchApi<SpecialistMeProfile>("/api/specialists/me"),
      ])
      if (cancelled) return
      if (libRes.status === "fulfilled") {
        setPrograms((libRes.value || []).filter((item) => item.status === "ready"))
      } else {
        setPrograms([])
      }
      if (meRes.status === "fulfilled") {
        setMeProfile(meRes.value)
      } else {
        setMeProfile(null)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!meProfile) return
    const blocked = !!(
      meProfile.subscription?.new_program_assign_blocked && !meProfile.subscription?.billing_exempt
    )
    if (blocked) {
      setSelectedProgramId((cur) => (cur !== "none" ? "none" : cur))
    }
  }, [meProfile])

  useEffect(() => {
    const email = parentEmail.trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setParentLookup(null)
      setLookupLoading(false)
      return
    }

    let cancelled = false
    setLookupLoading(true)
    const timer = window.setTimeout(async () => {
      try {
        const result = await fetchApi<ParentLookupResult>(`/api/doctor/parent-lookup?email=${encodeURIComponent(email)}`)
        if (cancelled) return
        setParentLookup(result)
        if (result.exists && result.parent) {
          setParentName(result.parent.full_name || "")
          setParentPhone(result.parent.phone || "")
        }
      } catch {
        if (!cancelled) setParentLookup(null)
      } finally {
        if (!cancelled) setLookupLoading(false)
      }
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [parentEmail])

  const validate = (): boolean => {
    const err: Record<string, string> = {}
    if (!childName.trim()) err.childName = t("newPatient.errChildName")
    const age = childAge === "" ? NaN : Number(childAge)
    if (isNaN(age) || age < 1 || age > 18) err.childAge = t("newPatient.errChildAge")
    if (!adhdLevel) err.adhdLevel = t("newPatient.errAdhd")
    if (!parentName.trim() && !parentLookup?.exists) err.parentName = t("newPatient.errParentName")
    if (!parentEmail.trim()) err.parentEmail = t("newPatient.errParentEmail")
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) err.parentEmail = t("newPatient.errEmailFmt")
    if (parentLookup?.conflict_role === "specialist") err.parentEmail = t("newPatient.errEmailSpecialist")
    setErrors(err)
    return Object.keys(err).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate() || loading) return
    setLoading(true)
    setErrors({})
    try {
      const res = await fetch(`${publicApiBase}/api/doctor/add-patient`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          child: {
            name: childName.trim(),
            age: Number(childAge),
            adhd_level: adhdLevel,
            assigned_program_id:
              assignBlocked || selectedProgramId === "none" ? undefined : Number(selectedProgramId),
          },
          parent: {
            name: parentName.trim(),
            email: parentEmail.trim().toLowerCase(),
            phone: parentPhone.trim() || undefined,
          },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          data.error ||
          (res.status === 404 ? t("newPatient.errApi404") : t("newPatient.errAddFail"))
        setLoading(false)
        alert(msg)
        return
      }
      setLoading(false)
      if (data.parent_temp_password) {
        setSuccessData({ tempPassword: data.parent_temp_password })
      } else {
        const familyCount = typeof data.family_children_count === "number" ? data.family_children_count : null
        toast.success(
          data.parent_created
            ? t("newPatient.msgAddedLinked")
            : familyCount && familyCount > 1
              ? t("newPatient.msgAddedFamily").replace("{n}", String(familyCount))
              : t("newPatient.msgAddedLogin"),
        )
        router.push("/orthophoniste/patients")
      }
    } catch (err) {
      setLoading(false)
      const msg = err instanceof Error ? err.message : t("newPatient.errNetwork")
      alert(`${msg}\n\n${t("newPatient.errBackendHint")}`)
    }
  }

  const handleCopyPassword = async () => {
    if (successData?.tempPassword) {
      await navigator.clipboard.writeText(successData.tempPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleCloseSuccess = () => {
    setSuccessData(null)
    toast.success(t("newPatient.toastOk"))
    router.push("/orthophoniste/patients")
  }

  return (
    <div>
      {successData?.tempPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="surface-card max-w-md w-full border-2 border-emerald-500/30 shadow-xl">
            <CardHeader className="bg-emerald-50/50 dark:bg-emerald-950/30 border-b">
              <CardTitle className="text-emerald-800 dark:text-emerald-200">{t("newPatient.successTitle")}</CardTitle>
              <p className="text-sm text-muted-foreground">{t("newPatient.successHint")}</p>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div>
                <Label className="text-sm font-medium">{t("newPatient.tempPw")}</Label>
                <div className="mt-2 flex gap-2">
                  <Input
                    readOnly
                    value={successData.tempPassword}
                    className="font-mono bg-muted"
                  />
                  <Button type="button" variant="outline" size="icon" onClick={handleCopyPassword} title={t("newPatient.copyTitle")}>
                    {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <Button className="w-full" onClick={handleCloseSuccess}>{t("newPatient.doneBtn")}</Button>
            </CardContent>
          </Card>
        </div>
      )}
      <div className="max-w-4xl">
        <Card className="surface-card border-slate-200 dark:border-slate-700 shadow-md">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
            <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <UserPlus className="h-5 w-5 text-primary" />
              {t("newPatient.title")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{t("newPatient.subtitle")}</p>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
                <div className="space-y-5 sm:space-y-6">
                  <h3 className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-200">
                    <Users className="h-4 w-4 text-primary" />
                    {t("newPatient.sectionChild")}
                  </h3>
                  <div className="space-y-2">
                    <Label htmlFor="childName" className="text-slate-700 dark:text-slate-300">{t("newPatient.childName")}</Label>
                    <Input
                      id="childName"
                      type="text"
                      placeholder={t("newPatient.childNamePh")}
                      value={childName}
                      onChange={(e) => setChildName(e.target.value)}
                      className={`border-slate-200 dark:border-slate-600 focus:ring-2 focus:ring-primary/20 ${errors.childName ? "border-red-500" : ""}`}
                    />
                    {errors.childName && <p className="text-sm text-red-600 dark:text-red-400">{errors.childName}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="childAge" className="text-slate-700 dark:text-slate-300">{t("newPatient.childAge")}</Label>
                    <Input
                      id="childAge"
                      type="number"
                      min={1}
                      max={18}
                      placeholder={t("newPatient.childAgePh")}
                      value={childAge === "" ? "" : childAge}
                      onChange={(e) => setChildAge(e.target.value === "" ? "" : parseInt(e.target.value, 10))}
                      className={`border-slate-200 dark:border-slate-600 focus:ring-2 focus:ring-primary/20 ${errors.childAge ? "border-red-500" : ""}`}
                    />
                    {errors.childAge && <p className="text-sm text-red-600 dark:text-red-400">{errors.childAge}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="adhdLevel" className="text-slate-700 dark:text-slate-300">{t("newPatient.adhdLevel")}</Label>
                    <Select value={adhdLevel} onValueChange={setAdhdLevel}>
                      <SelectTrigger className={`border-slate-200 dark:border-slate-600 focus:ring-2 focus:ring-primary/20 ${errors.adhdLevel ? "border-red-500" : ""}`}>
                        <SelectValue placeholder={t("newPatient.adhdPh")} />
                      </SelectTrigger>
                      <SelectContent>
                        {ADHD_LEVELS.map((level) => (
                          <SelectItem key={level} value={level}>{levelLabel(level, t)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.adhdLevel && <p className="text-sm text-red-600 dark:text-red-400">{errors.adhdLevel}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="assignedProgram" className="text-slate-700 dark:text-slate-300">{t("newPatient.program")}</Label>
                    {assignBlocked ? (
                      <AdminIssuesStrip variant="danger" icon={<Lock className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden />}>
                        {t("patientDetail.subscriptionAssignBlocked")}
                      </AdminIssuesStrip>
                    ) : null}
                    <Select value={selectedProgramId} onValueChange={setSelectedProgramId} disabled={assignBlocked}>
                      <SelectTrigger id="assignedProgram" className="border-slate-200 dark:border-slate-600 focus:ring-2 focus:ring-primary/20">
                        <SelectValue placeholder={t("newPatient.programPh")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("newPatient.programLater")}</SelectItem>
                        {programs.map((program) => (
                          <SelectItem key={program.id} value={String(program.id)}>
                            {program.name} ({program.question_count} {t("common.questions")})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{t("newPatient.programAlexaHint")}</p>
                  </div>
                </div>

                <div className="space-y-5 sm:space-y-6">
                  <h3 className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-200">
                    <UserPlus className="h-4 w-4 text-primary" />
                    {t("newPatient.sectionParent")}
                  </h3>
                  <div className="space-y-2">
                    <Label htmlFor="parentName" className="text-slate-700 dark:text-slate-300">{t("newPatient.parentName")}</Label>
                    <Input
                      id="parentName"
                      type="text"
                      placeholder={t("newPatient.parentNamePh")}
                      value={parentName}
                      onChange={(e) => setParentName(e.target.value)}
                      className={`border-slate-200 dark:border-slate-600 focus:ring-2 focus:ring-primary/20 ${errors.parentName ? "border-red-500" : ""}`}
                    />
                    {errors.parentName && <p className="text-sm text-red-600 dark:text-red-400">{errors.parentName}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="parentEmail" className="text-slate-700 dark:text-slate-300">{t("newPatient.parentEmail")} <span className="text-red-500">*</span></Label>
                    <Input
                      id="parentEmail"
                      type="email"
                      placeholder="parent@example.com"
                      value={parentEmail}
                      onChange={(e) => setParentEmail(e.target.value)}
                      className={`border-slate-200 dark:border-slate-600 focus:ring-2 focus:ring-primary/20 ${errors.parentEmail ? "border-red-500" : ""}`}
                    />
                    {errors.parentEmail && <p className="text-sm text-red-600 dark:text-red-400">{errors.parentEmail}</p>}
                    {lookupLoading ? (
                      <p className="text-xs text-muted-foreground">{t("newPatient.lookupLoading")}</p>
                    ) : parentLookup?.exists && parentLookup.parent ? (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100">
                        <p className="font-medium">{t("newPatient.lookupFound")}</p>
                        <p className="mt-1">
                          {t("newPatient.lookupLink").replace(
                            "{name}",
                            parentLookup.parent.full_name || parentLookup.parent.email,
                          )}
                        </p>
                        {parentLookup.children.length > 0 ? (
                          <div className="mt-2">
                            <p className="text-xs uppercase tracking-wide opacity-80">{t("newPatient.lookupChildrenTitle")}</p>
                            <div className="mt-1 flex flex-wrap gap-2">
                              {parentLookup.children.map((child) => (
                                <span key={child.id} className="rounded-full bg-white/80 px-2.5 py-1 text-xs text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100">
                                  {child.name} {child.age ? `(${child.age})` : ""}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="mt-2 text-xs opacity-80">{t("newPatient.lookupNoChildren")}</p>
                        )}
                      </div>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="parentPhone" className="text-slate-700 dark:text-slate-300">{t("newPatient.parentPhone")}</Label>
                    <Input
                      id="parentPhone"
                      type="tel"
                      placeholder="+33 6 12 34 56 78"
                      value={parentPhone}
                      onChange={(e) => setParentPhone(e.target.value)}
                      className="border-slate-200 dark:border-slate-600 focus:ring-2 focus:ring-primary/20"
                    />
                    {parentLookup?.exists ? (
                      <p className="text-xs text-muted-foreground">{t("newPatient.prefillHint")}</p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto sm:px-8 bg-primary hover:bg-primary/90"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t("newPatient.submitting")}
                    </>
                  ) : (
                    t("newPatient.submit")
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function Page() {
  return (
    <AuthGuard requiredAccountType="therapist">
      <AddPatientPage />
    </AuthGuard>
  )
}
