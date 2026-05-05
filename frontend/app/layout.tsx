import type React from "react"
import "@/app/globals.css"
import { Inter, Noto_Sans_Arabic } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const notoArabic = Noto_Sans_Arabic({ subsets: ["arabic"], variable: "--font-noto-arabic" })

export const metadata = {
  title: "Atheeria — مساعدة معرفية مدعومة بالذكاء الاصطناعي",
  description:
    "منصة رقمية لدعم الأطفال المصابين باضطراب فرط الحركة وتشتت الانتباه (ADHD)، تجمع بين العلوم المعرفية والذكاء الاصطناعي والتفاعل اللطيف لتحسين التركيز والانتباه.",
    generator: 'v0.app'
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className={`${inter.variable} ${notoArabic.variable} font-sans`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
