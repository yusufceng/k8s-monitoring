"use client";

import React, { useState, useEffect } from "react";
import axios from "axios";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ServiceCard, Service } from "@/components/ServiceCard";
import ChartDetailModal from "@/components/ChartDetailModal";

export default function GroupDetailsPage() {
  const params = useParams();
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
        const matchesText = s.name.toLowerCase().includes(filterText.toLowerCase());
        const matchesStatus =
          filterStatus === "all" || (s.status && s.status.toLowerCase() === filterStatus);
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

  const handleChart = (svc: Service) => {
    setChartService(svc);
    setShowChartModal(true);
  };

  const handleEdit = (svc: Service) => {
    setSelectedService(svc);
    setShowEditModal(true);
  };

  const handleDelete = (svc: Service) => {
    setServiceToDelete(svc);
    setShowDeleteModal(true);
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
        ) : services.length === 0 ? (
          <p className="text-center text-gray-600">
            Bu cluster altında filtrelemeye uygun servis bulunamadı.
          </p>
        ) : (
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
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

        <div className="mt-8">
          <Link href="/services">
            <a className="text-blue-600 underline">Tüm servisleri görüntüle</a>
          </Link>
        </div>
      </div>

      {/* Chart Detail Modal */}
      {showChartModal && chartService && (
        <ChartDetailModal
          serviceId={chartService.id}
          onClose={() => setShowChartModal(false)}
        />
      )}

      {/* Edit and Delete modallarını burada ekleyebilirsiniz */}
      {/* (Not: Bu örnekte düzenleme ve silme modalları için placeholder işlevler yer alıyor. İhtiyaca göre geliştirin.) */}
    </div>
  );
}
