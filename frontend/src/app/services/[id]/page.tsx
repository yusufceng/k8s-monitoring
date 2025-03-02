// frontend/src/app/services/[id]/page.tsx
"use client";

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import DetailModal from '../../components/DetailModal';

// Mevcut tipler
type Service = {
  id: number;
  name: string;
  namespace: string;
  cluster: string;
  type: string;
  endpoint?: string;
  check_interval?: number;
};

type UptimeCheck = {
  id: number;
  status: string;
  response_time?: number;
  error_message?: string;
  timestamp: string;
  detailed_info?: string;
};

// Yeni filtreleme türü
type FilterOptions = {
  status?: string;
  minResponseTime?: number;
  maxResponseTime?: number;
  startDate?: string;
  endDate?: string;
};

export default function ServiceDetail() {
  // Mevcut state'ler
  const params = useParams();
  const router = useRouter();
  const [service, setService] = useState<Service | null>(null);
  const [uptimeChecks, setUptimeChecks] = useState<UptimeCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [apiUrl, setApiUrl] = useState('');

  // Yeni state'ler
  const [pagination, setPagination] = useState({
    currentPage: 1,
    itemsPerPage: 10,
    totalItems: 0
  });
  const [filters, setFilters] = useState<FilterOptions>({});
  const [showFilters, setShowFilters] = useState(false);
  // Modal için state
  const [selectedDetailInfo, setSelectedDetailInfo] = useState<any>(null);

  // API URL'sini yükle
  useEffect(() => {
    setApiUrl(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080');
  }, []);

  // Servis ve uptime verilerini yükle
  useEffect(() => {
    if (!params.id || !apiUrl) return;

    const fetchServiceData = async () => {
      setLoading(true);
      try {
        // Servis detaylarını getir
        const serviceResponse = await axios.get(`${apiUrl}/api/v1/services/${params.id}`);
        setService(serviceResponse.data.service);
        
        // Uptime kontrol geçmişini getir
        if (serviceResponse.data.uptime_checks) {
          setUptimeChecks(serviceResponse.data.uptime_checks);
          setPagination(prev => ({
            ...prev, 
            totalItems: serviceResponse.data.uptime_checks.length
          }));
        }
        
        setError('');
      } catch (err) {
        console.error('Servis verileri yüklenirken hata oluştu:', err);
        setError('Servis verileri yüklenirken bir hata oluştu.');
      } finally {
        setLoading(false);
      }
    };

    fetchServiceData();
  }, [params.id, apiUrl, filters]);

  // Filtrelenmiş ve sayfalanmış verileri al
  const getFilteredAndPaginatedChecks = () => {
    let filteredChecks = [...uptimeChecks];

    // Durum filtrelemesi
    if (filters.status) {
      filteredChecks = filteredChecks.filter(check => check.status === filters.status);
    }

    // Yanıt süresi filtrelemesi
    if (filters.minResponseTime !== undefined) {
      filteredChecks = filteredChecks.filter(
        check => check.response_time !== undefined && 
        check.response_time >= filters.minResponseTime!
      );
    }

    if (filters.maxResponseTime !== undefined) {
      filteredChecks = filteredChecks.filter(
        check => check.response_time !== undefined && 
        check.response_time <= filters.maxResponseTime!
      );
    }

    // Tarih filtrelemesi
    if (filters.startDate) {
      filteredChecks = filteredChecks.filter(
        check => new Date(check.timestamp) >= new Date(filters.startDate!)
      );
    }

    if (filters.endDate) {
      filteredChecks = filteredChecks.filter(
        check => new Date(check.timestamp) <= new Date(filters.endDate!)
      );
    }

    // Sayfalama
    const startIndex = (pagination.currentPage - 1) * pagination.itemsPerPage;
    const endIndex = startIndex + pagination.itemsPerPage;
    
    return {
      paginatedChecks: filteredChecks.slice(startIndex, endIndex),
      totalFilteredItems: filteredChecks.length
    };
  };

  // Filtreleme formu
  const renderFilterForm = () => (
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Durum Filtresi
          </label>
          <select
            className="w-full p-2 border border-gray-300 rounded"
            value={filters.status || ''}
            onChange={(e) => setFilters(prev => ({
              ...prev, 
              status: e.target.value || undefined
            }))}
          >
            <option value="">Tümü</option>
            <option value="up">Çalışıyor</option>
            <option value="down">Hata</option>
            <option value="warning">Uyarı</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Min Yanıt Süresi (ms)
          </label>
          <input
            type="number"
            className="w-full p-2 border border-gray-300 rounded"
            value={filters.minResponseTime || ''}
            onChange={(e) => setFilters(prev => ({
              ...prev, 
              minResponseTime: e.target.value ? parseInt(e.target.value) : undefined
            }))}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Maks Yanıt Süresi (ms)
          </label>
          <input
            type="number"
            className="w-full p-2 border border-gray-300 rounded"
            value={filters.maxResponseTime || ''}
            onChange={(e) => setFilters(prev => ({
              ...prev, 
              maxResponseTime: e.target.value ? parseInt(e.target.value) : undefined
            }))}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Başlangıç Tarihi
          </label>
          <input
            type="date"
            className="w-full p-2 border border-gray-300 rounded"
            value={filters.startDate || ''}
            onChange={(e) => setFilters(prev => ({
              ...prev, 
              startDate: e.target.value || undefined
            }))}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Bitiş Tarihi
          </label>
          <input
            type="date"
            className="w-full p-2 border border-gray-300 rounded"
            value={filters.endDate || ''}
            onChange={(e) => setFilters(prev => ({
              ...prev, 
              endDate: e.target.value || undefined
            }))}
          />
        </div>

        <div className="flex items-end space-x-2">
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={() => setFilters({})}
          >
            Filtreleri Temizle
          </button>
        </div>
      </div>
    </div>
  );

  // Sayfalama kontrolü
  const renderPagination = (totalItems: number) => {
    const totalPages = Math.ceil(totalItems / pagination.itemsPerPage);

    return (
      <div className="flex justify-between items-center mt-4">
        <div>
          Toplam {totalItems} kayıt - Sayfa {pagination.currentPage} / {totalPages}
        </div>
        <div className="flex space-x-2">
          <button
            className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
            disabled={pagination.currentPage === 1}
            onClick={() => setPagination(prev => ({ ...prev, currentPage: prev.currentPage - 1 }))}
          >
            Önceki
          </button>
          <button
            className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
            disabled={pagination.currentPage === totalPages}
            onClick={() => setPagination(prev => ({ ...prev, currentPage: prev.currentPage + 1 }))}
          >
            Sonraki
          </button>
        </div>
      </div>
    );
  };
  {selectedDetailInfo && (
    <DetailModal 
      isOpen={true} 
      onClose={() => setSelectedDetailInfo(null)}
      details={selectedDetailInfo}
    />
  )}

  // Mevcut kodun geri kalanı (loading, error vb.) önceki kodla aynı kalacak
  // Sadece "return" kısmını aşağıdaki şekilde güncelleyin:

  const { paginatedChecks, totalFilteredItems } = getFilteredAndPaginatedChecks();

  // Önceki kodun geri kalanı (loading, error handler, vb.) aynı kalacak

  return (
    <div className="p-6">
      {/* Mevcut kodun başlangıç kısmı (loading, error, service info vb.) aynı kalacak */}

      {/* Son Kontroller */}
      <div className="bg-white rounded-lg shadow p-6 mt-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Son Kontroller</h2>
          <button
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            onClick={() => setShowFilters(!showFilters)}
          >
            {showFilters ? 'Filtreleri Gizle' : 'Filtreleri Göster'}
          </button>
        </div>

        {showFilters && renderFilterForm()}

        {paginatedChecks.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tarih/Saat
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Durum
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Yanıt Süresi
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Hata Mesajı
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Detaylar
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedChecks.map((check, index) => (
                  <tr key={check.id || index}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {new Date(check.timestamp).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${check.status === 'up' ? 'bg-green-100 text-green-800' : 
                          check.status === 'down' ? 'bg-red-100 text-red-800' : 
                          check.status === 'warning' ? 'bg-yellow-100 text-yellow-800' : 
                          'bg-gray-100 text-gray-800'}`}>
                        {check.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {check.response_time ? `${check.response_time} ms` : 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 break-words max-w-xs">
                        {check.error_message || '-'}
                      </div>
                    </td>
                    // Tablo içindeki detay sütununda
                    <td className="px-6 py-4">
                    {check.detailed_info && (
                        <button 
                        className="text-blue-600 hover:text-blue-900"
                        onClick={() => setSelectedDetailInfo(check.detailed_info)}
                        >
                        Detayları Göster
                        </button>
                    )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {renderPagination(totalFilteredItems)}
          </div>
        ) : (
          <p className="text-center py-10 text-gray-500">
            {Object.keys(filters).length > 0 
              ? 'Filtrelere uyan kontrol kaydı bulunamadı.' 
              : 'Henüz kontrol kaydı bulunmuyor.'}
          </p>
        )}
      </div>
    </div>
  );
}