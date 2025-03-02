"use client";

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Link from 'next/link';

type Service = {
  id: number;
  name: string;
  namespace: string;
  cluster: string;
  type: string;
  endpoint?: string;
  check_interval?: number;
  status?: string;
  lastCheck?: string;
  responseTime?: number;
  uptimePercentage?: number;
};

type ServiceGroupMetrics = {
  groupName: string; // örn. cluster adı
  total: number;
  upCount: number;
  downCount: number;
  avgResponseTime: number;
  avgUptimePercentage: number;
};

export default function HomePage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

  // Gruplanmış verileri saklamak için state
  const [groupedData, setGroupedData] = useState<ServiceGroupMetrics[]>([]);

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${apiUrl}/api/v1/services`);
      const serviceList = (response.data.services || []) as Service[];
      
      // UptimePercentage API dönmüyorsa default 0 atayabilirsiniz
      const servicesWithUptime = serviceList.map((s) => ({
        ...s,
        uptimePercentage: s.uptimePercentage ?? 0,
      }));

      setServices(servicesWithUptime);
      setError('');
      setLoading(false);

      // Gruplama işlemi (cluster bazında)
      const groups = groupByCluster(servicesWithUptime);
      setGroupedData(groups);
    } catch (err) {
      console.error("Servisler yüklenirken hata oluştu:", err);
      setError("Servis listesi yüklenirken bir hata oluştu.");
      setLoading(false);
    }
  };

  // Cluster bazında gruplama ve özet metrik hesaplama
  const groupByCluster = (list: Service[]): ServiceGroupMetrics[] => {
    const groupMap: { [clusterName: string]: Service[] } = {};

    // Gruplama
    list.forEach((svc) => {
      const clusterKey = svc.cluster || "default";
      if (!groupMap[clusterKey]) {
        groupMap[clusterKey] = [];
      }
      groupMap[clusterKey].push(svc);
    });

    // Özet metrikler
    const result: ServiceGroupMetrics[] = Object.keys(groupMap).map((clusterName) => {
      const groupServices = groupMap[clusterName];
      const total = groupServices.length;
      const upCount = groupServices.filter((s) => s.status?.toLowerCase() === "up").length;
      const downCount = groupServices.filter((s) => s.status?.toLowerCase() === "down").length;
      const avgResponseTime =
        total > 0
          ? groupServices.reduce((acc, s) => acc + (s.responseTime || 0), 0) / total
          : 0;
      const avgUptimePercentage =
        total > 0
          ? groupServices.reduce((acc, s) => acc + (s.uptimePercentage || 0), 0) / total
          : 0;

      return {
        groupName: clusterName,
        total,
        upCount,
        downCount,
        avgResponseTime,
        avgUptimePercentage,
      };
    });

    return result;
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-blue-600">K8s Monitoring</h1>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-grow bg-gradient-to-r from-blue-50 to-white flex items-center justify-center py-16">
        <div className="text-center px-4">
          <h2 className="text-5xl font-extrabold text-gray-800 mb-4">
            Kubernetes İzleme Paneli
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Gerçek zamanlı Kubernetes servis izleme, uptime takibi ve performans analizi.
          </p>
          <Link href="/services">
            <a className="inline-block px-8 py-4 bg-blue-600 text-white font-semibold rounded-md shadow-md hover:bg-blue-700 transition">
              Servisleri Görüntüle
            </a>
          </Link>
        </div>
      </main>

      {/* Gruplandırılmış Servisler (Cluster Bazlı) */}
      <section className="bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4">
          <h3 className="text-2xl font-bold text-gray-700 mb-6">Cluster Grupları</h3>
          {loading ? (
            <div className="text-center text-gray-500">Yükleniyor...</div>
          ) : error ? (
            <div className="text-center text-red-500">{error}</div>
          ) : groupedData.length === 0 ? (
            <div className="text-center text-gray-500">Servis bulunamadı.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {groupedData.map((group) => (
                <Link key={group.groupName} href={`/groups/${group.groupName}`}>
                  <a className="block bg-white rounded-lg shadow p-6 hover:shadow-xl transition">
                    <h4 className="text-xl font-semibold text-gray-800 mb-2">
                      {group.groupName}
                    </h4>
                    <p className="text-sm text-gray-600">
                      Toplam Servis: <strong>{group.total}</strong>
                    </p>
                    <p className="text-sm text-green-600">
                      Up: <strong>{group.upCount}</strong>
                    </p>
                    <p className="text-sm text-red-600">
                      Down: <strong>{group.downCount}</strong>
                    </p>
                    <p className="text-sm text-gray-600">
                      Ortalama Yanıt:{" "}
                      <strong>{group.avgResponseTime.toFixed(0)} ms</strong>
                    </p>
                    <p className="text-sm text-gray-600">
                      Ortalama Uptime:{" "}
                      <strong>{group.avgUptimePercentage.toFixed(0)}%</strong>
                    </p>
                  </a>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white py-4 mt-auto">
        <div className="max-w-7xl mx-auto text-center text-gray-500">
          © {new Date().getFullYear()} K8s Monitoring. Tüm hakları saklıdır.
        </div>
      </footer>
    </div>
  );
}
