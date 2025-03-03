// src/app/components/ChartDetailModal.tsx
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

export type UptimeRecord = {
  timestamp: string;
  responseTime: number;
  status: string;
};

type ChartDetailModalProps = {
  serviceId: number;
  onClose: () => void;
};

const ChartDetailModal: React.FC<ChartDetailModalProps> = ({ serviceId, onClose }) => {
  const [history, setHistory] = useState<UptimeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filtreleme için state'ler
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

  const fetchHistory = async () => {
    setLoading(true);
    try {
      // Filtreler varsa URL'e ekleyelim
      let url = `${apiUrl}/api/v1/uptime-history?serviceId=${serviceId}`;
      if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
      if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`;
      
      const response = await axios.get(url);
      setHistory(response.data.history || []);
      setError("");
    } catch (err) {
      console.error("History data fetch error", err);
      setError("Geçmiş veriler alınırken hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  // İlk veri çekimi ve filtre değiştiğinde yeniden veri çek
  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId, startDate, endDate]);

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
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full p-8 relative overflow-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-3xl text-gray-600 hover:text-gray-800"
        >
          &times;
        </button>
        <div className="mb-4">
          <h2 className="text-2xl font-semibold mb-2">Detaylı Grafik</h2>
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Başlangıç Tarihi</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2 border rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Bitiş Tarihi</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2 border rounded"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={fetchHistory}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
              >
                Filtrele
              </button>
            </div>
          </div>
        </div>
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
};

export default ChartDetailModal;
