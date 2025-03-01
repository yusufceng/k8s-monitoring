"use client";

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

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
  status: string;
  response_time?: number;
  error_message?: string;
  timestamp: string;
};

export default function ServiceDetail() {
  const params = useParams();
  const router = useRouter();
  const [service, setService] = useState<Service | null>(null);
  const [uptimeChecks, setUptimeChecks] = useState<UptimeCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  
  // API URL'ini environment değişkeninden al
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
  }, [params.id, apiUrl]);

  // Servis durumunu belirleyen fonksiyon
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'up':
        return (
          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
            Çalışıyor
          </span>
        );
      case 'down':
        return (
          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
            Hata
          </span>
        );
      case 'warning':
        return (
          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
            Uyarı
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
            Bilinmiyor
          </span>
        );
    }
  };

  // Grafik verilerini hazırla
  const getChartData = () => {
    return uptimeChecks.slice().reverse().map((check) => ({
      timestamp: new Date(check.timestamp).toLocaleTimeString(),
      responseTime: check.response_time || 0,
      status: check.status
    }));
  };

  // Uptime yüzdesini hesapla
  const calculateUptimePercentage = () => {
    if (uptimeChecks.length === 0) return 'N/A';
    
    const upChecks = uptimeChecks.filter(check => check.status === 'up').length;
    return ((upChecks / uptimeChecks.length) * 100).toFixed(2) + '%';
  };

  // Ortalama yanıt süresini hesapla (ms)
  const calculateAverageResponseTime = () => {
    const checksWithResponseTime = uptimeChecks.filter(check => check.response_time !== undefined);
    if (checksWithResponseTime.length === 0) return 'N/A';
    
    const totalResponseTime = checksWithResponseTime.reduce((sum, check) => sum + (check.response_time || 0), 0);
    return (totalResponseTime / checksWithResponseTime.length).toFixed(2) + ' ms';
  };

  // Servisi test et
  const testService = async () => {
    if (!service || !service.endpoint) {
      alert('Bu servisin test edilecek endpointi yok.');
      return;
    }
    
    try {
      const response = await axios.post(`${apiUrl}/api/v1/test-uptime`, {
        endpoint: service.endpoint,
        checkType: service.type,
        timeout: 10
      });
      
      alert(`Test Sonucu: ${response.data.status === 'up' ? 'Başarılı' : 'Başarısız'}\n${response.data.errorMessage || ''}`);
    } catch (err) {
      console.error('Servis test edilirken hata oluştu:', err);
      alert('Servis test edilirken bir hata oluştu.');
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-center">
        <p>Servis bilgileri yükleniyor...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4" role="alert">
          <span className="block sm:inline">{error}</span>
        </div>
        <button
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 focus:outline-none"
          onClick={() => router.push('/services')}
        >
          Servisler Sayfasına Dön
        </button>
      </div>
    );
  }

  if (!service) {
    return (
      <div className="p-6 text-center">
        <p>Servis bulunamadı.</p>
        <button
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none"
          onClick={() => router.push('/services')}
        >
          Servisler Sayfasına Dön
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link href="/services" className="text-blue-600 hover:text-blue-800">
            &larr; Servislere Dön
          </Link>
          <h1 className="text-3xl font-bold mt-2">{service.name}</h1>
        </div>
        <div className="flex space-x-2">
          <button
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 focus:outline-none"
            onClick={testService}
            disabled={!service.endpoint}
          >
            Test Et
          </button>
          <Link 
            href={`/services/edit/${service.id}`}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none"
          >
            Düzenle
          </Link>
        </div>
      </div>

      {/* Servis Bilgileri */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Servis Bilgileri</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Namespace</p>
              <p className="font-medium">{service.namespace}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Cluster</p>
              <p className="font-medium">{service.cluster}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Tip</p>
              <p className="font-medium">{service.type}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Kontrol Aralığı</p>
              <p className="font-medium">{service.check_interval || 60} saniye</p>
            </div>
            <div className="col-span-2">
              <p className="text-sm text-gray-500">Endpoint</p>
              <p className="font-medium break-all">{service.endpoint || 'N/A'}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Özet İstatistikler</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Durum</p>
              <div className="font-medium">
                {uptimeChecks.length > 0 ? getStatusBadge(uptimeChecks[0].status) : 'Veri yok'}
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500">Uptime Oranı</p>
              <p className="font-medium">{calculateUptimePercentage()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Ortalama Yanıt Süresi</p>
              <p className="font-medium">{calculateAverageResponseTime()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Son Kontrol</p>
              <p className="font-medium">
                {uptimeChecks.length > 0 
                  ? new Date(uptimeChecks[0].timestamp).toLocaleString() 
                  : 'Veri yok'
                }
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Yanıt Süresi Grafiği */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Yanıt Süresi Grafiği</h2>
        {uptimeChecks.length > 0 ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={getChartData()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="timestamp" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="responseTime" 
                  name="Yanıt Süresi (ms)" 
                  stroke="#3B82F6" 
                  activeDot={{ r: 8 }} 
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-center py-10 text-gray-500">Henüz yanıt süresi verisi bulunmuyor.</p>
        )}
      </div>

      {/* Son Kontroller */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Son Kontroller</h2>
        {uptimeChecks.length > 0 ? (
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
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {uptimeChecks.map((check, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {new Date(check.timestamp).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(check.status)}
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center py-10 text-gray-500">Henüz kontrol kaydı bulunmuyor.</p>
        )}
      </div>
    </div>
  );
}