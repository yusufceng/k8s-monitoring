"use client";

import React, { useState, useEffect } from "react";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ChartDetailModal from "@/components/ChartDetailModal";

export type Service = {
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

export type UptimeCheck = {
  id: number;
  status: string;
  response_time?: number;
  error_message?: string;
  timestamp: string;
};

const exportOptions = [
  { label: "Son 1 saat", value: "1h" },
  { label: "Son 1 gün", value: "1d" },
  { label: "Son 1 hafta", value: "1w" },
  { label: "Son 1 ay", value: "1m" },
  { label: "Son 6 ay", value: "6m" },
  { label: "Son 9 ay", value: "9m" },
  { label: "Son 1 yıl", value: "1y" },
];

export default function ServiceDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

  const [service, setService] = useState<Service | null>(null);
  const [uptimeChecks, setUptimeChecks] = useState<UptimeCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showChartModal, setShowChartModal] = useState(false);

  // Export state
  const [exportRange, setExportRange] = useState("1d");

  const fetchServiceDetail = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${apiUrl}/api/v1/services/${id}`);
      setService(response.data.service);
      setUptimeChecks(response.data.uptime_checks || []);
      setError("");
    } catch (err) {
      console.error("Servis detayları yüklenirken hata oluştu:", err);
      setError("Servis detayları yüklenirken bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchServiceDetail();
    }
  }, [id]);

  // Export handler: seçilen zaman aralığına göre export dosyasını indirir
  const handleExport = () => {
    if (service) {
      // Örneğin API endpointiniz aşağıdaki gibi olabilir:
      // GET /api/v1/services/:id/export?range=1d
      const exportUrl = `${apiUrl}/api/v1/services/${service.id}/export?range=${exportRange}`;
      window.location.href = exportUrl;
    }
  };

  const handleDelete = async () => {
    try {
      const response = await axios.delete(`${apiUrl}/api/v1/services/${id}`);
      if (response.status === 200) {
        router.push("/services");
      } else {
        throw new Error("Silme işlemi başarısız oldu.");
      }
    } catch (err) {
      console.error("Servis silinirken hata oluştu:", err);
      setError("Servis silinirken bir hata oluştu.");
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!service) return;

    try {
      const response = await axios.put(`${apiUrl}/api/v1/services/${service.id}`, service);
      
      if (response.data.success) {
        setShowEditModal(false);
        setSuccess("Servis başarıyla güncellendi.");
        fetchServiceDetail(); // Servisi yeniden yükle
      } else {
        throw new Error(response.data.error || "Güncelleme başarısız oldu.");
      }
    } catch (err) {
      console.error("Servis güncellenirken hata oluştu:", err);
      setError("Servis güncellenirken bir hata oluştu.");
    }
  };

  if (loading) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <p className="text-center text-gray-600">Yükleniyor...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
        <Link href="/services" className="text-blue-600 hover:underline">
          Servislere Dön
        </Link>
      </div>
    );
  }

  if (!service) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <p className="text-center text-gray-600">Servis bulunamadı.</p>
        <Link href="/services" className="text-blue-600 hover:underline block text-center mt-4">
          Servislere Dön
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          {success}
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
        <div className="mb-6">
          <h1 className="text-4xl font-bold text-slate-800 dark:text-slate-100">{service.name}</h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">Namespace: {service.namespace}</p>
          <p className="text-lg text-slate-600 dark:text-slate-400">Cluster: {service.cluster}</p>
          <p className="text-lg text-slate-600 dark:text-slate-400">Servis Türü: {service.type}</p>
          {service.endpoint && (
            <p className="text-lg text-slate-600 dark:text-slate-400">Endpoint: {service.endpoint}</p>
          )}
        </div>

        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setShowEditModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
          >
            Düzenle
          </button>
          <button
            onClick={handleDelete}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
          >
            Sil
          </button>
          <button
            onClick={() => setShowChartModal(true)}
            className="px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-700 transition"
          >
            Grafik Detayları
          </button>
        </div>

        <Link
          href="/services"
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          Servislere Dön
        </Link>
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-900/50 dark:bg-slate-900/70 z-50 p-4 overflow-y-auto">
          <div className="relative bg-white dark:bg-slate-800 w-full max-w-lg rounded-lg shadow-xl">
            <div className="max-h-[90vh] overflow-y-auto p-4 sm:p-6">
              <h2 className="text-xl sm:text-2xl font-bold mb-4 text-slate-800 dark:text-slate-100">Servisi Düzenle</h2>
              <form onSubmit={handleUpdate}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Servis Adı</label>
                  <input
                    type="text"
                    value={service.name}
                    onChange={(e) => setService({ ...service, name: e.target.value })}
                    className="w-full p-2 border rounded bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring focus:border-blue-500"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Namespace</label>
                  <input
                    type="text"
                    value={service.namespace}
                    onChange={(e) => setService({ ...service, namespace: e.target.value })}
                    className="w-full p-2 border rounded bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring focus:border-blue-500"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Cluster</label>
                  <input
                    type="text"
                    value={service.cluster}
                    onChange={(e) => setService({ ...service, cluster: e.target.value })}
                    className="w-full p-2 border rounded bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring focus:border-blue-500"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Servis Türü</label>
                  <input
                    type="text"
                    value={service.type}
                    onChange={(e) => setService({ ...service, type: e.target.value })}
                    className="w-full p-2 border rounded bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring focus:border-blue-500"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Endpoint</label>
                  <input
                    type="text"
                    value={service.endpoint || ""}
                    onChange={(e) => setService({ ...service, endpoint: e.target.value })}
                    className="w-full p-2 border rounded bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring focus:border-blue-500"
                  />
                </div>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Kontrol Aralığı (sn)</label>
                  <input
                    type="number"
                    value={service.check_interval || 60}
                    onChange={(e) => setService({ ...service, check_interval: parseInt(e.target.value) })}
                    className="w-full p-2 border rounded bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring focus:border-blue-500"
                    min="5"
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

      {/* Chart Modal */}
      {showChartModal && (
        <ChartDetailModal
          serviceId={service.id}
          onClose={() => setShowChartModal(false)}
        />
      )}
    </div>
  );
}
