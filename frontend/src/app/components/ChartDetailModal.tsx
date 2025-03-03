"use client";

import React, { useState, useEffect } from "react";
import axios from "axios";
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

// Tip tanımları
interface ServiceDetails {
  id: number;
  name: string;
  namespace: string;
  cluster: string;
  type: string;
  endpoint?: string;
  check_interval: number;
}

export type ChartDetailModalProps = {
  serviceId: number;
  onClose: () => void;
};

export type UptimeRecord = {
  timestamp: string;
  responseTime: number;
  status: string;
};

const ChartDetailModal: React.FC<ChartDetailModalProps> = ({ serviceId, onClose }) => {
  const [history, setHistory] = useState<UptimeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [serviceDetails, setServiceDetails] = useState<ServiceDetails | null>(null);
  const [metrics, setMetrics] = useState({
    averageResponseTime: 0,
    uptimePercentage: 0,
    successfulRequests: 0
  });

  // Ön tanımlı aralıkları select için
  const predefinedRanges = [
    { label: "Son 1 dakika", value: "1m" },
    { label: "Son 10 dakika", value: "10m" },
    { label: "Son 1 saat", value: "1h" },
    { label: "Son 1 gün", value: "1d" },
    { label: "Özel Aralık", value: "custom" },
  ];

  const [selectedRange, setSelectedRange] = useState("1h");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

  // Servis detaylarını getir
  const fetchServiceDetails = async () => {
    try {
      const response = await axios.get(`${apiUrl}/api/v1/services/${serviceId}`);
      setServiceDetails(response.data.service);
    } catch (err) {
      console.error("Service details fetch error", err);
      setError("Servis detayları alınamadı.");
    }
  };

  const fetchHistory = async () => {
    setLoading(true);
    try {
      let url = `${apiUrl}/api/v1/uptime-history?serviceId=${serviceId}`;
      
      if (selectedRange !== "custom") {
        const now = new Date();
        let startTime: Date;
        switch (selectedRange) {
          case "1m":
            startTime = new Date(now.getTime() - 1 * 60 * 1000);
            break;
          case "10m":
            startTime = new Date(now.getTime() - 10 * 60 * 1000);
            break;
          case "1h":
            startTime = new Date(now.getTime() - 60 * 60 * 1000);
            break;
          case "1d":
            startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
          default:
            startTime = now;
        }
        const startParam = encodeURIComponent(startTime.toISOString());
        const endParam = encodeURIComponent(now.toISOString());
        url += `&startDate=${startParam}&endDate=${endParam}`;
      } else {
        if (customStartDate) url += `&startDate=${encodeURIComponent(customStartDate)}`;
        if (customEndDate) url += `&endDate=${encodeURIComponent(customEndDate)}`;
      }
      
      const response = await axios.get(url);
      const historyData = response.data.history || [];
      setHistory(historyData);

      // Metrikleri hesapla
      if (historyData.length > 0) {
        const totalResponseTime = historyData.reduce((sum: number, record: UptimeRecord) => sum + record.responseTime, 0);
        const avgResponseTime = Math.round(totalResponseTime / historyData.length);
        const successfulRequests = historyData.filter((record: UptimeRecord) => record.status === 'up').length;
        const uptimePercentage = Math.round((successfulRequests / historyData.length) * 100);

        setMetrics({
          averageResponseTime: avgResponseTime,
          uptimePercentage: uptimePercentage,
          successfulRequests: successfulRequests
        });
      }

      setError("");
    } catch (err) {
      console.error("History data fetch error", err);
      setError("Geçmiş veriler alınırken hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServiceDetails();
  }, [serviceId]);

  useEffect(() => {
    fetchHistory();
  }, [serviceId, selectedRange, customStartDate, customEndDate]);

  const handleExport = async () => {
    try {
      const response = await axios.get(
        `${apiUrl}/api/v1/services/${serviceId}/export?range=${selectedRange}`,
        { responseType: 'blob' }
      );
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `service_${serviceId}_export.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error("Export error", err);
      setError("Veriler dışa aktarılırken hata oluştu.");
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
      legend: { position: "top" },
      title: { display: true, text: "Zaman Serisi: Yanıt Süresi" },
    },
    scales: {
      x: {
        type: "time",
        time: { unit: "minute" },
        title: { display: true, text: "Tarih" },
      },
      y: {
        title: { display: true, text: "Response Time (ms)" },
      },
    },
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 py-6 sm:p-0">
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-slate-900/70"></div>
        
        <div className="relative bg-white dark:bg-slate-800 w-full max-w-4xl rounded-lg shadow-xl">
          <div className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 mb-4">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100 pr-8">
                {serviceDetails?.name || 'Yükleniyor...'} - Performans Detayları
              </h2>
              <button
                onClick={onClose}
                className="absolute right-4 top-4 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-3 sm:p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
                  <h3 className="text-base sm:text-lg font-semibold mb-2 text-slate-800 dark:text-slate-100">Servis Bilgileri</h3>
                  <div className="space-y-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                    <p>Namespace: <span className="font-medium break-all">{serviceDetails?.namespace || '-'}</span></p>
                    <p>Cluster: <span className="font-medium break-all">{serviceDetails?.cluster || '-'}</span></p>
                    <p>Type: <span className="font-medium break-all">{serviceDetails?.type || '-'}</span></p>
                    {serviceDetails?.endpoint && <p>Endpoint: <span className="font-medium break-all">{serviceDetails.endpoint}</span></p>}
                  </div>
                </div>
                
                <div className="p-3 sm:p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
                  <h3 className="text-base sm:text-lg font-semibold mb-2 text-slate-800 dark:text-slate-100">Performans Metrikleri</h3>
                  <div className="space-y-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                    <p>Ortalama Yanıt Süresi: <span className="font-medium">{metrics.averageResponseTime}ms</span></p>
                    <p>Uptime: <span className="font-medium">{metrics.uptimePercentage}%</span></p>
                    <p>Son 24 Saat Başarılı İstek: <span className="font-medium">{metrics.successfulRequests}</span></p>
                  </div>
                </div>
                
                <div className="p-3 sm:p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
                  <h3 className="text-base sm:text-lg font-semibold mb-2 text-slate-800 dark:text-slate-100">Zaman Aralığı</h3>
                  <div className="space-y-2">
                    <select
                      value={selectedRange}
                      onChange={(e) => setSelectedRange(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs sm:text-sm border rounded bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100"
                    >
                      {predefinedRanges.map((range) => (
                        <option key={range.value} value={range.value}>
                          {range.label}
                        </option>
                      ))}
                    </select>
                    
                    {selectedRange === "custom" && (
                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Başlangıç
                          </label>
                          <input
                            type="datetime-local"
                            value={customStartDate}
                            onChange={(e) => setCustomStartDate(e.target.value)}
                            className="w-full px-3 py-1.5 text-xs sm:text-sm border rounded bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Bitiş
                          </label>
                          <input
                            type="datetime-local"
                            value={customEndDate}
                            onChange={(e) => setCustomEndDate(e.target.value)}
                            className="w-full px-3 py-1.5 text-xs sm:text-sm border rounded bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="h-[300px] sm:h-[400px] bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 p-4">
                {loading ? (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-slate-600 dark:text-slate-400">Veriler yükleniyor...</p>
                  </div>
                ) : error ? (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-red-600 dark:text-red-400">{error}</p>
                  </div>
                ) : (
                  <Line data={data} options={options} />
                )}
              </div>

              <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-4">
                <button
                  onClick={handleExport}
                  className="w-full sm:w-auto px-4 py-2 bg-emerald-600 text-white text-sm rounded hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors"
                >
                  Verileri Dışa Aktar
                </button>
                <button
                  onClick={onClose}
                  className="w-full sm:w-auto px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm rounded hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChartDetailModal;
