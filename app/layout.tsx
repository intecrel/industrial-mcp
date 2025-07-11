import './globals.css';
import { Inter } from 'next/font/google';
import type { Metadata } from 'next';

// Import Inter font
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

// Metadata for the application
export const metadata: Metadata = {
  title: 'Industrial MCP',
  description: 'Industrial Model Context Protocol implementation with Vercel MCP TypeScript SDK',
  keywords: ['MCP', 'Model Context Protocol', 'Industrial', 'AI', 'TypeScript', 'Vercel'],
  authors: [{ name: 'Industrial Marketing' }],
  creator: 'Industrial Marketing',
  publisher: 'Industrial Marketing',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
  },
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable}`}>
      <body className="min-h-screen bg-background antialiased">
        {/* Dark mode detection - this script runs before page load to prevent flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
                const storedTheme = localStorage.getItem('theme');
                if (storedTheme === 'dark' || (!storedTheme && isDarkMode)) {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              })();
            `,
          }}
        />
        <main className="relative flex min-h-screen flex-col">
          {children}
        </main>
      </body>
    </html>
  );
}
