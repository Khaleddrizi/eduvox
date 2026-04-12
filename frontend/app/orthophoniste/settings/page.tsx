"use client"

import { useEffect, useState } from "react"
import { AuthGuard } from "@/components/auth-guard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { fetchApi } from "@/lib/api"
import { toast } from "sonner"
import Link from "next/link"
import {
  ArrowLeft,
  Save,
  ShieldCheck,
  UserCircle2,
  User,
  Bell,
  Globe2,
  TriangleAlert,
  Eye,
  EyeOff,
  Check,
  X,
  Lock,
  LogOut,
  Trash2,
  Camera,
} from "lucide-react"

interface SpecialistProfile {
  id: number
  email: string
  full_name: string | null
  phone?: string | null
  created_at?: string | null
}

type SettingsNavItem = "profile" | "password" | "notifications" | "language" | "danger"

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return "DR"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function passwordStrength(password: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!password) return { score: 0, label: "Empty" }
  if (password.length < 6) return { score: 1, label: "Weak" }
  const hasUpper = /[A-Z]/.test(password)
  const hasNumber = /\d/.test(password)
  const hasSpecial = /[^A-Za-z0-9]/.test(password)
  if (password.length >= 8 && hasUpper && hasNumber && hasSpecial) return { score: 4, label: "Strong" }
  if (password.length >= 8 && hasNumber) return { score: 3, label: "Good" }
  return { score: 2, label: "Fair" }
}

function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
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
  const [activeNav, setActiveNav] = useState<SettingsNavItem>("profile")

  useEffect(() => {
    async function loadProfile() {
      try {
        const data = await fetchApi<SpecialistProfile>("/api/specialists/me")
        setProfile({
          full_name: data.full_name || "",
          email: data.email || "",
          phone: data.phone || "",
        })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load profile")
      } finally {
        setLoading(false)
      }
    }
    loadProfile()
  }, [])

  const syncStoredUser = (full_name: string, email: string) => {
    const raw = localStorage.getItem("adhdAssistCurrentUser")
    if (!raw) return
    try {
      const user = JSON.parse(raw)
      user.full_name = full_name
      user.email = email
      localStorage.setItem("adhdAssistCurrentUser", JSON.stringify(user))
    } catch {
      //
    }
  }

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingProfile(true)
    try {
      const data = await fetchApi<SpecialistProfile>("/api/specialists/me", {
        method: "PUT",
        body: JSON.stringify(profile),
      })
      syncStoredUser(data.full_name || "", data.email)
      toast.success("Profile updated successfully")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile")
    } finally {
      setSavingProfile(false)
    }
  }

  const scrollToSection = (id: SettingsNavItem) => {
    setActiveNav(id)
    const el = document.getElementById(`settings-${id}`)
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (passwords.new_password !== passwords.confirm_password) {
      toast.error("New passwords do not match")
      return
    }
    setSavingPassword(true)
    try {
      const data = await fetchApi<{ message: string }>("/api/specialists/change-password", {
        method: "PUT",
        body: JSON.stringify({
          current_password: passwords.current_password,
          new_password: passwords.new_password,
        }),
      })
      toast.success(data.message)
      setPasswords({ current_password: "", new_password: "", confirm_password: "" })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change password")
    } finally {
      setSavingPassword(false)
    }
  }

  const handleLogoutEverywhere = () => {
    localStorage.removeItem("adhdAssistCurrentUser")
    toast.success("You have been logged out from this device.")
  }

  const handleDeleteAccount = () => {
    toast.error("Doctor account deletion is not enabled.")
  }

  const strength = passwordStrength(passwords.new_password)
  const passwordsMatch = Boolean(passwords.confirm_password) && passwords.new_password === passwords.confirm_password
  const passwordsMismatch = Boolean(passwords.confirm_password) && passwords.new_password !== passwords.confirm_password
  const doctorName = profile.full_name || "Orthophoniste"

  return (
    <div className="min-w-0">
      <Link href="/orthophoniste" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-6">
        <ArrowLeft className="h-4 w-4" /> Back to Patients
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Profile & Security</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your doctor account information and password.</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <aside className="self-start">
          <nav className="space-y-5">
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Account</p>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => scrollToSection("profile")}
                  className={[
                    "w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                    activeNav === "profile"
                      ? "bg-[#EBF5FE] text-[#1a8fe3]"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/60",
                  ].join(" ")}
                >
                  <UserCircle2 className="h-4 w-4" />
                  Profile Information
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection("password")}
                  className={[
                    "w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                    activeNav === "password"
                      ? "bg-[#EBF5FE] text-[#1a8fe3]"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/60",
                  ].join(" ")}
                >
                  <Lock className="h-4 w-4" />
                  Change Password
                </button>
              </div>
            </div>
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Preferences</p>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => scrollToSection("notifications")}
                  className={[
                    "w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                    activeNav === "notifications"
                      ? "bg-[#EBF5FE] text-[#1a8fe3]"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/60",
                  ].join(" ")}
                >
                  <Bell className="h-4 w-4" />
                  Notifications
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection("language")}
                  className={[
                    "w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                    activeNav === "language"
                      ? "bg-[#EBF5FE] text-[#1a8fe3]"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/60",
                  ].join(" ")}
                >
                  <Globe2 className="h-4 w-4" />
                  Language & Region
                </button>
              </div>
            </div>
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Danger Zone</p>
              <button
                type="button"
                onClick={() => scrollToSection("danger")}
                className={[
                  "w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                  activeNav === "danger"
                    ? "bg-red-50 text-red-700"
                    : "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/20",
                ].join(" ")}
              >
                <TriangleAlert className="h-4 w-4" />
                Delete Account
              </button>
            </div>
          </nav>
        </aside>

        <div className="space-y-6">
          <Card id="settings-profile" className="surface-card">
            <CardHeader className="border-b border-slate-200/70 dark:border-slate-700/70">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-[#EBF5FE] flex items-center justify-center">
                  <User className="h-4 w-4 text-[#1a8fe3]" />
                </div>
                <div>
                  <CardTitle className="text-[14px] font-bold">Profile Information</CardTitle>
                  <p className="text-[11px] text-muted-foreground">Update your doctor account details</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading profile...</p>
              ) : (
                <form className="space-y-5" onSubmit={handleProfileSave}>
                  <div className="flex items-center justify-between gap-4 border-b border-slate-200/70 pb-4 dark:border-slate-700/70">
                    <div className="flex items-center gap-3">
                      <div className="h-[60px] w-[60px] rounded-full bg-[#1a8fe3] text-white flex items-center justify-center text-lg font-semibold">
                        {initialsFromName(doctorName)}
                      </div>
                      <div>
                        <p className="text-[15px] font-bold text-slate-900 dark:text-white">{doctorName}</p>
                        <p className="text-[12px] text-muted-foreground">Orthophoniste</p>
                      </div>
                    </div>
                    <Button type="button" variant="outline" size="sm" className="border-primary text-primary">
                      <Camera className="h-4 w-4 mr-1" />
                      Change photo
                    </Button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="full_name">Full Name</Label>
                      <Input
                        id="full_name"
                        value={profile.full_name}
                        onChange={(e) => setProfile((p) => ({ ...p, full_name: e.target.value }))}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={profile.phone}
                        onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={profile.email}
                      onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                      required
                    />
                  </div>

                  <Button type="submit" disabled={savingProfile}>
                    <Check className="h-4 w-4 mr-2" />
                    {savingProfile ? "Saving..." : "Save Changes"}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <Card id="settings-password" className="surface-card">
            <CardHeader className="border-b border-slate-200/70 dark:border-slate-700/70">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-[#EBF5FE] flex items-center justify-center">
                  <ShieldCheck className="h-4 w-4 text-[#1a8fe3]" />
                </div>
                <div>
                  <CardTitle className="text-[14px] font-bold">Change Password</CardTitle>
                  <p className="text-[11px] text-muted-foreground">Keep your account secure with a strong password</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handlePasswordSave}>
                <div className="grid gap-2">
                  <Label htmlFor="current_password">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="current_password"
                      type={showCurrentPassword ? "text" : "password"}
                      value={passwords.current_password}
                      onChange={(e) => setPasswords((p) => ({ ...p, current_password: e.target.value }))}
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="new_password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="new_password"
                      type={showNewPassword ? "text" : "password"}
                      value={passwords.new_password}
                      onChange={(e) => setPasswords((p) => ({ ...p, new_password: e.target.value }))}
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  <div className="mt-1">
                    <p className="text-[11px] text-muted-foreground mb-1">Password strength</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[1, 2, 3, 4].map((lvl) => (
                        <span
                          key={lvl}
                          className={[
                            "h-1.5 rounded",
                            strength.score >= lvl
                              ? strength.score === 1
                                ? "bg-red-500"
                                : strength.score <= 3
                                  ? "bg-amber-500"
                                  : "bg-emerald-500"
                              : "bg-slate-200 dark:bg-slate-700",
                          ].join(" ")}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="confirm_password">Confirm New Password</Label>
                  <div className="relative">
                    <Input
                      id="confirm_password"
                      type={showConfirmPassword ? "text" : "password"}
                      value={passwords.confirm_password}
                      onChange={(e) => setPasswords((p) => ({ ...p, confirm_password: e.target.value }))}
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    {passwords.confirm_password ? (
                      <span className="absolute right-9 top-1/2 -translate-y-1/2">
                        {passwordsMatch ? (
                          <Check className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <X className="h-4 w-4 text-red-600" />
                        )}
                      </span>
                    ) : null}
                  </div>
                  {passwordsMismatch ? (
                    <p className="text-[11px] text-red-600">Passwords do not match</p>
                  ) : null}
                </div>

                <Button type="submit" variant="outline" disabled={savingPassword} className="bg-white text-slate-900 border-slate-300">
                  {savingPassword ? "Updating..." : "Update Password"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card id="settings-notifications" className="surface-card">
            <CardHeader className="border-b border-slate-200/70 dark:border-slate-700/70">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-[#EBF5FE] flex items-center justify-center">
                  <Bell className="h-4 w-4 text-[#1a8fe3]" />
                </div>
                <div>
                  <CardTitle className="text-[14px] font-bold">Notifications</CardTitle>
                  <p className="text-[11px] text-muted-foreground">Configure alerts and email notifications</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Notification preferences will be available soon.</p>
            </CardContent>
          </Card>

          <Card id="settings-language" className="surface-card">
            <CardHeader className="border-b border-slate-200/70 dark:border-slate-700/70">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-[#EBF5FE] flex items-center justify-center">
                  <Globe2 className="h-4 w-4 text-[#1a8fe3]" />
                </div>
                <div>
                  <CardTitle className="text-[14px] font-bold">Language & Region</CardTitle>
                  <p className="text-[11px] text-muted-foreground">Set default language and localization</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Language and region settings will be available soon.</p>
            </CardContent>
          </Card>

          <Card id="settings-danger" className="surface-card border-[#fca5a5]">
            <CardHeader className="border-b border-red-100 bg-[#fff5f5]">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-red-100 flex items-center justify-center">
                  <TriangleAlert className="h-4 w-4 text-red-600" />
                </div>
                <div>
                  <CardTitle className="text-[14px] font-bold text-red-700">Danger Zone</CardTitle>
                  <p className="text-[11px] text-red-600/80">Irreversible actions — proceed with caution</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="flex items-center justify-between gap-4 p-5">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Log out of all devices</p>
                  <p className="text-xs text-muted-foreground mt-1">Invalidate current sessions and require new login.</p>
                </div>
                <Button variant="outline" size="sm" className="border-red-300 text-red-700" onClick={handleLogoutEverywhere}>
                  <LogOut className="h-4 w-4 mr-1.5" />
                  Log out everywhere
                </Button>
              </div>
              <div className="h-px bg-slate-200 dark:bg-slate-700" />
              <div className="flex items-center justify-between gap-4 p-5">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Delete account</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Permanently delete your account and all patient data. This cannot be undone.
                  </p>
                </div>
                <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={handleDeleteAccount}>
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Delete account
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default function Page() {
  return (
    <AuthGuard requiredAccountType="therapist">
      <SettingsPage />
    </AuthGuard>
  )
}
