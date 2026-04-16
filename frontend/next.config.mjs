/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    const apiUrlRaw = (
      process.env.BACKEND_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:5004"
    )
    // Avoid accidental "/api/api" when BACKEND_API_URL already includes "/api"
    const apiUrl = apiUrlRaw.replace(/\/$/, "").replace(/\/api\/?$/i, "")
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }]
  },
}

export default nextConfig
