"use client";

import React, { useState, useEffect } from "react";
import axios from "axios";
import { ServiceCard, Service } from "@/components/ServiceCard";
import Link from "next/link";

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    setLoading(true);
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

  // Örnek edit, delete, chart işlemleri
  const handleEdit = (svc: Service) => {
    // Düzenleme işlemi için modal açma vs.
    console.log("Edit:", svc);
  };

  const handleDelete = (svc: Service) => {
    // Silme işlemi için onay modalı açma vs.
    console.log("Delete:", svc);
  };

  const handleChart = (svc: Service) => {
    // Grafik modalı açma işlemi
    console.log("Chart:", svc);
  };

  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold mb-6">Servisler</h1>
      {loading ? (
        <p>Yükleniyor...</p>
      ) : error ? (
        <p className="text-red-600">{error}</p>
      ) : (
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {services.map((svc) => (
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
        <Link href="/groups">
          <a className="text-blue-600 underline">Grupları Görüntüle</a>
        </Link>
      </div>
    </div>
  );
}
