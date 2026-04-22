"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AuthGuard } from "@/components/auth-guard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { fetchApi, getAuthHeaders, publicApiBase } from "@/lib/api"
import { SubscriptionLibraryBanner } from "@/components/portal/subscription-library-banner"
import { usePortalI18n } from "@/lib/i18n/i18n-context"
import { readLocaleFromStorage, resolveMessage } from "@/lib/i18n/messages"
import type { AppLocale } from "@/lib/i18n/types"
import { toast } from "sonner"
import {
  FolderOpen,
  PlusCircle,
  Trash2,
  FileText,
  RefreshCw,
  Search,
  UploadCloud,
  Sparkles,
  CalendarDays,
  Paperclip,
  Copy,
  CheckCircle2,
} from "lucide-react"

interface LibraryItem {
  id: number
  name: string
  pdf_path: string | null
  created_at: string | null
  status: string
  question_count: number
  error_message: string | null
}

interface ParentMeProfile {
  subscription?: {
    billing_exempt: boolean
    library_frozen: boolean
    in_grace_period: boolean
    new_program_assign_blocked: boolean
    paid_until: string | null
    grace_days: number | null
  }
}

function localeTag(loc: AppLocale) {
  if (loc === "ar") return "ar"
  if (loc === "fr") return "fr-FR"
  return "en-US"
}

function formatDate(value: string | null, locale: AppLocale) {
  if (!value) return "—"
  return new Date(value).toLocaleDateString(localeTag(locale))
}

function getStatusClasses(status: string) {
  switch (status) {
    case "ready":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
    case "processing":
      return "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
    case "failed":
      return "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-300"
    default:
      return "bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-300"
  }
}

function getStatusAccent(status: string) {
  if (status === "ready") return "#16a34a"
  if (status === "processing") return "#d97706"
  return "#dc2626"
}

function getFilename(pathValue: string | null) {
  if (!pathValue) return ""
  const normalized = pathValue.replaceAll("\\", "/")
  const parts = normalized.split("/")
  return parts[parts.length - 1] || pathValue
}

function statusLabel(status: string, t: (key: string) => string) {
  switch (status) {
    case "ready":
      return t("library.statusReady")
    case "processing":
      return t("library.statusProcessing")
    case "failed":
      return t("library.statusFailed")
    default:
      return status
  }
}

function LibraryPage() {
  const router = useRouter()
  const { t, locale } = usePortalI18n()
  const [items, setItems] = useState<LibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [readyKidsSaving, setReadyKidsSaving] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [errors, setErrors] = useState<{ name?: string; pdf?: string }>({})
  const [form, setForm] = useState({
    name: "",
    pdf_path: "",
  })
  const [meProfile, setMeProfile] = useState<ParentMeProfile | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const libraryWriteLocked =
    !!(meProfile?.subscription?.library_frozen && !meProfile?.subscription?.billing_exempt)

  useEffect(() => {
    try {
      const raw = localStorage.getItem("adhdAssistCurrentUser")
      if (!raw) return
      const u = JSON.parse(raw) as { account_kind?: string }
      if (u.account_kind !== "standalone") {
        router.replace("/dashboard")
      }
    } catch {
      //
    }
  }, [router])

  const loadItems = async (opts?: { showLoading?: boolean }) => {
    const showLoading = opts?.showLoading ?? true
    if (showLoading) setLoading(true)
    try {
      const data = await fetchApi<LibraryItem[]>("/api/parents/library")
      setItems(data)
    } catch (err) {
      const loc = readLocaleFromStorage("parent")
      toast.error(
        err instanceof Error ? err.message : resolveMessage(loc, "parent", "library.errLoad"),
      )
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    fetchApi<ParentMeProfile>("/api/parents/me")
      .then((me) => {
        if (!cancelled) setMeProfile(me)
      })
      .catch(() => {
        //
      })
    loadItems()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!items.some((item) => item.status === "processing")) return
    const timer = window.setInterval(() => {
      loadItems({ showLoading: false })
    }, 15000)
    return () => window.clearInterval(timer)
  }, [items])

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => {
      const name = item.name.toLowerCase()
      const path = (item.pdf_path || "").toLowerCase()
      const status = (item.status || "").toLowerCase()
      return name.includes(q) || path.includes(q) || status.includes(q)
    })
  }, [items, searchQuery])

  const kpis = useMemo(() => {
    const total = items.length
    const linked = items.filter((x) => !!x.pdf_path).length
    const ready = items.filter((x) => x.status === "ready").length
    return { total, linked, ready }
  }, [items])

  const validateForm = () => {
    const nextErrors: { name?: string; pdf?: string } = {}
    if (!form.name.trim()) nextErrors.name = t("library.errName")
    if (!form.pdf_path.trim() && !selectedFile) nextErrors.pdf = t("library.errPdf")
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (libraryWriteLocked) {
      toast.error(t("library.subscriptionFrozen"))
      return
    }
    if (!validateForm()) return
    setSaving(true)
    try {
      let createdItem: LibraryItem
      if (selectedFile) {
        if (selectedFile.size > 10 * 1024 * 1024) {
          throw new Error(t("library.errPdfSize"))
        }
        const formData = new FormData()
        formData.append("name", form.name)
        formData.append("pdf_path", form.pdf_path)
        formData.append("pdf_file", selectedFile)
        const res = await fetch(`${publicApiBase}/api/parents/library`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: formData,
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || t("library.errUpload"))
        }
        createdItem = await res.json()
      } else {
        createdItem = await fetchApi<LibraryItem>("/api/parents/library", {
          method: "POST",
          body: JSON.stringify(form),
        })
      }
      if (createdItem.status === "ready") {
        toast.success(t("library.toastProcessed").replace("{n}", String(createdItem.question_count)))
      } else if (createdItem.status === "failed") {
        toast.error(createdItem.error_message || t("library.toastAddedProcessFail"))
      } else {
        toast.success(t("library.toastAdded"))
      }
      setForm({ name: "", pdf_path: "" })
      setSelectedFile(null)
      setErrors({})
      await loadItems()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("library.toastAddFail"))
    } finally {
      setSaving(false)
    }
  }

  const handleAddReadyKidsProgram = async () => {
    if (libraryWriteLocked) {
      toast.error(t("library.subscriptionFrozen"))
      return
    }
    setReadyKidsSaving(true)
    try {
      const created = await fetchApi<LibraryItem>("/api/parents/library/demo-adhd", {
        method: "POST",
        body: "{}",
      })
      toast.success(t("library.toastReadyKidsOk").replace("{n}", String(created.question_count ?? 0)))
      await loadItems()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("library.toastReadyKidsFail"))
    } finally {
      setReadyKidsSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (libraryWriteLocked) {
      toast.error(t("library.subscriptionFrozen"))
      return
    }
    try {
      await fetchApi<{ message: string }>(`/api/parents/library/${id}`, {
        method: "DELETE",
      })
      toast.success(t("library.toastDeleted"))
      await loadItems()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("library.toastDeleteFail"))
    }
  }

  const handleProcess = async (id: number) => {
    if (libraryWriteLocked) {
      toast.error(t("library.subscriptionFrozen"))
      return
    }
    try {
      const item = await fetchApi<LibraryItem>(`/api/parents/library/${id}/process`, {
        method: "POST",
      })
      if (item.status === "ready") {
        toast.success(t("library.toastReprocessed").replace("{n}", String(item.question_count)))
      } else if (item.status === "processing") {
        toast.success(t("library.toastProcessingStarted"))
      } else {
        toast.error(item.error_message || t("library.toastProcessFail"))
      }
      await loadItems()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("library.toastReprocessFail"))
      await loadItems()
    }
  }

  const openFilePicker = () => fileInputRef.current?.click()

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (file.type !== "application/pdf") {
      toast.error(t("library.errPdfOnly"))
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t("library.errPdfSize"))
      return
    }
    setSelectedFile(file)
    setErrors((prev) => ({ ...prev, pdf: undefined }))
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t("library.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("library.subtitle")}</p>
      </div>

      <div className="mb-6">
        <SubscriptionLibraryBanner
          subscription={meProfile?.subscription ?? null}
          messageFrozen={t("library.subscriptionFrozen")}
          messageGrace={t("library.subscriptionGrace")}
        />
      </div>

      <div className="mb-6 rounded-xl border border-sky-200 dark:border-sky-500/30 bg-sky-50/90 dark:bg-sky-950/25 px-4 py-4 space-y-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-sky-950 dark:text-sky-100">{t("library.readyKidsTitle")}</p>
          <p className="text-xs text-sky-900/85 dark:text-sky-200/85 mt-1 leading-relaxed">{t("library.readyKidsHint")}</p>
          <p className="text-xs text-slate-700 dark:text-slate-300 mt-3 whitespace-pre-line leading-relaxed border-t border-sky-200/80 dark:border-sky-800/50 pt-3">
            {t("library.readyKidsFlow")}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={readyKidsSaving || libraryWriteLocked}
          className="w-full sm:w-auto border-sky-300 bg-white hover:bg-sky-50 dark:bg-sky-900/50 dark:border-sky-600"
          onClick={handleAddReadyKidsProgram}
        >
          <Sparkles className="h-4 w-4 mr-2" />
          {readyKidsSaving ? t("library.adding") : t("library.readyKidsBtn")}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card className="surface-card">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{t("library.kpiTotal")}</p>
                <p className="text-3xl font-bold mt-1 text-[#1a8fe3]">{kpis.total}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("library.kpiTotalHint")}</p>
              </div>
              <div className="h-9 w-9 rounded-lg bg-[#EBF5FE] flex items-center justify-center">
                <FolderOpen className="h-5 w-5 text-[#1a8fe3]" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="surface-card">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{t("library.kpiPdf")}</p>
                <p className="text-3xl font-bold mt-1 text-teal-600">{kpis.linked}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("library.kpiPdfHint")}</p>
              </div>
              <div className="h-9 w-9 rounded-lg bg-teal-50 flex items-center justify-center">
                <FileText className="h-5 w-5 text-teal-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="surface-card">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{t("library.kpiReady")}</p>
                <p className="text-3xl font-bold mt-1 text-violet-600">{kpis.ready}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("library.kpiReadyHint")}</p>
              </div>
              <div className="h-9 w-9 rounded-lg bg-violet-50 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-violet-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[38%_62%] items-stretch">
        <Card className="surface-card h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-primary" />
              {t("library.addResource")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-2">
                <Label htmlFor="name">{t("library.name")}</Label>
                <Input
                  id="name"
                  placeholder={t("library.namePh")}
                  value={form.name}
                  disabled={libraryWriteLocked}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className={errors.name ? "border-red-500" : ""}
                />
                {errors.name ? <p className="text-xs text-red-600">{errors.name}</p> : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pdf_path">{t("library.pdfPath")}</Label>
                <Input
                  id="pdf_path"
                  placeholder="/backend/data/sample.pdf or https://..."
                  value={form.pdf_path}
                  disabled={libraryWriteLocked}
                  onChange={(e) => setForm((f) => ({ ...f, pdf_path: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-3 py-1">
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                <span className="text-xs text-muted-foreground">{t("library.orUpload")}</span>
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              </div>
              <div className="grid gap-2">
                <input
                  ref={fileInputRef}
                  id="pdf_file"
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                />
                <div
                  onDragOver={(e) => {
                    e.preventDefault()
                    setIsDragging(true)
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault()
                    setIsDragging(false)
                  }}
                  onDrop={libraryWriteLocked ? undefined : handleDrop}
                  className={[
                    "rounded-xl border bg-slate-50 px-4 py-8 text-center transition-colors",
                    "border-[1.5px] border-dashed border-[#d1d5db]",
                    libraryWriteLocked ? "pointer-events-none opacity-50" : "",
                    isDragging
                      ? "border-primary bg-blue-50/60 dark:bg-blue-950/10"
                      : "hover:border-primary hover:bg-blue-50/40 dark:hover:bg-blue-950/10",
                  ].join(" ")}
                >
                  <UploadCloud className="mx-auto h-7 w-7 text-slate-500" />
                  <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">
                    {t("library.dropHint")}{" "}
                    <button
                      type="button"
                      disabled={libraryWriteLocked}
                      onClick={openFilePicker}
                      className="text-primary font-medium hover:underline"
                    >
                      {t("common.browse")}
                    </button>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{t("library.dropSub")}</p>
                  {selectedFile ? (
                    <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                      {t("library.selectedFile").replace("{name}", selectedFile.name)}
                    </p>
                  ) : null}
                </div>
                {errors.pdf ? <p className="text-xs text-red-600">{errors.pdf}</p> : null}
              </div>
              <Button
                type="submit"
                disabled={saving || libraryWriteLocked}
                className="w-full bg-[#1a8fe3] hover:bg-[#167ec9] text-white"
              >
                <PlusCircle className="h-4 w-4 mr-2" />
                {saving ? t("library.adding") : t("library.addBtn")}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="surface-card h-full">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-primary" />
                {t("library.listTitle")}
              </CardTitle>
              <div className="relative w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("library.searchPh")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-white dark:bg-slate-800"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-5">
            {loading ? (
              <p className="text-sm text-muted-foreground">{t("library.loading")}</p>
            ) : filteredItems.length === 0 ? (
              <div className="py-12 flex flex-col items-center text-center text-muted-foreground gap-4 max-w-md mx-auto px-2">
                <FolderOpen className="h-10 w-10 opacity-60" />
                <p className="text-sm italic">{t("library.empty")}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-line">{t("library.readyKidsFlow")}</p>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={readyKidsSaving || libraryWriteLocked}
                  className="border-sky-300 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/40 dark:border-sky-600"
                  onClick={handleAddReadyKidsProgram}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  {readyKidsSaving ? t("library.adding") : t("library.readyKidsBtn")}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="relative flex flex-col gap-4 rounded-lg border border-slate-200 dark:border-slate-700 p-4 md:flex-row md:items-center md:justify-between"
                  style={{ borderLeftWidth: "3px", borderLeftColor: getStatusAccent(item.status) }}
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-900 dark:text-white">{item.name}</p>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${getStatusClasses(item.status)}`}>
                        {statusLabel(item.status, t)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {t("library.addedOn").replace("{date}", formatDate(item.created_at, locale))}
                      </span>
                      <span className="text-muted-foreground">•</span>
                      <span className="inline-flex items-center gap-1 text-blue-600 font-semibold">
                        <Sparkles className="h-3.5 w-3.5" />
                        {t("library.questionsGen").replace("{n}", String(item.question_count ?? 0))}
                      </span>
                    </div>
                    {item.pdf_path ? (
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Paperclip className="h-3.5 w-3.5" />
                        <code className="font-mono">{getFilename(item.pdf_path)}</code>
                        <button
                          type="button"
                          title={t("library.copyPathTitle")}
                          className="inline-flex items-center rounded border border-slate-200 bg-white px-1.5 py-0.5 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
                          onClick={async () => {
                            await navigator.clipboard.writeText(item.pdf_path || "")
                            toast.success(t("library.pathCopied"))
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">{t("library.noPath")}</p>
                    )}
                    {item.error_message ? (
                      <p className="text-xs text-red-600 dark:text-red-400">{item.error_message}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2 justify-end">
                    {item.pdf_path ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={libraryWriteLocked}
                        onClick={() => handleProcess(item.id)}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        {t("library.reprocess")}
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={libraryWriteLocked}
                      className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300"
                      onClick={() => handleDelete(item.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {t("common.delete")}
                    </Button>
                  </div>
                </div>
              ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function Page() {
  return (
    <AuthGuard requiredAccountType="parent">
      <LibraryPage />
    </AuthGuard>
  )
}
