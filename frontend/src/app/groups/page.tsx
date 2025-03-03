//src/app/groups///page.tsx

"use client";

import React, { useState, useEffect } from "react";
import axios from "axios";
import { ServiceCard, Service } from "@/components/ServiceCard";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDebounce } from "@/hooks/useDebounce";

export default function GroupsPage() {
  const router = useRouter();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
  
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterText, setFilterText] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSuccess, setFilterSuccess] = useState<string | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);
  
  const debouncedFilterText = useDebounce(filterText, 300);

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${apiUrl}/api/v1/services`);
      const servicesWithUptime = (response.data.services || []).map((s: Service) => ({
        ...s,
        uptimePercentage: s.uptimePercentage ?? 0,
      }));
      setServices(servicesWithUptime);
      setError("");
    } catch (err) {
      console.error("Servisler yüklenirken hata oluştu:", err);
      setError("Servis listesi yüklenirken bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (svc: Service) => {
    try {
      router.push(`/services/${svc.id}`);
    } catch (err) {
      console.error("Düzenleme sayfasına yönlendirme hatası:", err);
      setFilterError("Düzenleme sayfasına yönlendirilemedi.");
    }
  };

  const handleDelete = async (svc: Service) => {
    if (!confirm(`${svc.name} servisini silmek istediğinizden emin misiniz?`)) {
      return;
    }

    try {
      const response = await axios.delete(`${apiUrl}/api/v1/services/${svc.id}`);
      
      if (response.status === 200) {
        setFilterSuccess("Servis başarıyla silindi.");
        // Servisleri güncelle
        const updatedServices = await axios.get(`${apiUrl}/api/v1/services`);
        setServices(updatedServices.data.services || []);
      } else {
        throw new Error("Silme işlemi başarısız oldu.");
      }
    } catch (err) {
      console.error("Servis silinirken hata oluştu:", err);
      setFilterError("Servis silinirken bir hata oluştu.");
    }

    // 3 saniye sonra mesajları temizle
    setTimeout(() => {
      setFilterSuccess(null);
      setFilterError(null);
    }, 3000);
  };

  const handleChart = async (svc: Service) => {
    try {
      router.push(`/services/${svc.id}/chart`);
    } catch (err) {
      console.error("Grafik sayfasına yönlendirme hatası:", err);
      setFilterError("Grafik sayfasına yönlendirilemedi.");
    }
  };

  // Filtreleme fonksiyonunu güncelle
  const filteredServices = React.useMemo(() => {
    return services.filter((svc) => {
      const searchText = debouncedFilterText.toLowerCase();
      const matchesText = 
        svc.name.toLowerCase().includes(searchText) ||
        svc.namespace.toLowerCase().includes(searchText) ||
        (svc.cluster && svc.cluster.toLowerCase().includes(searchText));
      
      const matchesStatus = filterStatus === "all" || 
        (svc.status && svc.status.toLowerCase() === filterStatus.toLowerCase());
      
      return matchesText && matchesStatus;
    });
  }, [services, debouncedFilterText, filterStatus]);

  // Gruplandırma fonksiyonunu güncelle
  const groupedServices = React.useMemo(() => {
    return filteredServices.reduce((acc, service) => {
      const clusterName = service.cluster || "default";
      if (!acc[clusterName]) {
        acc[clusterName] = [];
      }
      acc[clusterName].push(service);
      return acc;
    }, {} as Record<string, Service[]>);
  }, [filteredServices]);

  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-3xl sm:text-4xl font-bold mb-4 sm:mb-6 text-slate-800 dark:text-slate-100">Cluster Grupları</h1>

      {/* Başarı ve Hata Mesajları */}
      {filterSuccess && (
        <div className="mb-4 p-4 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-lg">
          {filterSuccess}
        </div>
      )}
      {filterError && (
        <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg">
          {filterError}
        </div>
      )}

      {/* Arama ve filtreleme alanı */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mb-4 sm:mb-6">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Servis adı, namespace veya cluster'a göre ara..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="w-full px-4 py-2 pl-10 border rounded bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring focus:border-slate-500 dark:focus:border-slate-400"
          />
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="w-full sm:w-auto px-4 py-2 border rounded bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring focus:border-slate-500 dark:focus:border-slate-400"
        >
          <option value="all">Tüm Durumlar</option>
          <option value="up">Çalışıyor</option>
          <option value="down">Çalışmıyor</option>
          <option value="warning">Uyarı</option>
          <option value="unknown">Bilinmiyor</option>
        </select>
      </div>

      {loading ? (
        <p className="text-center text-slate-600 dark:text-slate-400">Servisler yükleniyor...</p>
      ) : error ? (
        <p className="text-center text-red-600 dark:text-red-400">{error}</p>
      ) : Object.keys(groupedServices).length === 0 ? (
        <p className="text-center text-slate-600 dark:text-slate-400">Filtrelemeye uygun servis bulunamadı.</p>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedServices).map(([clusterName, clusterServices]) => (
            <div key={clusterName} className="bg-white dark:bg-slate-800 rounded-lg shadow-md p-4 sm:p-6">
              <h2 className="text-xl sm:text-2xl font-bold mb-4 text-slate-800 dark:text-slate-100">
                Cluster: {clusterName}
              </h2>
              <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {clusterServices.map((svc) => (
                  <ServiceCard
                    key={svc.id}
                    service={svc}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onChart={handleChart}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 sm:mt-8">
        <Link href="/services" className="text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 underline text-sm sm:text-base">
          Tüm Servisleri Görüntüle
        </Link>
      </div>
    </div>
  );
}
