"use client";

import React, { useState, useEffect } from "react";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ServiceCard, Service } from "@/components/ServiceCard";
import ChartDetailModal from "@/components/ChartDetailModal";
import { useDebounce } from "@/hooks/useDebounce";

export default function GroupDetailsPage() {
  const params = useParams();
  const router = useRouter();
  
  // clusterName parametresini string olarak elde ediyoruz
  const clusterNameRaw = params.clusterName;
  const clusterName = Array.isArray(clusterNameRaw) ? clusterNameRaw[0] : clusterNameRaw || "";
  
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Arama ve filtre state'leri
  const [filterText, setFilterText] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSuccess, setFilterSuccess] = useState<string | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);

  // Filtreleme performansını artırmak için debounce ekleyelim
  const debouncedFilterText = useDebounce(filterText, 300);

  // Modal state'leri
  const [showChartModal, setShowChartModal] = useState(false);
  const [chartService, setChartService] = useState<Service | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<Service | null>(null);

  useEffect(() => {
    fetchGroupServices();
  }, [clusterName, debouncedFilterText, filterStatus]);

  const fetchGroupServices = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${apiUrl}/api/v1/services`);
      const allServices = (response.data.services || []) as Service[];
      
      // Uptime yüzdesi varsa kullan, yoksa sıfır ata
      const servicesWithUptime = allServices.map((s) => ({
        ...s,
        uptimePercentage: s.uptimePercentage ?? 0,
      }));
      
      // Filtre: sadece bu cluster adına sahip servisler
      const filtered = servicesWithUptime.filter(
        (s) => s.cluster.toLowerCase() === clusterName.toLowerCase()
      );
      
      // Ek filtreleme: servis adı ve durum
      const finalFiltered = filtered.filter((s) => {
        const matchesText = 
          !debouncedFilterText || 
          s.name.toLowerCase().includes(debouncedFilterText.toLowerCase()) ||
          s.namespace.toLowerCase().includes(debouncedFilterText.toLowerCase());
        
        const matchesStatus =
          filterStatus === "all" || 
          (s.status && s.status.toLowerCase() === filterStatus);
        
        return matchesText && matchesStatus;
      });
      
      setServices(finalFiltered);
      setError("");
    } catch (err) {
      console.error("Servisler yüklenirken hata oluştu:", err);
      setError("Servis listesi yüklenirken bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  const handleChart = async (svc: Service) => {
    try {
      router.push(`/services/${svc.id}/chart`);
    } catch (err) {
      console.error("Grafik sayfasına yönlendirme hatası:", err);
      setFilterError("Grafik sayfasına yönlendirilemedi.");
      setTimeout(() => setFilterError(null), 3000);
    }
  };

  const handleEdit = async (svc: Service) => {
    try {
      router.push(`/services/${svc.id}`);
    } catch (err) {
      console.error("Düzenleme sayfasına yönlendirme hatası:", err);
      setFilterError("Düzenleme sayfasına yönlendirilemedi.");
      setTimeout(() => setFilterError(null), 3000);
    }
  };

  const handleDelete = async (svc: Service) => {
    setServiceToDelete(svc);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!serviceToDelete) return;

    try {
      const response = await axios.delete(`${apiUrl}/api/v1/services/${serviceToDelete.id}`);
      
      if (response.status === 200) {
        setShowDeleteModal(false);
        setServiceToDelete(null);
        setFilterSuccess("Servis başarıyla silindi.");
        
        // Servisleri yeniden yükle
        await fetchGroupServices();
      } else {
        throw new Error("Silme işlemi başarısız oldu.");
      }
    } catch (err) {
      console.error("Servis silinirken hata oluştu:", err);
      setFilterError("Servis silinirken bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      // 3 saniye sonra mesajları temizle
      setTimeout(() => {
        setFilterSuccess(null);
        setFilterError(null);
      }, 3000);
    }
  };

  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-3xl sm:text-4xl font-bold mb-4 sm:mb-6 text-slate-800 dark:text-slate-100">
        {clusterName} Cluster Servisleri
      </h1>

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
            placeholder="Servis adı veya namespace'e göre ara..."
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
      ) : services.length === 0 ? (
        <p className="text-center text-slate-600 dark:text-slate-400">
          Bu cluster altında filtrelemeye uygun servis bulunamadı.
        </p>
      ) : (
        <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {services.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onChart={handleChart}
            />
          ))}
        </div>
      )}

      <div className="mt-6 sm:mt-8">
        <Link href="/services" className="text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 underline text-sm sm:text-base">
          Tüm Servisleri Görüntüle
        </Link>
      </div>

      {/* Chart Detail Modal */}
      {showChartModal && chartService && (
        <ChartDetailModal
          serviceId={chartService.id}
          onClose={() => setShowChartModal(false)}
        />
      )}

      {/* Delete Modal */}
      {showDeleteModal && serviceToDelete && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-900/50 dark:bg-slate-900/70 z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg w-full max-w-sm mx-auto p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-bold mb-4 text-slate-800 dark:text-slate-100">Servisi Sil</h2>
            <p className="mb-6 text-slate-600 dark:text-slate-300 text-sm sm:text-base">
              <span className="font-semibold">{serviceToDelete.name}</span> adlı servisi silmek istediğinizden emin misiniz?
              <br />
              <span className="text-red-500 text-xs mt-2 block">Bu işlem geri alınamaz!</span>
            </p>
            <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-4">
              <button
                type="button"
                className="w-full sm:w-auto px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                onClick={() => {
                  setShowDeleteModal(false);
                  setServiceToDelete(null);
                }}
              >
                İptal
              </button>
              <button
                type="button"
                className="w-full sm:w-auto px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 transition-colors"
                onClick={confirmDelete}
              >
                Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
