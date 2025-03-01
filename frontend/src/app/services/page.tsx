// frontend/src/app/services/page.tsx
"use client";

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Link from 'next/link';
import { serviceApi } from '@/lib/api';

// Servis tipi
type Service = {
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
};

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [apiUrl, setApiUrl] = useState('');
  
  // Yeni servis ekleme state
  const [newService, setNewService] = useState({
    name: '',
    namespace: 'default',
    cluster: 'default',
    type: 'http',
    endpoint: '',
    check_interval: 60
  });
  
  // Namespace listesi
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // API URL'ini environment değişkeninden al
  useEffect(() => {
    setApiUrl(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080');
  }, []);

  // Servisleri yükle
  useEffect(() => {
    fetchServices();
    fetchNamespaces();
  }, [apiUrl]);

  // Servisleri getir
  const fetchServices = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${apiUrl}/api/v1/services`);
      setServices(response.data.services || []);
      setError('');
    } catch (err) {
      console.error('Servisler yüklenirken hata oluştu:', err);
      setError('Servis listesi yüklenirken bir hata oluştu. Lütfen daha sonra tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  // Namespace listesini getir
  const fetchNamespaces = async () => {
    try {
      const response = await axios.get(`${apiUrl}/api/v1/namespaces`);
      if (response.data.namespaces && response.data.namespaces.length > 0) {
        setNamespaces(response.data.namespaces);
      } else {
        setNamespaces(['default']);
      }
    } catch (err) {
      console.error('Namespace listesi yüklenirken hata oluştu:', err);
      setNamespaces(['default']);
    }
  };

  // Servis ekle
  const addService = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await axios.post(`${apiUrl}/api/v1/services`, newService);
      setServices([...services, response.data.service]);
      setShowAddModal(false);
      setNewService({
        name: '',
        namespace: 'default',
        cluster: 'default',
        type: 'http',
        endpoint: '',
        check_interval: 60
      });
      setSuccess('Servis başarıyla eklendi');
      setTimeout(() => setSuccess(''), 3000);
      fetchServices(); // Listeyi yenile
    } catch (err) {
      console.error('Servis eklenirken hata oluştu:', err);
      setError('Servis eklenirken bir hata oluştu.');
      setTimeout(() => setError(''), 3000);
    }
  };

  // Servisi düzenlemek için hazırla
  const prepareEdit = (service: Service) => {
    setSelectedService(service);
    setShowEditModal(true);
  };

  // Servisi güncelle
  const updateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedService) return;
    
    try {
      await axios.put(`${apiUrl}/api/v1/services/${selectedService.id}`, selectedService);
      setShowEditModal(false);
      setSuccess('Servis başarıyla güncellendi');
      setTimeout(() => setSuccess(''), 3000);
      fetchServices(); // Listeyi yenile
    } catch (err) {
      console.error('Servis güncellenirken hata oluştu:', err);
      setError('Servis güncellenirken bir hata oluştu.');
      setTimeout(() => setError(''), 3000);
    }
  };

  // Servisi sil
  const deleteService = async (id: number) => {
    if (!confirm('Bu servisi silmek istediğinizden emin misiniz?')) return;
    
    try {
      await axios.delete(`${apiUrl}/api/v1/services/${id}`);
      setServices(services.filter(service => service.id !== id));
      setSuccess('Servis başarıyla silindi');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Servis silinirken hata oluştu:', err);
      setError('Servis silinirken bir hata oluştu.');
      setTimeout(() => setError(''), 3000);
    }
  };

  // Servisi test et
  const testService = async (endpoint: string) => {
    try {
      const response = await axios.post(`${apiUrl}/api/v1/test-uptime`, {
        endpoint,
        checkType: endpoint.startsWith('http') ? 'http' : 'tcp',
        timeout: 10
      });
      
      alert(`Test Sonucu: ${response.data.status === 'up' ? 'Başarılı' : 'Başarısız'}\n${response.data.errorMessage || ''}`);
    } catch (err) {
      console.error('Servis test edilirken hata oluştu:', err);
      alert('Servis test edilirken bir hata oluştu.');
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Servisler</h1>
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none"
          onClick={() => setShowAddModal(true)}
        >
          Yeni Servis Ekle
        </button>
      </div>

      {/* Bildirimler */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4" role="alert">
          <span className="block sm:inline">{error}</span>
        </div>
      )}
      
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4" role="alert">
          <span className="block sm:inline">{success}</span>
        </div>
      )}

      {/* Servis Tablosu */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-6 text-center">Servisler yükleniyor...</div>
        ) : services.length === 0 ? (
          <div className="p-6 text-center">
            <p>Henüz izlenen servis bulunmuyor.</p>
            <button
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none"
              onClick={() => setShowAddModal(true)}
            >
              İlk Servisi Ekle
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Servis Adı
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Namespace
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tip
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Endpoint
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Durum
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    İşlemler
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {services.map((service) => (
                  <tr key={service.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{service.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">{service.namespace}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">{service.type}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">{service.endpoint || 'N/A'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${service.status === 'up' ? 'bg-green-100 text-green-800' : 
                          service.status === 'down' ? 'bg-red-100 text-red-800' : 
                          service.status === 'warning' ? 'bg-yellow-100 text-yellow-800' : 
                          'bg-gray-100 text-gray-800'}`}>
                        {service.status || 'Bilinmiyor'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <Link href={`/services/${service.id}`} className="text-blue-600 hover:text-blue-900">
                          Detay
                        </Link>
                        <button 
                          onClick={() => prepareEdit(service)} 
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          Düzenle
                        </button>
                        <button 
                          onClick={() => deleteService(service.id)} 
                          className="text-red-600 hover:text-red-900"
                        >
                          Sil
                        </button>
                        {service.endpoint && (
                          <button 
                            onClick={() => testService(service.endpoint!)} 
                            className="text-green-600 hover:text-green-900"
                          >
                            Test
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Servis Ekleme Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center">
          <div className="relative bg-white rounded-lg shadow max-w-md mx-auto p-6 w-full">
            <h2 className="text-xl font-bold mb-4">Yeni Servis Ekle</h2>
            
            <form onSubmit={addService}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Servis Adı
                </label>
                <input
                  type="text"
                  className="w-full p-2 border border-gray-300 rounded"
                  value={newService.name}
                  onChange={(e) => setNewService({...newService, name: e.target.value})}
                  required
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Namespace
                </label>
                <select
                  className="w-full p-2 border border-gray-300 rounded"
                  value={newService.namespace}
                  onChange={(e) => setNewService({...newService, namespace: e.target.value})}
                >
                  {namespaces.map(ns => (
                    <option key={ns} value={ns}>{ns}</option>
                  ))}
                </select>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cluster
                </label>
                <input
                  type="text"
                  className="w-full p-2 border border-gray-300 rounded"
                  value={newService.cluster}
                  onChange={(e) => setNewService({...newService, cluster: e.target.value})}
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Servis Türü
                </label>
                <select
                  className="w-full p-2 border border-gray-300 rounded"
                  value={newService.type}
                  onChange={(e) => setNewService({...newService, type: e.target.value})}
                >
                  <option value="http">HTTP/HTTPS</option>
                  <option value="tcp">TCP Port</option>
                  <option value="dns">DNS</option>
                  <option value="certificate">SSL Sertifika</option>
                  <option value="service">K8s Service</option>
                </select>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Endpoint
                </label>
                <input
                  type="text"
                  className="w-full p-2 border border-gray-300 rounded"
                  placeholder={
                    newService.type === 'http' ? 'https://example.com' :
                    newService.type === 'tcp' ? 'example.com:443' :
                    newService.type === 'dns' ? 'example.com' :
                    'https://example.com'
                  }
                  value={newService.endpoint}
                  onChange={(e) => setNewService({...newService, endpoint: e.target.value})}
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kontrol Aralığı (sn)
                </label>
                <input
                  type="number"
                  className="w-full p-2 border border-gray-300 rounded"
                  value={newService.check_interval}
                  onChange={(e) => setNewService({...newService, check_interval: parseInt(e.target.value)})}
                  min="5"
                />
              </div>
              
              <div className="flex justify-end space-x-2 mt-6">
                <button
                  type="button"
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 focus:outline-none"
                  onClick={() => setShowAddModal(false)}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none"
                >
                  Ekle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Servis Düzenleme Modal */}
      {showEditModal && selectedService && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center">
          <div className="relative bg-white rounded-lg shadow max-w-md mx-auto p-6 w-full">
            <h2 className="text-xl font-bold mb-4">Servis Düzenle</h2>
            
            <form onSubmit={updateService}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Servis Adı
                </label>
                <input
                  type="text"
                  className="w-full p-2 border border-gray-300 rounded"
                  value={selectedService.name}
                  onChange={(e) => setSelectedService({...selectedService, name: e.target.value})}
                  required
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Namespace
                </label>
                <select
                  className="w-full p-2 border border-gray-300 rounded"
                  value={selectedService.namespace}
                  onChange={(e) => setSelectedService({...selectedService, namespace: e.target.value})}
                >
                  {namespaces.map(ns => (
                    <option key={ns} value={ns}>{ns}</option>
                  ))}
                </select>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cluster
                </label>
                <input
                  type="text"
                  className="w-full p-2 border border-gray-300 rounded"
                  value={selectedService.cluster}
                  onChange={(e) => setSelectedService({...selectedService, cluster: e.target.value})}
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Servis Türü
                </label>
                <select
                  className="w-full p-2 border border-gray-300 rounded"
                  value={selectedService.type}
                  onChange={(e) => setSelectedService({...selectedService, type: e.target.value})}
                >
                  <option value="http">HTTP/HTTPS</option>
                  <option value="tcp">TCP Port</option>
                  <option value="dns">DNS</option>
                  <option value="certificate">SSL Sertifika</option>
                  <option value="service">K8s Service</option>
                </select>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Endpoint
                </label>
                <input
                  type="text"
                  className="w-full p-2 border border-gray-300 rounded"
                  value={selectedService.endpoint || ''}
                  onChange={(e) => setSelectedService({...selectedService, endpoint: e.target.value})}
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kontrol Aralığı (sn)
                </label>
                <input
                  type="number"
                  className="w-full p-2 border border-gray-300 rounded"
                  value={selectedService.check_interval || 60}
                  onChange={(e) => setSelectedService({...selectedService, check_interval: parseInt(e.target.value)})}
                  min="5"
                />
              </div>
              
              <div className="flex justify-end space-x-2 mt-6">
                <button
                  type="button"
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 focus:outline-none"
                  onClick={() => setShowEditModal(false)}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none"
                >
                  Güncelle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}