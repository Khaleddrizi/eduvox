"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AuthGuard } from "@/components/auth-guard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { fetchApi, getAuthHeaders, publicApiBase } from "@/lib/api"
import { toast } from "sonner"
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
} from "lucide-react"
import { cn } from "@/lib/utils"

interface ParentProfile {
  id: number
  email: string
  full_name: string | null
  phone?: string | null
  created_at?: string | null
}

interface ApiChild {
  id: number
  name: string
  age: number | null
  diagnostic?: string | null
  alexa_code?: string | null
  stats: { total_sessions: number; avg_accuracy: number }
}

type ParentNav = "profile" | "password" | "children" | "danger"

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return "P"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function childInitial(name: string) {
  return (name.trim()[0] || "?").toUpperCase()
}

function passwordStrength(password: string): { score: 0 | 1 | 2 | 3 | 4 } {
  if (!password) return { score: 0 }
  if (password.length < 6) return { score: 1 }
  const hasUpper = /[A-Z]/.test(password)
  const hasNumber = /\d/.test(password)
  const hasSpecial = /[^A-Za-z0-9]/.test(password)
  if (password.length >= 8 && hasUpper && hasNumber && hasSpecial) return { score: 4 }
  if (password.length >= 8 && hasNumber) return { score: 3 }
  return { score: 2 }
}

function statusFrom(stats: ApiChild["stats"]) {
  if (!stats.total_sessions || stats.avg_accuracy < 30) return { label: "Needs Attention", cls: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200" }
  if (stats.avg_accuracy < 70) return { label: "Monitor", cls: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100" }
  return { label: "On Track", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" }
}

const inputClass =
  "bg-[#f9fafb] border-slate-200 focus-visible:border-[#1a8fe3] focus-visible:ring-[#1a8fe3]/30 dark:bg-slate-900/50 dark:border-slate-700"

function ParentProfilePageContent() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [childrenLoading, setChildrenLoading] = useState(true)
  const [linkedChildren, setLinkedChildren] = useState<ApiChild[]>([])
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [activeNav, setActiveNav] = useState<ParentNav>("profile")
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
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

  useEffect(() => {
    async function loadProfile() {
      try {
        const data = await fetchApi<ParentProfile>("/api/parents/me")
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
      syncStoredUser(data.full_name || "", data.email)
      toast.success("Profile updated successfully")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile")
    } finally {
      setSavingProfile(false)
    }
  }

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (passwords.new_password !== passwords.confirm_password) {
      toast.error("New passwords do not match")
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
      toast.error(err instanceof Error ? err.message : "Failed to change password")
    } finally {
      setSavingPassword(false)
    }
  }

  const handleLogoutEverywhere = () => {
    localStorage.removeItem("adhdAssistCurrentUser")
    toast.success("Logged out on this device. Sign in again on other devices with your password.")
    router.replace("/login")
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE") {
      toast.error('Type DELETE exactly to confirm')
      return
    }
    if (!deletePassword) {
      toast.error("Enter your current password")
      return
    }
    setDeleting(true)
    try {
      await fetchApi<{ message: string }>("/api/parents/me", {
        method: "DELETE",
        body: JSON.stringify({ current_password: deletePassword }),
      })
      localStorage.removeItem("adhdAssistCurrentUser")
      toast.success("Account deleted successfully")
      setDeleteDialogOpen(false)
      router.replace("/")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete account")
    } finally {
      setDeleting(false)
    }
  }

  const strength = passwordStrength(passwords.new_password)
  const passwordsMatch = Boolean(passwords.confirm_password) && passwords.new_password === passwords.confirm_password
  const passwordsMismatch = Boolean(passwords.confirm_password) && passwords.new_password !== passwords.confirm_password
  const parentDisplayName = profile.full_name || profile.email || "Parent"

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
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white md:text-3xl">Profile & Security</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your parent account, password, and linked children.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[180px_1fr] lg:items-start">
        <aside className="lg:sticky lg:top-6 self-start">
          <nav className="space-y-5 rounded-xl border border-slate-200/80 bg-white/80 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
            <div>
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Account</p>
              <div className="space-y-1">
                <button type="button" onClick={() => scrollToSection("profile")} className={navBtn(activeNav === "profile")}>
                  <UserCircle2 className="h-4 w-4 shrink-0" />
                  Profile Info
                </button>
                <button type="button" onClick={() => scrollToSection("password")} className={navBtn(activeNav === "password")}>
                  <Lock className="h-4 w-4 shrink-0" />
                  Password
                </button>
                <button type="button" onClick={() => scrollToSection("children")} className={navBtn(activeNav === "children")}>
                  <Users className="h-4 w-4 shrink-0" />
                  Linked Children
                </button>
              </div>
            </div>
            <div>
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Danger</p>
              <button type="button" onClick={() => scrollToSection("danger")} className={navBtn(activeNav === "danger", true)}>
                <TriangleAlert className="h-4 w-4 shrink-0" />
                Delete Account
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
                  <CardTitle className="text-base font-bold">Profile Information</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Update your name, email and contact details</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-5">
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading profile...</p>
              ) : (
                <form className="space-y-0" onSubmit={handleProfileSave}>
                  <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
                    <div className="flex items-center gap-4 min-w-0">
                      <div
                        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white"
                        style={{ backgroundColor: "#1a8fe3" }}
                      >
                        {initialsFromName(parentDisplayName)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[15px] font-bold text-slate-900 dark:text-white truncate">{parentDisplayName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Parent · EDUVOX Portal</p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 border-[#1a8fe3] text-[#1a8fe3] hover:bg-[#EBF5FE] self-start sm:self-center"
                      onClick={() => toast.info("Photo upload will be available in a future update.")}
                    >
                      <Camera className="h-4 w-4 mr-1.5" />
                      Change photo
                    </Button>
                  </div>

                  <div className="grid gap-4 pt-5 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="full_name">Full Name</Label>
                      <Input
                        id="full_name"
                        value={profile.full_name}
                        onChange={(e) => setProfile((p) => ({ ...p, full_name: e.target.value }))}
                        className={inputClass}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="phone">Phone</Label>
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
                    <Label htmlFor="email">Email</Label>
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
                    {savingProfile ? "Saving..." : "Save Changes"}
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
                  <CardTitle className="text-base font-bold">Change Password</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Keep your account secure with a strong password</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-5">
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
                  <Label htmlFor="new_password">New Password</Label>
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
                    <p className="text-[11px] text-muted-foreground mb-1.5">Password strength</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[1, 2, 3, 4].map((lvl) => (
                        <span
                          key={lvl}
                          className={cn(
                            "h-1.5 rounded",
                            strength.score >= lvl
                              ? strength.score === 1
                                ? "bg-red-500"
                                : strength.score <= 3
                                  ? "bg-amber-500"
                                  : "bg-emerald-500"
                              : "bg-slate-200 dark:bg-slate-700",
                          )}
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
                          <span className="text-emerald-700 dark:text-emerald-400">Passwords match</span>
                        </>
                      ) : (
                        <>
                          <X className="h-3.5 w-3.5 text-red-600" />
                          <span className="text-red-600">Passwords do not match</span>
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
                  {savingPassword ? "Updating..." : "Update Password"}
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
                  <CardTitle className="text-base font-bold">Linked Children</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Children connected to your parent account</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-5">
              {childrenLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : linkedChildren.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No children linked yet. Contact your specialist.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {linkedChildren.map((child) => {
                    const st = statusFrom(child.stats)
                    const agePart = child.age != null ? `${child.age} yrs` : "— yrs"
                    const diagPart = child.diagnostic?.trim() || "No diagnostic"
                    const codePart = child.alexa_code || "—"
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
                              {agePart} · {diagPart} · Code:{" "}
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
                  <CardTitle className="text-base font-bold text-red-700 dark:text-red-400">Danger Zone</CardTitle>
                  <p className="text-xs text-red-600/90 dark:text-red-400/90 mt-0.5">
                    Irreversible actions — proceed with caution
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 dark:border-slate-800">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Log out of all devices</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-md">
                    Revoke all active sessions across all browsers and devices
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0 border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                  onClick={handleLogoutEverywhere}
                >
                  <LogOut className="h-4 w-4 mr-1.5" />
                  Log out everywhere
                </Button>
              </div>
              <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Delete account</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-lg">
                    Permanently deletes your account. Your linked children and all their results will be deleted too. This
                    cannot be undone.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0 border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                  onClick={() => {
                    setDeleteConfirmText("")
                    setDeletePassword("")
                    setDeleteDialogOpen(true)
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Delete account
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete account permanently?</DialogTitle>
            <DialogDescription>
              This will remove your parent account, all linked children, and every quiz result. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label htmlFor="delete-type-confirm">Type DELETE to confirm</Label>
              <Input
                id="delete-type-confirm"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                className={inputClass}
                autoComplete="off"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="delete-pw">Current password</Label>
              <Input
                id="delete-pw"
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Required to verify identity"
                className={inputClass}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting || deleteConfirmText !== "DELETE" || !deletePassword}
              onClick={handleDeleteAccount}
            >
              {deleting ? "Deleting..." : "Delete forever"}
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
