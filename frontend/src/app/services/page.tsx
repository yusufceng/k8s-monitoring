"use client";

import React, { useState, useEffect } from "react";
import axios from "axios";
import { ServiceCard, Service } from "@/components/ServiceCard";
import Link from "next/link";
import ChartDetailModal from "@/components/ChartDetailModal";
import { useDebounce } from "@/hooks/useDebounce";

export default function ServicesPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

  const [services, setServices] = useState<Service[]>([]);
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filtreleme state'leri
  const [filterText, setFilterText] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterNamespace, setFilterNamespace] = useState("all");
  const [filterSuccess, setFilterSuccess] = useState<string | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);

  // Modal state'leri
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<Service | null>(null);
  const [showChartModal, setShowChartModal] = useState(false);
  const [chartService, setChartService] = useState<Service | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newService, setNewService] = useState<Omit<Service, "id" | "uptimePercentage">>({
    name: "",
    namespace: "default",
    cluster: "default",
    type: "",
    endpoint: "",
    check_interval: 60,
    status: "",
    lastCheck: "",
    responseTime: 0,
  });

  // Filtreleme performansını artırmak için debounce ekleyelim
  const debouncedFilterText = useDebounce(filterText, 300);

  useEffect(() => {
    fetchServices();
    fetchNamespaces();
  }, []);

  const fetchServices = async () => {
    setLoading(true);
    setFilterError(null);
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

  const fetchNamespaces = async () => {
    try {
      const response = await axios.get(`${apiUrl}/api/v1/mergedNamespaces`);
      if (response.data.namespaces && response.data.namespaces.length > 0) {
        setNamespaces(response.data.namespaces);
      } else {
        setNamespaces(["default"]);
      }
    } catch (err) {
      console.error("Namespace listesi yüklenirken hata oluştu:", err);
      setNamespaces(["default"]);
    }
  };

  // Filtreleme fonksiyonunu optimize edelim
  const filteredServices = React.useMemo(() => {
    return services.filter((svc) => {
      const matchesText = svc.name.toLowerCase().includes(debouncedFilterText.toLowerCase()) ||
                         svc.namespace.toLowerCase().includes(debouncedFilterText.toLowerCase()) ||
                         svc.cluster.toLowerCase().includes(debouncedFilterText.toLowerCase());
      const matchesStatus =
        filterStatus === "all" || (svc.status && svc.status.toLowerCase() === filterStatus);
      const matchesNamespace =
        filterNamespace === "all" ||
        (svc.namespace && svc.namespace.toLowerCase() === filterNamespace.toLowerCase());
      return matchesText && matchesStatus && matchesNamespace;
    });
  }, [services, debouncedFilterText, filterStatus, filterNamespace]);

  // Edit Modal submit handler
  const updateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedService) return;
    try {
      const response = await axios.put(`${apiUrl}/api/v1/services/${selectedService.id}`, selectedService);
      
      if (response.status === 200) {
        setShowEditModal(false);
        setFilterSuccess("Servis başarıyla güncellendi.");
        
        // Servisleri ve namespace'leri güncelle
        const updatedServices = await axios.get(`${apiUrl}/api/v1/services`);
        setServices(updatedServices.data.services || []);
        
        const updatedNamespaces = await axios.get(`${apiUrl}/api/v1/mergedNamespaces`);
        setNamespaces(updatedNamespaces.data.namespaces || ["default"]);
      } else {
        throw new Error("Güncelleme işlemi başarısız oldu.");
      }
    } catch (err) {
      console.error("Servis güncellenirken hata oluştu:", err);
      setFilterError("Servis güncellenirken bir hata oluştu.");
    } finally {
      // 3 saniye sonra mesajları temizle
      setTimeout(() => {
        setFilterSuccess(null);
        setFilterError(null);
      }, 3000);
    }
  };

  // Delete Modal confirm handler
  const confirmDelete = async () => {
    if (!serviceToDelete) return;

    try {
      console.log('Silme işlemi başlatılıyor. Servis detayları:', {
        id: serviceToDelete.id,
        name: serviceToDelete.name,
        namespace: serviceToDelete.namespace
      });

      const response = await axios.delete(`${apiUrl}/api/v1/services/${serviceToDelete.id}`);
      console.log('Backend yanıtı:', {
        status: response.status,
        statusText: response.statusText,
        data: response.data
      });
      
      if (response.status === 200) {
        setShowDeleteModal(false);
        setServiceToDelete(null);
        setFilterSuccess("Servis başarıyla silindi.");
        
        // Servisleri yeniden yükle
        await fetchServices();
      } else {
        console.error('Silme işlemi başarısız. Yanıt:', response.data);
        throw new Error("Silme işlemi başarısız oldu.");
      }
    } catch (error: any) {
      console.error("Servis silinirken detaylı hata:", {
        error,
        message: error.message,
        response: error.response,
        request: error.request
      });
      
      if (axios.isAxiosError(error)) {
        console.error('Axios hatası detayları:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message
        });
      }
      
      setFilterError(`Servis silinirken bir hata oluştu: ${error.message}`);
    } finally {
      // 3 saniye sonra mesajları temizle
      setTimeout(() => {
        setFilterSuccess(null);
        setFilterError(null);
      }, 3000);
    }
  };

  // Add Modal submit handler
  const addService = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Form validasyonu
      if (!newService.name.trim()) {
        setFilterError("Servis adı boş olamaz.");
        return;
      }
      if (!newService.namespace.trim()) {
        setFilterError("Namespace boş olamaz.");
        return;
      }
      if (!newService.cluster.trim()) {
        setFilterError("Cluster boş olamaz.");
        return;
      }
      if (!newService.type.trim()) {
        setFilterError("Servis türü boş olamaz.");
        return;
      }

      const response = await axios.post(`${apiUrl}/api/v1/services`, newService);
      setShowAddModal(false);
      setFilterSuccess("Servis başarıyla eklendi.");
      // Formu sıfırla
      setNewService({
        name: "",
        namespace: "default",
        cluster: "default",
        type: "",
        endpoint: "",
        check_interval: 60,
        status: "",
        lastCheck: "",
        responseTime: 0,
      });
      // Liste ve namespace'leri güncelle
      await fetchServices();
      await fetchNamespaces();
      // 3 saniye sonra başarı mesajını kaldır
      setTimeout(() => setFilterSuccess(null), 3000);
    } catch (err) {
      console.error("Servis eklenirken hata oluştu:", err);
      setFilterError("Servis eklenirken bir hata oluştu.");
      // 3 saniye sonra hata mesajını kaldır
      setTimeout(() => setFilterError(null), 3000);
    }
  };

  const handleEdit = (svc: Service) => {
    setSelectedService(svc);
    setShowEditModal(true);
  };

  const handleDelete = async (svc: Service) => {
    setServiceToDelete(svc);
    setShowDeleteModal(true);
  };

  const handleChart = (svc: Service) => {
    setChartService(svc);
    setShowChartModal(true);
  };

  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-3xl sm:text-4xl font-bold mb-4 sm:mb-6 text-slate-800 dark:text-slate-100">Servisler</h1>

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

      {/* Servis Ekle Butonu */}
      <div className="mb-4 sm:mb-6">
        <button
          onClick={() => setShowAddModal(true)}
          className="w-full sm:w-auto px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors"
        >
          Yeni Servis Ekle
        </button>
      </div>

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
        <select
          value={filterNamespace}
          onChange={(e) => setFilterNamespace(e.target.value)}
          className="w-full sm:w-auto px-4 py-2 border rounded bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring focus:border-slate-500 dark:focus:border-slate-400"
        >
          <option value="all">Tüm Namespace'ler</option>
          {namespaces.map((ns) => (
            <option key={ns} value={ns}>
              {ns}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-center text-slate-600 dark:text-slate-400">Servisler yükleniyor...</p>
      ) : error ? (
        <p className="text-center text-red-600 dark:text-red-400">{error}</p>
      ) : filteredServices.length === 0 ? (
        <p className="text-center text-slate-600 dark:text-slate-400">Filtrelemeye uygun servis bulunamadı.</p>
      ) : (
        <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredServices.map((svc) => (
            <ServiceCard
              key={svc.id}
              service={svc}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onChart={handleChart}
            />
          ))}
        </div>
      )}

      <div className="mt-6 sm:mt-8">
        <Link href="/groups" className="text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 underline text-sm sm:text-base">
          Grupları Görüntüle
        </Link>
      </div>

      {/* Edit Modal */}
      {showEditModal && selectedService && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-900/50 dark:bg-slate-900/70 z-50 p-4 overflow-y-auto">
          <div className="relative bg-white dark:bg-slate-800 w-full max-w-lg rounded-lg shadow-xl">
            <div className="max-h-[90vh] overflow-y-auto p-4 sm:p-6">
              <h2 className="text-xl sm:text-2xl font-bold mb-4 text-slate-800 dark:text-slate-100">Servisi Düzenle</h2>
              <form onSubmit={updateService}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Servis Adı</label>
                  <input
                    type="text"
                    value={selectedService.name}
                    onChange={(e) =>
                      setSelectedService({ ...selectedService, name: e.target.value })
                    }
                    className="w-full p-2 border rounded bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring focus:border-slate-500 dark:focus:border-slate-400"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Namespace</label>
                  <input
                    type="text"
                    value={selectedService.namespace}
                    onChange={(e) =>
                      setSelectedService({ ...selectedService, namespace: e.target.value })
                    }
                    className="w-full p-2 border rounded bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring focus:border-slate-500 dark:focus:border-slate-400"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Cluster</label>
                  <input
                    type="text"
                    value={selectedService.cluster}
                    onChange={(e) =>
                      setSelectedService({ ...selectedService, cluster: e.target.value })
                    }
                    className="w-full p-2 border rounded bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring focus:border-slate-500 dark:focus:border-slate-400"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Servis Türü</label>
                  <input
                    type="text"
                    value={selectedService.type}
                    onChange={(e) =>
                      setSelectedService({ ...selectedService, type: e.target.value })
                    }
                    className="w-full p-2 border rounded bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring focus:border-slate-500 dark:focus:border-slate-400"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Endpoint</label>
                  <input
                    type="text"
                    value={selectedService.endpoint || ""}
                    onChange={(e) =>
                      setSelectedService({ ...selectedService, endpoint: e.target.value })
                    }
                    className="w-full p-2 border rounded bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring focus:border-slate-500 dark:focus:border-slate-400"
                  />
                </div>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Kontrol Aralığı (sn)</label>
                  <input
                    type="number"
                    value={selectedService.check_interval || 60}
                    onChange={(e) =>
                      setSelectedService({
                        ...selectedService,
                        check_interval: parseInt(e.target.value),
                      })
                    }
                    min="5"
                    className="w-full p-2 border rounded bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring focus:border-slate-500 dark:focus:border-slate-400"
                  />
                </div>
                <div className="flex justify-end space-x-4">
                  <button
                    type="button"
                    className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                    onClick={() => setShowEditModal(false)}
                  >
                    İptal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
                  >
                    Güncelle
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
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

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-900/50 dark:bg-slate-900/70 z-50 p-4 overflow-y-auto">
          <div className="relative bg-white dark:bg-slate-800 w-full max-w-lg rounded-lg shadow-xl">
            <div className="max-h-[90vh] overflow-y-auto p-4 sm:p-6">
              <h2 className="text-xl sm:text-2xl font-bold mb-4 text-slate-800 dark:text-slate-100">Yeni Servis Ekle</h2>
              <form onSubmit={addService}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Servis Adı</label>
                  <input
                    type="text"
                    value={newService.name}
                    onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                    className="w-full p-2 border rounded bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring focus:border-slate-500 dark:focus:border-slate-400"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Namespace</label>
                  <input
                    type="text"
                    value={newService.namespace}
                    onChange={(e) => setNewService({ ...newService, namespace: e.target.value })}
                    className="w-full p-2 border rounded bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring focus:border-slate-500 dark:focus:border-slate-400"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Cluster</label>
                  <input
                    type="text"
                    value={newService.cluster}
                    onChange={(e) => setNewService({ ...newService, cluster: e.target.value })}
                    className="w-full p-2 border rounded bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring focus:border-slate-500 dark:focus:border-slate-400"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Servis Türü</label>
                  <input
                    type="text"
                    value={newService.type}
                    onChange={(e) => setNewService({ ...newService, type: e.target.value })}
                    className="w-full p-2 border rounded bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring focus:border-slate-500 dark:focus:border-slate-400"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Endpoint</label>
                  <input
                    type="text"
                    value={newService.endpoint || ""}
                    onChange={(e) => setNewService({ ...newService, endpoint: e.target.value })}
                    className="w-full p-2 border rounded bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring focus:border-slate-500 dark:focus:border-slate-400"
                  />
                </div>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Kontrol Aralığı (sn)</label>
                  <input
                    type="number"
                    value={newService.check_interval}
                    onChange={(e) =>
                      setNewService({ ...newService, check_interval: parseInt(e.target.value) })
                    }
                    min="5"
                    className="w-full p-2 border rounded bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring focus:border-slate-500 dark:focus:border-slate-400"
                  />
                </div>
                <div className="flex justify-end space-x-4">
                  <button
                    type="button"
                    className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                    onClick={() => setShowAddModal(false)}
                  >
                    İptal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors"
                  >
                    Ekle
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Chart Detail Modal */}
      {showChartModal && chartService && (
        <ChartDetailModal
          serviceId={chartService.id}
          onClose={() => setShowChartModal(false)}
        />
      )}
    </div>
  );
}
