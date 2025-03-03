import './globals.css';
import React from 'react';
import Link from 'next/link';
import { ThemeProvider } from './lib/ThemeProvider';
import ThemeToggle from './components/ThemeToggle';

export const metadata = {
  title: 'K8s Monitoring',
  description: 'Kubernetes ve OpenShift servislerini izleyen monitoring aracı',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <body className="bg-white dark:bg-slate-900 min-h-screen">
        <ThemeProvider>
          <div className="flex h-screen bg-white dark:bg-slate-900">
            {/* Kenar Çubuğu */}
            <div className="bg-slate-800 text-white w-64 space-y-6 py-7 px-2 absolute inset-y-0 left-0 transform -translate-x-full md:relative md:translate-x-0 transition duration-200 ease-in-out">
              <div className="flex items-center space-x-4 px-4">
                <div className="text-2xl font-extrabold">K8s Monitor</div>
              </div>
              <nav>
                <Link href="/" className="block py-2.5 px-4 rounded transition duration-200 hover:bg-slate-700">
                  Dashboard
                </Link>
                <Link href="/services" className="block py-2.5 px-4 rounded transition duration-200 hover:bg-slate-700">
                  Servisler
                </Link>
                <Link href="/alerts" className="block py-2.5 px-4 rounded transition duration-200 hover:bg-slate-700">
                  Alarmlar
                </Link>
                <Link href="/test-uptime" className="block py-2.5 px-4 rounded transition duration-200 hover:bg-slate-700">
                  Uptime Test
                </Link>
                <Link href="/settings" className="block py-2.5 px-4 rounded transition duration-200 hover:bg-slate-700">
                  Ayarlar
                </Link>
              </nav>
            </div>

            {/* Ana içerik */}
            <div className="flex-1 overflow-x-hidden overflow-y-auto bg-white dark:bg-slate-900 p-6">
              {children}
            </div>
          </div>
          <ThemeToggle />
        </ThemeProvider>
      </body>
    </html>
  );
}
