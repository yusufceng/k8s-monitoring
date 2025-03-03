"use client";

import React, { useState, useEffect } from "react";
import axios from "axios";
import { ServiceCard, Service } from "@/components/ServiceCard";
import Link from "next/link";
import ChartDetailModal from "@/components/ChartDetailModal";

export default function ServicesPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

  const [services, setServices] = useState<Service[]>([]);
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filtreleme state'leri
  const [filterText, setFilterText] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterNamespace, setFilterNamespace] = useState("all");

  // Modal state'leri
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<Service | null>(null);
  const [showChartModal, setShowChartModal] = useState(false);
  const [chartService, setChartService] = useState<Service | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newService, setNewService] = useState<Omit<Service, "id" | "uptimePercentage">>({
    name: "",
    namespace: "default",
    cluster: "default",
    type: "",
    endpoint: "",
    check_interval: 60,
    status: "",
    lastCheck: "",
    responseTime: 0,
  });

  useEffect(() => {
    fetchServices();
    fetchNamespaces();
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

  const fetchNamespaces = async () => {
    try {
      const response = await axios.get(`${apiUrl}/api/v1/mergedNamespaces`);
      if (response.data.namespaces && response.data.namespaces.length > 0) {
        setNamespaces(response.data.namespaces);
      } else {
        setNamespaces(["default"]);
      }
    } catch (err) {
      console.error("Namespace listesi yüklenirken hata oluştu:", err);
      setNamespaces(["default"]);
    }
  };

  const filteredServices = services.filter((svc) => {
    const matchesText = svc.name.toLowerCase().includes(filterText.toLowerCase());
    const matchesStatus =
      filterStatus === "all" || (svc.status && svc.status.toLowerCase() === filterStatus);
    const matchesNamespace =
      filterNamespace === "all" ||
      (svc.namespace && svc.namespace.toLowerCase() === filterNamespace.toLowerCase());
    return matchesText && matchesStatus && matchesNamespace;
  });

  // Edit Modal submit handler
  const updateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedService) return;
    try {
      await axios.put(`${apiUrl}/api/v1/services/${selectedService.id}`, selectedService);
      setShowEditModal(false);
      fetchServices();
      fetchNamespaces();
    } catch (err) {
      console.error("Servis güncellenirken hata oluştu:", err);
      setError("Servis güncellenirken bir hata oluştu.");
    }
  };

  // Delete Modal confirm handler
  const confirmDelete = async () => {
    if (!serviceToDelete) return;
    try {
      await axios.delete(`${apiUrl}/api/v1/services/${serviceToDelete.id}`);
      setShowDeleteModal(false);
      setServiceToDelete(null);
      fetchServices();
      fetchNamespaces();
    } catch (err) {
      console.error("Servis silinirken hata oluştu:", err);
      setError("Servis silinirken bir hata oluştu.");
    }
  };

  // Add Modal submit handler
  const addService = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await axios.post(`${apiUrl}/api/v1/services`, newService);
      // Yeni servis eklendikten sonra listeyi ve namespace'leri güncelle
      setShowAddModal(false);
      setNewService({
        name: "",
        namespace: "default",
        cluster: "default",
        type: "",
        endpoint: "",
        check_interval: 60,
        status: "",
        lastCheck: "",
        responseTime: 0,
      });
      fetchServices();
      fetchNamespaces();
    } catch (err) {
      console.error("Servis eklenirken hata oluştu:", err);
      setError("Servis eklenirken bir hata oluştu.");
    }
  };

  const handleEdit = (svc: Service) => {
    setSelectedService(svc);
    setShowEditModal(true);
  };

  const handleDelete = (svc: Service) => {
    setServiceToDelete(svc);
    setShowDeleteModal(true);
  };

  const handleChart = (svc: Service) => {
    setChartService(svc);
    setShowChartModal(true);
  };

  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold mb-6">Servisler</h1>

      {/* Servis Ekle Butonu */}
      <div className="mb-6">
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition"
        >
          Yeni Servis Ekle
        </button>
      </div>

      {/* Arama ve filtreleme alanı */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
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
        <select
          value={filterNamespace}
          onChange={(e) => setFilterNamespace(e.target.value)}
          className="px-4 py-2 border rounded focus:outline-none focus:ring focus:border-blue-300"
        >
          <option value="all">Tüm Namespace'ler</option>
          {namespaces.map((ns) => (
            <option key={ns} value={ns}>
              {ns}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-center text-gray-600">Servisler yükleniyor...</p>
      ) : error ? (
        <p className="text-center text-red-600">{error}</p>
      ) : filteredServices.length === 0 ? (
        <p className="text-center text-gray-600">Filtrelemeye uygun servis bulunamadı.</p>
      ) : (
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
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
        <Link href="/groups">
          <a className="text-blue-600 underline">Grupları Görüntüle</a>
        </Link>
      </div>

      {/* Edit Modal */}
      {showEditModal && selectedService && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold mb-4">Servisi Düzenle</h2>
            <form onSubmit={updateService}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Servis Adı</label>
                <input
                  type="text"
                  value={selectedService.name}
                  onChange={(e) =>
                    setSelectedService({ ...selectedService, name: e.target.value })
                  }
                  className="w-full p-2 border rounded focus:outline-none focus:ring"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Namespace</label>
                <input
                  type="text"
                  value={selectedService.namespace}
                  onChange={(e) =>
                    setSelectedService({ ...selectedService, namespace: e.target.value })
                  }
                  className="w-full p-2 border rounded focus:outline-none focus:ring"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Cluster</label>
                <input
                  type="text"
                  value={selectedService.cluster}
                  onChange={(e) =>
                    setSelectedService({ ...selectedService, cluster: e.target.value })
                  }
                  className="w-full p-2 border rounded focus:outline-none focus:ring"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Servis Türü</label>
                <input
                  type="text"
                  value={selectedService.type}
                  onChange={(e) =>
                    setSelectedService({ ...selectedService, type: e.target.value })
                  }
                  className="w-full p-2 border rounded focus:outline-none focus:ring"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Endpoint</label>
                <input
                  type="text"
                  value={selectedService.endpoint || ""}
                  onChange={(e) =>
                    setSelectedService({ ...selectedService, endpoint: e.target.value })
                  }
                  className="w-full p-2 border rounded focus:outline-none focus:ring"
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Kontrol Aralığı (sn)</label>
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

      {/* Delete Modal */}
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

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold mb-4">Yeni Servis Ekle</h2>
            <form onSubmit={addService}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Servis Adı</label>
                <input
                  type="text"
                  value={newService.name}
                  onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                  className="w-full p-2 border rounded focus:outline-none focus:ring"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Namespace</label>
                <input
                  type="text"
                  value={newService.namespace}
                  onChange={(e) => setNewService({ ...newService, namespace: e.target.value })}
                  className="w-full p-2 border rounded focus:outline-none focus:ring"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Cluster</label>
                <input
                  type="text"
                  value={newService.cluster}
                  onChange={(e) => setNewService({ ...newService, cluster: e.target.value })}
                  className="w-full p-2 border rounded focus:outline-none focus:ring"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Servis Türü</label>
                <input
                  type="text"
                  value={newService.type}
                  onChange={(e) => setNewService({ ...newService, type: e.target.value })}
                  className="w-full p-2 border rounded focus:outline-none focus:ring"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Endpoint</label>
                <input
                  type="text"
                  value={newService.endpoint || ""}
                  onChange={(e) => setNewService({ ...newService, endpoint: e.target.value })}
                  className="w-full p-2 border rounded focus:outline-none focus:ring"
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Kontrol Aralığı (sn)</label>
                <input
                  type="number"
                  value={newService.check_interval}
                  onChange={(e) =>
                    setNewService({ ...newService, check_interval: parseInt(e.target.value) })
                  }
                  min="5"
                  className="w-full p-2 border rounded focus:outline-none focus:ring"
                />
              </div>
              <div className="flex justify-end space-x-4">
                <button
                  type="button"
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition"
                  onClick={() => setShowAddModal(false)}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition"
                >
                  Ekle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Chart Detail Modal */}
      {showChartModal && chartService && (
        <ChartDetailModal
          serviceId={chartService.id}
          onClose={() => setShowChartModal(false)}
        />
      )}
    </div>
  );
}
