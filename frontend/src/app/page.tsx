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
  warningCount: number;
  avgResponseTime: number;
  avgUptimePercentage: number;
};

export default function HomePage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
  const [groupedData, setGroupedData] = useState<ServiceGroupMetrics[]>([]);

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${apiUrl}/api/v1/services`);
      const serviceList = (response.data.services || []) as Service[];
      const servicesWithUptime = serviceList.map((s) => ({
        ...s,
        uptimePercentage: s.uptimePercentage ?? 0,
      }));

      setServices(servicesWithUptime);
      setError('');
      const groups = groupByCluster(servicesWithUptime);
      setGroupedData(groups);
    } catch (err) {
      console.error("Servisler yüklenirken hata oluştu:", err);
      setError("Servis listesi yüklenirken bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  const groupByCluster = (list: Service[]): ServiceGroupMetrics[] => {
    const groupMap: { [clusterName: string]: Service[] } = {};

    list.forEach((svc) => {
      const clusterKey = svc.cluster || "default";
      if (!groupMap[clusterKey]) {
        groupMap[clusterKey] = [];
      }
      groupMap[clusterKey].push(svc);
    });

    const result: ServiceGroupMetrics[] = Object.keys(groupMap).map((clusterName) => {
      const groupServices = groupMap[clusterName];
      const total = groupServices.length;
      const upCount = groupServices.filter((s) => s.status?.toLowerCase() === "up").length;
      const downCount = groupServices.filter((s) => s.status?.toLowerCase() === "down").length;
      const warningCount = groupServices.filter((s) => s.status?.toLowerCase() === "warning").length;
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
        warningCount,
        avgResponseTime,
        avgUptimePercentage,
      };
    });

    return result;
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-100 to-white dark:from-slate-800 dark:to-slate-900 py-16 sm:py-24">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-blue-500/10 dark:from-emerald-500/5 dark:to-blue-500/5"></div>
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 dark:text-white mb-6">
              Kubernetes İzleme Paneli
            </h1>
            <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-300 mb-8 max-w-3xl mx-auto">
              Kubernetes servislerinizi gerçek zamanlı izleyin, performans metriklerini analiz edin ve sorunları hızlıca tespit edin.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/services" className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors duration-150">
                Servisleri Görüntüle
              </Link>
              <Link href="/test-uptime" className="inline-flex items-center justify-center px-6 py-3 border border-slate-300 dark:border-slate-600 text-base font-medium rounded-lg text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors duration-150">
                Uptime Testi Yap
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* İstatistikler */}
      <section className="py-12 sm:py-16 bg-slate-50 dark:bg-slate-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-8 text-center">
            Cluster Durumu
          </h2>
          
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-300 dark:border-slate-600 border-t-emerald-600 dark:border-t-emerald-500"></div>
              <p className="mt-4 text-slate-600 dark:text-slate-400">Veriler yükleniyor...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
                <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-red-600 dark:text-red-400">{error}</p>
            </div>
          ) : groupedData.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-600 dark:text-slate-400">Henüz cluster bulunmuyor.</p>
            </div>
          ) : (
            <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {groupedData.map((group) => (
                <Link key={group.groupName} href={`/groups/${group.groupName}`}>
                  <div className="block bg-white dark:bg-slate-800 rounded-xl shadow-sm hover:shadow-md dark:shadow-slate-700/10 transition-shadow duration-150 p-6 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                        {group.groupName}
                      </h3>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium
                        ${group.downCount > 0
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : group.warningCount > 0
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        }`}>
                        {group.downCount > 0 ? 'Kritik' : group.warningCount > 0 ? 'Uyarı' : 'Sağlıklı'}
                      </span>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-600 dark:text-slate-400">Toplam Servis</span>
                        <span className="font-medium text-slate-900 dark:text-white">{group.total}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-600 dark:text-slate-400">Çalışan</span>
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">{group.upCount}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-600 dark:text-slate-400">Çalışmayan</span>
                        <span className="font-medium text-red-600 dark:text-red-400">{group.downCount}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-600 dark:text-slate-400">Uyarı</span>
                        <span className="font-medium text-amber-600 dark:text-amber-400">{group.warningCount}</span>
                      </div>
                      <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-600 dark:text-slate-400">Ort. Yanıt Süresi</span>
                          <span className="font-medium text-slate-900 dark:text-white">{group.avgResponseTime.toFixed(0)} ms</span>
                        </div>
                        <div className="flex justify-between items-center text-sm mt-2">
                          <span className="text-slate-600 dark:text-slate-400">Ort. Uptime</span>
                          <span className="font-medium text-slate-900 dark:text-white">{group.avgUptimePercentage.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Özellikler */}
      <section className="py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-8 text-center">
            Özellikler
          </h2>
          <div className="grid gap-8 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            <div className="p-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                Gerçek Zamanlı İzleme
              </h3>
              <p className="text-slate-600 dark:text-slate-400">
                Tüm Kubernetes servislerinizi anlık olarak izleyin ve performans metriklerini takip edin.
              </p>
            </div>

            <div className="p-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                Detaylı Metrikler
              </h3>
              <p className="text-slate-600 dark:text-slate-400">
                Uptime, yanıt süreleri ve diğer önemli metrikleri görselleştirin ve analiz edin.
              </p>
            </div>

            <div className="p-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
              <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                Akıllı Bildirimler
              </h3>
              <p className="text-slate-600 dark:text-slate-400">
                Servis kesintileri ve performans sorunları için anında bildirimler alın.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
