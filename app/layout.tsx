import './globals.css';

export const metadata = {
  title: 'Industrial MCP',
  description: 'Master Control Program for connected systems',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-100 min-h-screen">
        <div className="flex h-screen">
          <aside className="w-64 bg-white shadow p-4">
            <h1 className="text-2xl font-bold text-blue-600">MCP</h1>
            <nav className="mt-4">
              <ul className="space-y-2">
                <li><a href="#" className="block text-gray-700">Dashboard</a></li>
                <li><a href="#" className="block text-gray-700">Data</a></li>
                <li><a href="#" className="block text-gray-700">Auth</a></li>
                <li><a href="#" className="block text-gray-700">Settings</a></li>
              </ul>
            </nav>
          </aside>
          <main className="flex-1 p-8 overflow-y-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}