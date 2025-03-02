"use client";
import Link from "next/link";
import React, { useState, useEffect } from "react";
import axios from "axios";
import { useParams } from "next/navigation";
import { ServiceCard, Service } from "@/components/ServiceCard";
import { Line } from "react-chartjs-2";
import { ChartOptions } from "chart.js";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
} from "chart.js";
import "chartjs-adapter-date-fns";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

type UptimeRecord = {
  timestamp: string;
  responseTime: number;
  status: string;
};

type UptimeChartModalProps = {
  serviceId: number;
  onClose: () => void;
};

function UptimeChartModal({ serviceId, onClose }: UptimeChartModalProps) {
  const [history, setHistory] = useState<UptimeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchHistory();
  }, [serviceId]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/api/v1/uptime-history?serviceId=${serviceId}`
      );
      setHistory(response.data.history || []);
      setError("");
    } catch (err) {
      console.error("History data fetch error", err);
      setError("Geçmiş veriler alınırken hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  const data = {
    labels: history.map((record) => new Date(record.timestamp)),
    datasets: [
      {
        label: "Response Time (ms)",
        data: history.map((record) => record.responseTime),
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59, 130, 246, 0.5)",
        tension: 0.3,
      },
    ],
  };

  const options: ChartOptions<"line"> = {
    responsive: true,
    plugins: {
      legend: { position: "top" as const },
      title: { display: true, text: "Zaman Serisi: Yanıt Süresi" },
    },
    scales: {
      x: {
        type: "time" as const,
        time: { unit: "day" },
        title: { display: true, text: "Tarih" },
      },
      y: {
        title: { display: true, text: "Response Time (ms)" },
      },
    },
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-3xl text-gray-600 hover:text-gray-800"
        >
          &times;
        </button>
        {loading ? (
          <p className="text-center text-gray-600">Veriler yükleniyor...</p>
        ) : error ? (
          <p className="text-center text-red-600">{error}</p>
        ) : (
          <Line data={data} options={options} />
        )}
      </div>
    </div>
  );
}

export default function GroupDetailsPage() {
  const { clusterName } = useParams();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filtreleme
  const [filterText, setFilterText] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  // Modal state'leri
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<Service | null>(null);
  const [showChartModal, setShowChartModal] = useState(false);
  const [chartService, setChartService] = useState<Service | null>(null);

  useEffect(() => {
    fetchGroupServices();
  }, [clusterName]);

  const fetchGroupServices = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${apiUrl}/api/v1/services`);
      const allServices = (response.data.services || []) as Service[];
      const servicesWithUptime = allServices.map((s) => ({
        ...s,
        uptimePercentage: s.uptimePercentage ?? 0,
      }));
      const filtered = servicesWithUptime.filter((s) => s.cluster === clusterName);
      setServices(filtered);
      setError("");
    } catch (err) {
      console.error("Servisler yüklenirken hata oluştu:", err);
      setError("Servis listesi yüklenirken bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  const filteredServices = services.filter((svc) => {
    const matchesText = svc.name.toLowerCase().includes(filterText.toLowerCase());
    const matchesStatus =
      filterStatus === "all" ||
      (svc.status && svc.status.toLowerCase() === filterStatus);
    return matchesText && matchesStatus;
  });

  const handleEdit = (svc: Service) => {
    setSelectedService(svc);
    setShowEditModal(true);
  };

  const updateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedService) return;
    try {
      await axios.put(`${apiUrl}/api/v1/services/${selectedService.id}`, selectedService);
      setShowEditModal(false);
      fetchGroupServices();
    } catch (err) {
      console.error("Servis güncellenirken hata oluştu:", err);
      setError("Servis güncellenirken bir hata oluştu.");
    }
  };

  const handleDelete = (svc: Service) => {
    setServiceToDelete(svc);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!serviceToDelete) return;
    try {
      await axios.delete(`${apiUrl}/api/v1/services/${serviceToDelete.id}`);
      fetchGroupServices();
    } catch (err) {
      console.error("Servis silinirken hata oluştu:", err);
      setError("Servis silinirken bir hata oluştu.");
    } finally {
      setShowDeleteModal(false);
      setServiceToDelete(null);
    }
  };

  const handleChart = (svc: Service) => {
    setChartService(svc);
    setShowChartModal(true);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            {clusterName} Cluster Servisleri
          </h1>
          <div className="flex flex-col sm:flex-row gap-4">
            <input
              type="text"
              placeholder="Servis adına göre ara..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="px-4 py-2 border rounded focus:outline-none focus:ring focus:border-blue-300"
            />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border rounded focus:outline-none focus:ring focus:border-blue-300"
            >
              <option value="all">Tümü</option>
              <option value="up">Up</option>
              <option value="down">Down</option>
              <option value="warning">Warning</option>
              <option value="unknown">Bilinmiyor</option>
            </select>
          </div>
        </header>

        {loading ? (
          <p className="text-center text-gray-600">Servisler yükleniyor...</p>
        ) : error ? (
          <p className="text-center text-red-600">{error}</p>
        ) : filteredServices.length === 0 ? (
          <p className="text-center text-gray-600">
            Filtrelemeye uygun servis bulunamadı.
          </p>
        ) : (
          <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
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

        <div className="mt-8">
          <Link href="/services">
            <a className="text-blue-600 underline">Tüm servisleri görüntüle</a>
          </Link>
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && selectedService && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold mb-4">Servisi Düzenle</h2>
            <form onSubmit={updateService}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Servis Adı
                </label>
                <input
                  type="text"
                  value={selectedService.name}
                  onChange={(e) =>
                    setSelectedService({
                      ...selectedService,
                      name: e.target.value,
                    })
                  }
                  className="w-full p-2 border rounded focus:outline-none focus:ring"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Namespace
                </label>
                <input
                  type="text"
                  value={selectedService.namespace}
                  onChange={(e) =>
                    setSelectedService({
                      ...selectedService,
                      namespace: e.target.value,
                    })
                  }
                  className="w-full p-2 border rounded focus:outline-none focus:ring"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cluster
                </label>
                <input
                  type="text"
                  value={selectedService.cluster}
                  onChange={(e) =>
                    setSelectedService({
                      ...selectedService,
                      cluster: e.target.value,
                    })
                  }
                  className="w-full p-2 border rounded focus:outline-none focus:ring"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Servis Türü
                </label>
                <input
                  type="text"
                  value={selectedService.type}
                  onChange={(e) =>
                    setSelectedService({
                      ...selectedService,
                      type: e.target.value,
                    })
                  }
                  className="w-full p-2 border rounded focus:outline-none focus:ring"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Endpoint
                </label>
                <input
                  type="text"
                  value={selectedService.endpoint || ""}
                  onChange={(e) =>
                    setSelectedService({
                      ...selectedService,
                      endpoint: e.target.value,
                    })
                  }
                  className="w-full p-2 border rounded focus:outline-none focus:ring"
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kontrol Aralığı (sn)
                </label>
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
                  className="w-full p-2 border rounded focus:outline-none focus:ring"
                />
              </div>
              <div className="flex justify-end space-x-4">
                <button
                  type="button"
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition"
                  onClick={() => setShowEditModal(false)}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition"
                >
                  Güncelle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Silme Onay Modalı */}
      {showDeleteModal && serviceToDelete && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-sm w-full p-6">
            <h2 className="text-xl font-bold mb-4">Servisi Sil</h2>
            <p className="mb-6">
              "{serviceToDelete.name}" adlı servisi silmek istediğinizden emin misiniz?
            </p>
            <div className="flex justify-end space-x-4">
              <button
                type="button"
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition"
                onClick={() => setShowDeleteModal(false)}
              >
                İptal
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition"
                onClick={confirmDelete}
              >
                Sil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grafik Modalı */}
      {showChartModal && chartService && (
        <UptimeChartModal
          serviceId={chartService.id}
          onClose={() => setShowChartModal(false)}
        />
      )}
    </div>
  );
}
