import './globals.css';
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

export const metadata = {
  title: 'Industrial MCP',
  description: 'Master Control Program for connected systems',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()

  const navItems = [
    { name: 'Dashboard', path: '/dashboard' },
    { name: 'Integration', path: '/dashboard/integration' },
    { name: 'Settings', path: '/dashboard/settings' },
  ]

  const handleLogin = () => {
    // Simple bypass - just redirect to dashboard
    router.push('/dashboard')
  }

  return (
    <html lang="en">
      <body className="bg-gray-100 min-h-screen">
        <div className="w-64 bg-gray-800 h-screen fixed left-0 top-0 p-4">
          <h1 className="text-2xl font-bold text-white mb-8">MCP</h1>
          <nav className="space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.path}
                href={item.path}
                className={`block p-3 rounded-lg ${
                  pathname === item.path
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                {item.name}
              </Link>
            ))}
          </nav>
          <div className="mt-auto">
            <button
              onClick={handleLogin}
              className="w-full bg-blue-500 text-white px-4 py-2 rounded-lg"
            >
              Login to MCP
            </button>
          </div>
        </div>
        {children}
      </body>
    </html>
  )
}