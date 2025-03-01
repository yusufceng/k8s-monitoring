import './globals.css';
import React from 'react';
import Link from 'next/link';

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
      <body>
        <div className="flex h-screen bg-gray-100">
          {/* Kenar Çubuğu */}
          <div className="bg-gray-800 text-white w-64 space-y-6 py-7 px-2 absolute inset-y-0 left-0 transform -translate-x-full md:relative md:translate-x-0 transition duration-200 ease-in-out">
            <div className="flex items-center space-x-4 px-4">
              <div className="text-2xl font-extrabold">K8s Monitor</div>
            </div>
            <nav>
              <Link href="/" className="block py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700">
                Dashboard
              </Link>
              <Link href="/services" className="block py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700">
                Servisler
              </Link>
              <Link href="/alerts" className="block py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700">
                Alarmlar
              </Link>
              <Link href="/settings" className="block py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700">
                Ayarlar
              </Link>
            </nav>
          </div>

          {/* Ana içerik */}
          <div className="flex-1 overflow-x-hidden overflow-y-auto">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
