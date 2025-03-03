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
  const [error, setError] = useState("");

  // Modal state: Grafik detay modali
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
      await axios.delete(`${apiUrl}/api/v1/services/${id}`);
      router.push("/services");
    } catch (err) {
      console.error("Servis silinirken hata oluştu:", err);
      setError("Servis silinirken bir hata oluştu.");
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {loading ? (
        <p className="text-center text-gray-600">Yükleniyor...</p>
      ) : error ? (
        <p className="text-center text-red-600">{error}</p>
      ) : service ? (
        <>
          <div className="mb-6">
            <h1 className="text-4xl font-bold text-gray-800">{service.name}</h1>
            <p className="text-lg text-gray-600">Namespace: {service.namespace}</p>
            <p className="text-lg text-gray-600">Cluster: {service.cluster}</p>
            <p className="text-lg text-gray-600">Servis Türü: {service.type}</p>
            {service.endpoint && (
              <p className="text-lg text-gray-600">Endpoint: {service.endpoint}</p>
            )}
          </div>

          <div className="flex gap-4 mb-6">
            <button
              onClick={() => router.push(`/services/${service.id}/edit`)}
              className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 transition"
            >
              Düzenle
            </button>
            <button
              onClick={handleDelete}
              className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 transition"
            >
              Sil
            </button>
            <button
              onClick={() => setShowChartModal(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
            >
              Grafik Detayları
            </button>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-bold mb-4">Uptime Kontrolleri</h2>
            {uptimeChecks.length === 0 ? (
              <p className="text-gray-600">
                Henüz uptime kontrol kaydı bulunmamaktadır.
              </p>
            ) : (
              <table className="min-w-full border">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="px-4 py-2 border">Tarih</th>
                    <th className="px-4 py-2 border">Durum</th>
                    <th className="px-4 py-2 border">Yanıt Süresi (ms)</th>
                    <th className="px-4 py-2 border">Hata Mesajı</th>
                  </tr>
                </thead>
                <tbody>
                  {uptimeChecks.map((check) => (
                    <tr key={check.id}>
                      <td className="px-4 py-2 border">
                        {new Date(check.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 border">{check.status}</td>
                      <td className="px-4 py-2 border">{check.response_time || "-"}</td>
                      <td className="px-4 py-2 border">{check.error_message || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-bold mb-2">Export Seçenekleri</h2>
            <div className="flex items-center gap-4">
              <select
                value={exportRange}
                onChange={(e) => setExportRange(e.target.value)}
                className="px-4 py-2 border rounded focus:outline-none focus:ring focus:border-blue-300"
              >
                {exportOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                onClick={handleExport}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition"
              >
                Export Data
              </button>
            </div>
          </div>

          <div>
            <Link href="/services">
              <a className="text-blue-600 underline">Tüm Servisleri Görüntüle</a>
            </Link>
          </div>

          {showChartModal && (
            <ChartDetailModal
              serviceId={service.id}
              onClose={() => setShowChartModal(false)}
            />
          )}
        </>
      ) : (
        <p className="text-center text-red-600">Servis bulunamadı.</p>
      )}
    </div>
  );
}
