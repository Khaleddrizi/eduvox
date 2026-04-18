import Link from "next/link"
import { Facebook, Twitter, Instagram, Youtube, Mail, Phone } from "lucide-react"

export function SiteFooter() {
  return (
    <footer className="border-t bg-background">
      <div className="container py-10">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div className="space-y-4">
            <h3 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-cyan-500">
              EDUVOX
            </h3>
            <p className="text-sm text-muted-foreground">
              منصة دعم معرفي مبتكرة للأطفال المصابين بـ ADHD، بإشراف مهني ومسارات تفاعلية واضحة.
            </p>
            <div className="flex space-x-3">
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
            <h3 className="text-sm font-bold uppercase tracking-wider">المصادر</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="#" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  المدونة
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  مركز الوثائق
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  تمارين قابلة للتحميل
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  الأسئلة الشائعة
                </Link>
              </li>
            </ul>
          </div>
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider">الشركة</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="#" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  من نحن
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  فريقنا
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  الوظائف
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  تواصل معنا
                </Link>
              </li>
            </ul>
          </div>
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider">التواصل</h3>
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
                  تواصل معنا
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-8 border-t pt-8">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} EDUVOX. جميع الحقوق محفوظة.</p>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <Link href="#" className="hover:text-primary transition-colors duration-200">
                من نحن
              </Link>
              <Link href="#" className="hover:text-primary transition-colors duration-200">
                تواصل
              </Link>
              <Link href="#" className="hover:text-primary transition-colors duration-200">
                الإشعارات القانونية
              </Link>
              <Link href="#" className="hover:text-primary transition-colors duration-200">
                الخصوصية
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
