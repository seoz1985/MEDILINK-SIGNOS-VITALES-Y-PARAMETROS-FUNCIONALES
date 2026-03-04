/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Permitir bodies grandes para frames rPPG (~200KB base64 cada uno)
  experimental: {
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
  // Permitir acceso desde IPs LAN en dev
  allowedDevOrigins: [
    'https://192.168.1.10:3000',
    'http://192.168.1.10:3000',
  ],
}

export default nextConfig
