"use client";

import React from "react";
import { MiniChart, MiniChartData } from "./MiniChart";
import Link from "next/link";

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
  chartData?: MiniChartData[];
};

type ServiceCardProps = {
  service: Service;
  onEdit: (service: Service) => void;
  onDelete: (service: Service) => void;
  onChart: (service: Service) => void;
};

const getCardBgColor = (status?: string) => {
  switch (status?.toLowerCase()) {
    case "up":
      return "bg-green-50";
    case "down":
      return "bg-red-50";
    case "warning":
      return "bg-yellow-50";
    default:
      return "bg-gray-50";
  }
};

export const ServiceCard: React.FC<ServiceCardProps> = ({ service, onEdit, onDelete, onChart }) => {
  // Eğer grafik verisi yoksa dummy veri oluşturun
  const dummyData: MiniChartData[] = service.chartData || [
    { time: "00:00", value: service.uptimePercentage ?? 0 },
    { time: "01:00", value: (service.uptimePercentage ?? 0) + 5 },
    { time: "02:00", value: (service.uptimePercentage ?? 0) - 3 },
    { time: "03:00", value: (service.uptimePercentage ?? 0) + 2 },
  ];

  return (
    <div className={`p-6 rounded-lg shadow ${getCardBgColor(service.status)} flex flex-col`}>
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold text-gray-800">{service.name}</h2>
        {/* Tıklanabilir MiniChart: butona benzer bir yapı ile onChart tetikleniyor */}
        <div
          onClick={() => onChart(service)}
          className="w-24 h-12 cursor-pointer hover:opacity-80 transition"
        >
          <MiniChart data={dummyData} />
        </div>
      </div>
      <div className="mt-4 flex-1">
        <p className="text-sm text-gray-600">Namespace: {service.namespace}</p>
        <p className="text-sm text-gray-600">Tip: {service.type}</p>
        {service.endpoint && (
          <p className="text-sm text-gray-600">Endpoint: {service.endpoint}</p>
        )}
        <p className="text-sm text-gray-600">Durum: {service.status || "Bilinmiyor"}</p>
        <p className="text-sm text-gray-600">
          Yanıt: {service.responseTime ? `${service.responseTime} ms` : "-"}
        </p>
      </div>
      {/* Uptime Progress Bar */}
      <div className="mt-4">
        <p className="text-sm text-gray-600 mb-1">Uptime: {service.uptimePercentage ?? 0}%</p>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className="h-2.5 rounded-full transition-all duration-300"
            style={{
              width: `${service.uptimePercentage ?? 0}%`,
              backgroundColor:
                service.status?.toLowerCase() === "up"
                  ? "#34D399"
                  : service.status?.toLowerCase() === "down"
                  ? "#F87171"
                  : service.status?.toLowerCase() === "warning"
                  ? "#FBBF24"
                  : "#9CA3AF",
            }}
          ></div>
        </div>
      </div>
      {/* İşlem Butonları */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => onEdit(service)}
          className="px-4 py-2 bg-indigo-500 text-white rounded-lg shadow hover:bg-indigo-600 transition-all duration-200"
        >
          Düzenle
        </button>
        <button
          onClick={() => onDelete(service)}
          className="px-4 py-2 bg-red-500 text-white rounded-lg shadow hover:bg-red-600 transition-all duration-200"
        >
          Sil
        </button>
      </div>
    </div>
  );
};
