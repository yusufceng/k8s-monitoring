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
    <div
      className={`p-3 sm:p-4 rounded-lg shadow-md mb-3 sm:mb-4 transition-colors
        ${
          service.status === 'up'
            ? 'bg-slate-50 dark:bg-slate-800 border-l-4 border-emerald-500'
            : service.status === 'down'
            ? 'bg-slate-50 dark:bg-slate-800 border-l-4 border-red-500'
            : 'bg-slate-50 dark:bg-slate-800 border-l-4 border-amber-500'
        }
      `}
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0">
        <h3 className="text-base sm:text-lg font-semibold text-slate-800 dark:text-slate-100 break-all">{service.name}</h3>
        <span className={`px-2 sm:px-3 py-1 rounded text-xs sm:text-sm font-medium self-start sm:self-auto
          ${
            service.status === 'up'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
              : service.status === 'down'
              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
          }
        `}>
          {service.status?.toUpperCase()}
        </span>
      </div>
      <div className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 space-y-1">
        <p>Namespace: <span className="font-medium break-all">{service.namespace}</span></p>
        <p>Cluster: <span className="font-medium break-all">{service.cluster}</span></p>
        <p>Type: <span className="font-medium break-all">{service.type}</span></p>
        {service.endpoint && <p>Endpoint: <span className="font-medium break-all">{service.endpoint}</span></p>}
      </div>
      <div className="mt-3 sm:mt-4">
        <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 space-y-1 mb-3">
          <p>Response Time: <span className="font-medium">{service.responseTime}ms</span></p>
          <p>Last Check: <span className="font-medium">{service.lastCheck}</span></p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => onEdit(service)}
            className="px-2 sm:px-3 py-1.5 bg-blue-600 text-white text-xs sm:text-sm rounded hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 transition-colors truncate"
          >
            Düzenle
          </button>
          <button
            onClick={() => onDelete(service)}
            className="px-2 sm:px-3 py-1.5 bg-red-600 text-white text-xs sm:text-sm rounded hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 transition-colors truncate"
          >
            Sil
          </button>
          <button
            onClick={() => onChart(service)}
            className="px-2 sm:px-3 py-1.5 bg-slate-600 text-white text-xs sm:text-sm rounded hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors truncate"
          >
            Detaylar
          </button>
        </div>
      </div>
    </div>
  );
};
