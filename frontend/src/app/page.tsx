"use client";

import React from 'react';

export default function Home() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">K8s Monitoring Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-700">Toplam Servisler</h2>
          <p className="text-4xl font-bold">0</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-700">Aktif Alarmlar</h2>
          <p className="text-4xl font-bold">0</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-700">Down Servisler</h2>
          <p className="text-4xl font-bold text-red-500">0</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-700">Uptime Oranı</h2>
          <p className="text-4xl font-bold">100%</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Servis Durumu</h2>
        <p>Henüz servis durumu verisi yok.</p>
      </div>
    </div>
  );
}
