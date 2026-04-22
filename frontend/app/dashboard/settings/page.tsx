"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AuthGuard } from "@/components/auth-guard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { fetchApi, getAuthHeaders, publicApiBase, type SpecialistLocale } from "@/lib/api"
import { toast } from "sonner"
import { usePortalI18n, notifyLocaleChanged } from "@/lib/i18n/i18n-context"
import { ProfileAvatar } from "@/components/profile-avatar"
import { useProfileAvatarUpload } from "@/hooks/use-profile-avatar-upload"
import {
  UserCircle2,
  Lock,
  Users,
  TriangleAlert,
  Check,
  X,
  Eye,
  EyeOff,
  Camera,
  User,
  LogOut,
  Trash2,
  Bell,
  Globe2,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface ParentProfile {
  id: number
  email: string
  full_name: string | null
  phone?: string | null
  created_at?: string | null
  preferred_locale?: string
  country?: string | null
  state_region?: string | null
  address_line?: string | null
}

interface ApiChild {
  id: number
  name: string
  age: number | null
  diagnostic?: string | null
  alexa_code?: string | null
  stats: { total_sessions: number; avg_accuracy: number }
}

type ParentNav = "profile" | "password" | "notifications" | "language" | "children" | "danger"

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return "P"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function childInitial(name: string) {
  return (name.trim()[0] || "?").toUpperCase()
}

function passwordStrengthScore(password: string): 0 | 1 | 2 | 3 | 4 {
  if (!password) return 0
  if (password.length < 6) return 1
  const hasUpper = /[A-Z]/.test(password)
  const hasNumber = /\d/.test(password)
  const hasSpecial = /[^A-Za-z0-9]/.test(password)
  if (password.length >= 8 && hasUpper && hasNumber && hasSpecial) return 4
  if (password.length >= 8 && hasNumber) return 3
  return 2
}

function statusFrom(stats: ApiChild["stats"], t: (key: string) => string) {
  if (!stats.total_sessions || stats.avg_accuracy < 30)
    return { label: t("dashboard.childNeeds"), cls: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200" }
  if (stats.avg_accuracy < 70)
    return { label: t("dashboard.childMonitor"), cls: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100" }
  return { label: t("dashboard.childOnTrack"), cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" }
}

const inputClass =
  "bg-[#f9fafb] border-slate-200 focus-visible:border-[#1a8fe3] focus-visible:ring-[#1a8fe3]/30 dark:bg-slate-900/50 dark:border-slate-700"

function ParentProfilePageContent() {
  const router = useRouter()
  const { t, refreshLocale } = usePortalI18n()
  const avatarMessages = useMemo(
    () => ({
      ok: t("settings.toastPhotoOk"),
      err: t("settings.toastPhotoErr"),
      badType: t("settings.toastPhotoType"),
      tooBig: t("settings.toastPhotoSize"),
    }),
    [t],
  )
  const { version: avatarVersion, uploading: avatarUploading, pickFile: pickAvatar, fileInput: avatarFileInput } =
    useProfileAvatarUpload("/api/parents/me/avatar", avatarMessages)
  const [loading, setLoading] = useState(true)
  const [childrenLoading, setChildrenLoading] = useState(true)
  const [linkedChildren, setLinkedChildren] = useState<ApiChild[]>([])
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [activeNav, setActiveNav] = useState<ParentNav>("profile")
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState("")

  const [profile, setProfile] = useState({
    full_name: "",
    email: "",
    phone: "",
  })
  const [passwords, setPasswords] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  })
  const [prefs, setPrefs] = useState({
    preferred_locale: "ar" as SpecialistLocale,
    country: "",
    state_region: "",
    address_line: "",
  })

  function syncStoredUser(full_name: string, email: string, preferred_locale?: string) {
    const raw = localStorage.getItem("adhdAssistCurrentUser")
    if (!raw) return
    try {
      const user = JSON.parse(raw)
      user.full_name = full_name
      user.email = email
      if (preferred_locale) user.preferred_locale = preferred_locale
      localStorage.setItem("adhdAssistCurrentUser", JSON.stringify(user))
    } catch {
      //
    }
  }

  useEffect(() => {
    async function loadProfile() {
      try {
        const data = await fetchApi<ParentProfile>("/api/parents/me")
        setProfile({
          full_name: data.full_name || "",
          email: data.email || "",
          phone: data.phone || "",
        })
        const loc = data.preferred_locale === "fr" || data.preferred_locale === "en" ? data.preferred_locale : "ar"
        setPrefs({
          preferred_locale: loc,
          country: data.country || "",
          state_region: data.state_region || "",
          address_line: data.address_line || "",
        })
        syncStoredUser(data.full_name || "", data.email, loc)
        notifyLocaleChanged()
        refreshLocale()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("settings.toastProfileLoad"))
      } finally {
        setLoading(false)
      }
    }
    loadProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only profile load
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadChildren() {
      try {
        const res = await fetch(`${publicApiBase}/api/parents/children`, { headers: getAuthHeaders() })
        if (!res.ok || cancelled) return
        const data: ApiChild[] = await res.json()
        if (!cancelled) setLinkedChildren(data)
      } catch {
        //
      } finally {
        if (!cancelled) setChildrenLoading(false)
      }
    }
    loadChildren()
    return () => {
      cancelled = true
    }
  }, [])

  const scrollToSection = useCallback((id: ParentNav) => {
    setActiveNav(id)
    const el = document.getElementById(`parent-settings-${id}`)
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingProfile(true)
    try {
      const data = await fetchApi<ParentProfile>("/api/parents/me", {
        method: "PUT",
        body: JSON.stringify(profile),
      })
      syncStoredUser(data.full_name || "", data.email, data.preferred_locale)
      toast.success(t("settings.toastProfileOk"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.toastProfileErr"))
    } finally {
      setSavingProfile(false)
    }
  }

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (passwords.new_password !== passwords.confirm_password) {
      toast.error(t("settings.toastPwMismatch"))
      return
    }
    setSavingPassword(true)
    try {
      const data = await fetchApi<{ message: string }>("/api/parents/change-password", {
        method: "PUT",
        body: JSON.stringify({
          current_password: passwords.current_password,
          new_password: passwords.new_password,
        }),
      })
      toast.success(data.message)
      setPasswords({ current_password: "", new_password: "", confirm_password: "" })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.toastPwErr"))
    } finally {
      setSavingPassword(false)
    }
  }

  const handleLogoutEverywhere = () => {
    localStorage.removeItem("adhdAssistCurrentUser")
    toast.success(t("settings.toastLogout"))
    router.replace("/login?role=parent")
  }

  const handlePreferencesSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingPrefs(true)
    try {
      const data = await fetchApi<ParentProfile>("/api/parents/me", {
        method: "PUT",
        body: JSON.stringify({
          preferred_locale: prefs.preferred_locale,
          country: prefs.country.trim() || null,
          state_region: prefs.state_region.trim() || null,
          address_line: prefs.address_line.trim() || null,
        }),
      })
      const loc = data.preferred_locale === "fr" || data.preferred_locale === "en" ? data.preferred_locale : "ar"
      setPrefs((p) => ({
        ...p,
        preferred_locale: loc,
        country: data.country || "",
        state_region: data.state_region || "",
        address_line: data.address_line || "",
      }))
      syncStoredUser(profile.full_name, profile.email, loc)
      notifyLocaleChanged()
      refreshLocale()
      toast.success(t("settings.toastPrefsOk"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.toastPrefsErr"))
    } finally {
      setSavingPrefs(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (!deletePassword.trim()) {
      toast.error(t("settings.toastDeletePw"))
      return
    }
    setDeleting(true)
    try {
      await fetchApi<{ message: string }>("/api/parents/me", {
        method: "DELETE",
        body: JSON.stringify({ current_password: deletePassword }),
      })
      localStorage.removeItem("adhdAssistCurrentUser")
      toast.success(t("settings.toastDeleteOk"))
      setDeleteDialogOpen(false)
      router.replace("/")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.toastDeleteErr"))
    } finally {
      setDeleting(false)
    }
  }

  const strengthScore = passwordStrengthScore(passwords.new_password)
  const pwStrengthKeys = ["settings.pwEmpty", "settings.pwWeak", "settings.pwFair", "settings.pwGood", "settings.pwStrong"] as const
  const passwordsMatch = Boolean(passwords.confirm_password) && passwords.new_password === passwords.confirm_password
  const passwordsMismatch = Boolean(passwords.confirm_password) && passwords.new_password !== passwords.confirm_password
  const parentDisplayName = profile.full_name || profile.email || t("common.parent")

  const navBtn = (active: boolean, isDanger?: boolean) =>
    cn(
      "w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors text-left",
      isDanger
        ? active
          ? "bg-red-50 text-red-700 dark:bg-red-950/30"
          : "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/20"
        : active
          ? "bg-[#EBF5FE] text-[#1a8fe3]"
          : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/60",
    )

  return (
    <div className="max-w-6xl min-w-0 w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white md:text-3xl">{t("settings.pageTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("settings.pageHint")}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[180px_1fr] lg:items-start">
        <aside className="lg:sticky lg:top-6 self-start">
          <nav className="space-y-5 rounded-xl border border-slate-200/80 bg-white/80 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
            <div>
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("settings.navAccount")}</p>
              <div className="space-y-1">
                <button type="button" onClick={() => scrollToSection("profile")} className={navBtn(activeNav === "profile")}>
                  <UserCircle2 className="h-4 w-4 shrink-0" />
                  {t("settings.navProfile")}
                </button>
                <button type="button" onClick={() => scrollToSection("password")} className={navBtn(activeNav === "password")}>
                  <Lock className="h-4 w-4 shrink-0" />
                  {t("settings.navPassword")}
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection("notifications")}
                  className={navBtn(activeNav === "notifications")}
                >
                  <Bell className="h-4 w-4 shrink-0" />
                  {t("settings.navNotifications")}
                </button>
                <button type="button" onClick={() => scrollToSection("language")} className={navBtn(activeNav === "language")}>
                  <Globe2 className="h-4 w-4 shrink-0" />
                  {t("settings.navLanguage")}
                </button>
                <button type="button" onClick={() => scrollToSection("children")} className={navBtn(activeNav === "children")}>
                  <Users className="h-4 w-4 shrink-0" />
                  {t("settings.navChildren")}
                </button>
              </div>
            </div>
            <div>
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("settings.navDanger")}</p>
              <button type="button" onClick={() => scrollToSection("danger")} className={navBtn(activeNav === "danger", true)}>
                <TriangleAlert className="h-4 w-4 shrink-0" />
                {t("settings.navDelete")}
              </button>
            </div>
          </nav>
        </aside>

        <div className="flex flex-col gap-[14px]">
          <Card id="parent-settings-profile" className="surface-card scroll-mt-6">
            <CardHeader className="border-b border-slate-100 pb-4 dark:border-slate-800">
              <div className="flex items-start gap-3">
                <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-[#EBF5FE]">
                  <User className="h-4 w-4 text-[#1a8fe3]" />
                </div>
                <div>
                  <CardTitle className="text-base font-bold">{t("settings.profileTitle")}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("settings.profileHint")}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-5">
              {loading ? (
                <p className="text-sm text-muted-foreground">{t("settings.profileLoading")}</p>
              ) : (
                <form className="space-y-0" onSubmit={handleProfileSave}>
                  {avatarFileInput}
                  <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
                    <div className="flex items-center gap-4 min-w-0">
                      <ProfileAvatar
                        apiPath="/api/parents/me/avatar"
                        initials={initialsFromName(parentDisplayName)}
                        version={avatarVersion}
                        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white bg-[#1a8fe3] border-2 border-slate-200/80 dark:border-slate-600"
                      />
                      <div className="min-w-0">
                        <p className="text-[15px] font-bold text-slate-900 dark:text-white truncate">{parentDisplayName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{t("settings.roleBadge")}</p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 border-[#1a8fe3] text-[#1a8fe3] hover:bg-[#EBF5FE] self-start sm:self-center"
                      onClick={pickAvatar}
                      disabled={avatarUploading}
                    >
                      <Camera className="h-4 w-4 mr-1.5" />
                      {avatarUploading ? t("common.saving") : t("settings.changePhoto")}
                    </Button>
                  </div>

                  <div className="grid gap-4 pt-5 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="full_name">{t("settings.fullName")}</Label>
                      <Input
                        id="full_name"
                        value={profile.full_name}
                        onChange={(e) => setProfile((p) => ({ ...p, full_name: e.target.value }))}
                        className={inputClass}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="phone">{t("settings.phone")}</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={profile.phone}
                        onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2 pt-4 md:col-span-2">
                    <Label htmlFor="email">{t("settings.email")}</Label>
                    <Input
                      id="email"
                      type="email"
                      value={profile.email}
                      onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                      required
                      className={inputClass}
                    />
                  </div>

                  <Button type="submit" disabled={savingProfile} className="mt-5 bg-[#1a8fe3] hover:bg-[#1578c4] text-white">
                    <Check className="h-4 w-4 mr-2" />
                    {savingProfile ? t("common.saving") : t("settings.saveChanges")}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <Card id="parent-settings-password" className="surface-card scroll-mt-6">
            <CardHeader className="border-b border-slate-100 pb-4 dark:border-slate-800">
              <div className="flex items-start gap-3">
                <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-[#EBF5FE]">
                  <Lock className="h-4 w-4 text-[#1a8fe3]" />
                </div>
                <div>
                  <CardTitle className="text-base font-bold">{t("settings.passwordTitle")}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("settings.passwordHint")}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-5">
              <form className="space-y-4" onSubmit={handlePasswordSave}>
                <div className="grid gap-2">
                  <Label htmlFor="current_password">{t("settings.currentPassword")}</Label>
                  <div className="relative">
                    <Input
                      id="current_password"
                      type={showCurrentPassword ? "text" : "password"}
                      value={passwords.current_password}
                      onChange={(e) => setPasswords((p) => ({ ...p, current_password: e.target.value }))}
                      required
                      className={cn(inputClass, "pr-10")}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowCurrentPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="new_password">{t("settings.newPassword")}</Label>
                  <div className="relative">
                    <Input
                      id="new_password"
                      type={showNewPassword ? "text" : "password"}
                      value={passwords.new_password}
                      onChange={(e) => setPasswords((p) => ({ ...p, new_password: e.target.value }))}
                      required
                      className={cn(inputClass, "pr-10")}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowNewPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="mt-1">
                    <p className="text-[11px] text-muted-foreground mb-1.5">{t("settings.pwStrength")}</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[1, 2, 3, 4].map((lvl) => (
                        <span
                          key={lvl}
                          className={cn(
                            "h-1.5 rounded",
                            strengthScore >= lvl
                              ? strengthScore === 1
                                ? "bg-red-500"
                                : strengthScore <= 3
                                  ? "bg-amber-500"
                                  : "bg-emerald-500"
                              : "bg-slate-200 dark:bg-slate-700",
                          )}
                        />
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">{t(pwStrengthKeys[strengthScore])}</p>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="confirm_password">{t("settings.confirmPassword")}</Label>
                  <div className="relative">
                    <Input
                      id="confirm_password"
                      type={showConfirmPassword ? "text" : "password"}
                      value={passwords.confirm_password}
                      onChange={(e) => setPasswords((p) => ({ ...p, confirm_password: e.target.value }))}
                      required
                      className={cn(inputClass, "pr-10")}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {passwords.confirm_password ? (
                    <div className="flex items-center gap-1.5 text-[11px]">
                      {passwordsMatch ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-emerald-700 dark:text-emerald-400">{t("settings.pwMatchOk")}</span>
                        </>
                      ) : (
                        <>
                          <X className="h-3.5 w-3.5 text-red-600" />
                          <span className="text-red-600">{t("settings.pwMatchBad")}</span>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>

                <Button
                  type="submit"
                  variant="outline"
                  disabled={savingPassword}
                  className="mt-1 bg-white text-slate-900 border-slate-300 hover:bg-slate-50 dark:bg-slate-950 dark:text-slate-100 dark:border-slate-600"
                >
                  {savingPassword ? t("settings.updating") : t("settings.updatePassword")}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card id="parent-settings-notifications" className="surface-card scroll-mt-6">
            <CardHeader className="border-b border-slate-100 pb-4 dark:border-slate-800">
              <div className="flex items-start gap-3">
                <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-[#EBF5FE]">
                  <Bell className="h-4 w-4 text-[#1a8fe3]" />
                </div>
                <div>
                  <CardTitle className="text-base font-bold">{t("settings.notificationsTitle")}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("settings.notificationsHint")}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">{t("settings.notificationsSoon")}</p>
            </CardContent>
          </Card>

          <Card id="parent-settings-language" className="surface-card scroll-mt-6">
            <CardHeader className="border-b border-slate-100 pb-4 dark:border-slate-800">
              <div className="flex items-start gap-3">
                <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-[#EBF5FE]">
                  <Globe2 className="h-4 w-4 text-[#1a8fe3]" />
                </div>
                <div>
                  <CardTitle className="text-base font-bold">{t("settings.langTitle")}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("settings.langHint")}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-5">
              <form className="space-y-4" onSubmit={handlePreferencesSave}>
                <div className="grid gap-2">
                  <Label htmlFor="preferred_locale">{t("settings.langUi")}</Label>
                  <Select
                    value={prefs.preferred_locale}
                    onValueChange={(v) => setPrefs((p) => ({ ...p, preferred_locale: v as SpecialistLocale }))}
                  >
                    <SelectTrigger id="preferred_locale" className={cn(inputClass, "max-w-md")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ar">{t("settings.langAr")}</SelectItem>
                      <SelectItem value="fr">{t("settings.langFr")}</SelectItem>
                      <SelectItem value="en">{t("settings.langEn")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">{t("settings.langNote")}</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="country">{t("settings.country")}</Label>
                    <Input
                      id="country"
                      value={prefs.country}
                      onChange={(e) => setPrefs((p) => ({ ...p, country: e.target.value }))}
                      className={inputClass}
                      placeholder={t("settings.countryPh")}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="state_region">{t("settings.region")}</Label>
                    <Input
                      id="state_region"
                      value={prefs.state_region}
                      onChange={(e) => setPrefs((p) => ({ ...p, state_region: e.target.value }))}
                      className={inputClass}
                      placeholder={t("settings.regionPh")}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="address_line">{t("settings.address")}</Label>
                  <Textarea
                    id="address_line"
                    rows={3}
                    value={prefs.address_line}
                    onChange={(e) => setPrefs((p) => ({ ...p, address_line: e.target.value }))}
                    className={cn(inputClass, "resize-y min-h-[80px]")}
                    placeholder={t("settings.addressPh")}
                  />
                </div>
                <Button type="submit" disabled={savingPrefs} className="bg-[#1a8fe3] hover:bg-[#1578c4] text-white">
                  <Check className="h-4 w-4 mr-2" />
                  {savingPrefs ? t("common.saving") : t("settings.saveLang")}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card id="parent-settings-children" className="surface-card scroll-mt-6">
            <CardHeader className="border-b border-slate-100 pb-4 dark:border-slate-800">
              <div className="flex items-start gap-3">
                <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-[#EBF5FE]">
                  <Users className="h-4 w-4 text-[#1a8fe3]" />
                </div>
                <div>
                  <CardTitle className="text-base font-bold">{t("settings.childrenTitle")}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("settings.childrenHint")}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-5">
              {childrenLoading ? (
                <p className="text-sm text-muted-foreground">{t("settings.childrenLoading")}</p>
              ) : linkedChildren.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("settings.childrenEmpty")}</p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {linkedChildren.map((child) => {
                    const st = statusFrom(child.stats, t)
                    const agePart = child.age != null ? `${child.age} ${t("common.age")}` : t("common.dash")
                    const diagPart = child.diagnostic?.trim() || t("settings.childNoDiag")
                    const codePart = child.alexa_code || t("common.dash")
                    return (
                      <li key={child.id} className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 flex-1 gap-3">
                          <div
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-[#1a8fe3]"
                            style={{ backgroundColor: "#EBF5FE" }}
                          >
                            {childInitial(child.name)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 dark:text-white">{child.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {agePart} · {diagPart} · {t("settings.childCode")}{" "}
                              <span className="font-mono text-slate-600 dark:text-slate-400">{codePart}</span>
                            </p>
                          </div>
                        </div>
                        <span className={cn("shrink-0 self-start rounded-full px-2.5 py-0.5 text-xs font-medium sm:self-center", st.cls)}>
                          {st.label}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card
            id="parent-settings-danger"
            className="surface-card overflow-hidden border-[#fca5a5] scroll-mt-6 dark:border-red-400/50"
          >
            <CardHeader className="border-b border-red-100 bg-[#fff5f5] dark:border-red-900/40 dark:bg-red-950/20">
              <div className="flex items-start gap-3">
                <TriangleAlert className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                <div>
                  <CardTitle className="text-base font-bold text-red-700 dark:text-red-400">{t("settings.dangerTitle")}</CardTitle>
                  <p className="text-xs text-red-600/90 dark:text-red-400/90 mt-0.5">{t("settings.dangerHint")}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 dark:border-slate-800">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{t("settings.logoutAll")}</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-md">{t("settings.logoutAllHint")}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0 border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                  onClick={handleLogoutEverywhere}
                >
                  <LogOut className="h-4 w-4 mr-1.5" />
                  {t("settings.logoutAllBtn")}
                </Button>
              </div>
              <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{t("settings.deleteTitle")}</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-lg">{t("settings.deleteHint")}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0 border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                  onClick={() => {
                    setDeletePassword("")
                    setDeleteDialogOpen(true)
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  {t("settings.deleteBtn")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.deleteDialogTitle")}</DialogTitle>
            <DialogDescription>{t("settings.deleteDialogHint")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label htmlFor="delete-pw">{t("settings.deletePw")}</Label>
              <Input
                id="delete-pw"
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder={t("settings.deletePwPh")}
                className={inputClass}
                autoComplete="current-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting || !deletePassword.trim()}
              onClick={handleDeleteAccount}
            >
              {deleting ? t("settings.deleteDeleting") : t("settings.deleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function Page() {
  return (
    <AuthGuard requiredAccountType="parent">
      <ParentProfilePageContent />
    </AuthGuard>
  )
}
