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
      setHistory(response.data.history || []);
      setError("");
    } catch (err) {
      console.error("History data fetch error", err);
      setError("Geçmiş veriler alınırken hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [serviceId, selectedRange, customStartDate, customEndDate]);

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
          <div className="mb-4">
            <label htmlFor="rangeSelect" className="mr-2 font-medium text-gray-700">
              Zaman Aralığı:
            </label>
            <select
              id="rangeSelect"
              value={selectedRange}
              onChange={(e) => setSelectedRange(e.target.value)}
              className="px-3 py-2 border rounded"
            >
              {predefinedRanges.map((range) => (
                <option key={range.value} value={range.value}>
                  {range.label}
                </option>
              ))}
            </select>
          </div>
          {selectedRange === "custom" && (
            <div className="flex flex-wrap gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Başlangıç Tarihi</label>
                <input
                  type="datetime-local"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-3 py-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Bitiş Tarihi</label>
                <input
                  type="datetime-local"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-3 py-2 border rounded"
                />
              </div>
            </div>
          )}
          <div className="flex items-end mt-4">
            <button
              onClick={fetchHistory}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
            >
              Filtrele
            </button>
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
