"use client";

import React, { useState, useEffect } from 'react';
import axios from 'axios';

// Uptime Check türleri
const checkTypes = [
  { value: "http", label: "HTTP/HTTPS" },
  { value: "tcp", label: "TCP Port" },
  { value: "dns", label: "DNS Lookup" },
  { value: "certificate", label: "SSL Sertifika" }
];

export default function UptimeTest() {
  const [endpoint, setEndpoint] = useState('');
  const [checkType, setCheckType] = useState('http');
  const [checkInterval, setCheckInterval] = useState(60);
  const [timeout, setTimeout] = useState(10);
  const [expectedStatusCode, setExpectedStatusCode] = useState(200);
  const [expectedContent, setExpectedContent] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [sslCheck, setSSLCheck] = useState(false);
  const [sslWarningDays, setSSLWarningDays] = useState(30);
  const [insecureSkip, setInsecureSkip] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [apiUrl, setApiUrl] = useState('');

  // API URL'sini env'den al
  useEffect(() => {
    setApiUrl(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080');
  }, []);

  // Tek seferlik test yap
  const runTest = async () => {
    setIsLoading(true);
    setTestResult(null);

    try {
      const response = await axios.post(`${apiUrl}/api/v1/test-uptime`, {
        endpoint,
        checkType,
        expectedStatusCode: checkType === 'http' ? expectedStatusCode : 0,
        expectedContent: checkType === 'http' ? expectedContent : '',
        username: checkType === 'http' ? username : '',
        password: checkType === 'http' ? password : '',
        sslCheck: checkType === 'certificate' || (checkType === 'http' && sslCheck),
        sslWarningDays: sslCheck ? sslWarningDays : 0,
        insecureSkip,
        timeout: timeout
      });
      
      setTestResult(response.data);
    } catch (error) {
      console.error('Test hatası:', error);
      setTestResult({
        status: 'error',
        errorMessage: 'API isteği sırasında bir hata oluştu. Bağlantınızı ve API sunucusunu kontrol edin.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Check türüne göre form alanlarını göster/gizle
  const showHttpFields = checkType === 'http';
  const showCertificateFields = checkType === 'certificate' || (checkType === 'http' && sslCheck);

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Uptime Test Aracı</h1>
      
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Test Yapılandırması</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Kontrol Türü
            </label>
            <select
              className="w-full p-2 border border-gray-300 rounded"
              value={checkType}
              onChange={(e) => setCheckType(e.target.value)}
            >
              {checkTypes.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Endpoint
            </label>
            <input
              type="text"
              className="w-full p-2 border border-gray-300 rounded"
              placeholder={
                checkType === 'http' ? 'https://example.com' : 
                checkType === 'tcp' ? 'example.com:443' : 
                checkType === 'dns' ? 'example.com' : 
                'https://example.com'
              }
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
            />
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Kontrol Aralığı (sn)
            </label>
            <input
              type="number"
              className="w-full p-2 border border-gray-300 rounded"
              value={checkInterval}
              onChange={(e) => setCheckInterval(parseInt(e.target.value))}
              min="5"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Zaman Aşımı (sn)
            </label>
            <input
              type="number"
              className="w-full p-2 border border-gray-300 rounded"
              value={timeout}
              onChange={(e) => setTimeout(parseInt(e.target.value))}
              min="1"
              max="60"
            />
          </div>
          
          <div>
            <label className="flex items-center h-full mt-4">
              <input
                type="checkbox"
                className="h-4 w-4 text-blue-600 rounded"
                checked={insecureSkip}
                onChange={(e) => setInsecureSkip(e.target.checked)}
              />
              <span className="ml-2 text-sm text-gray-700">
                TLS doğrulamayı atla (güvensiz)
              </span>
            </label>
          </div>
        </div>
        
        {/* HTTP Kontrolleri için ek alanlar */}
        {showHttpFields && (
          <div className="border-t border-gray-200 pt-4 mt-4">
            <h3 className="text-lg font-medium mb-3">HTTP Kontrol Ayarları</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Beklenen Durum Kodu
                </label>
                <input
                  type="number"
                  className="w-full p-2 border border-gray-300 rounded"
                  value={expectedStatusCode}
                  onChange={(e) => setExpectedStatusCode(parseInt(e.target.value))}
                  min="100"
                  max="599"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  İçerik Kontrolü
                </label>
                <input
                  type="text"
                  className="w-full p-2 border border-gray-300 rounded"
                  placeholder="Yanıtta aranacak metin"
                  value={expectedContent}
                  onChange={(e) => setExpectedContent(e.target.value)}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Basic Auth Kullanıcı Adı
                </label>
                <input
                  type="text"
                  className="w-full p-2 border border-gray-300 rounded"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Basic Auth Şifre
                </label>
                <input
                  type="password"
                  className="w-full p-2 border border-gray-300 rounded"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
            
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  className="h-4 w-4 text-blue-600 rounded"
                  checked={sslCheck}
                  onChange={(e) => setSSLCheck(e.target.checked)}
                />
                <span className="ml-2 text-sm text-gray-700">
                  SSL Sertifika kontrolünü etkinleştir
                </span>
              </label>
            </div>
          </div>
        )}
        
        {/* Sertifika Kontrolleri için ek alanlar */}
        {showCertificateFields && (
          <div className={`${showHttpFields ? 'mt-4' : 'border-t border-gray-200 pt-4 mt-4'}`}>
            <h3 className="text-lg font-medium mb-3">SSL Sertifika Ayarları</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sertifika Uyarı Süresi (gün)
                </label>
                <input
                  type="number"
                  className="w-full p-2 border border-gray-300 rounded"
                  value={sslWarningDays}
                  onChange={(e) => setSSLWarningDays(parseInt(e.target.value))}
                  min="1"
                  max="90"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Sertifikanın süresinin dolmasına kaç gün kala uyarı verilsin?
                </p>
              </div>
            </div>
          </div>
        )}
        
        <div className="mt-6">
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none disabled:opacity-50"
            onClick={runTest}
            disabled={isLoading || !endpoint}
          >
            {isLoading ? 'Test Çalışıyor...' : 'Testi Çalıştır'}
          </button>
        </div>
      </div>
      
      {/* Test Sonuçları */}
      {testResult && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Test Sonucu</h2>
          
          <div className={`p-4 mb-4 rounded ${
            testResult.status === 'up' ? 'bg-green-100 text-green-800' : 
            testResult.status === 'warning' ? 'bg-yellow-100 text-yellow-800' : 
            'bg-red-100 text-red-800'
          }`}>
            <div className="font-bold">
              Durum: {
                testResult.status === 'up' ? 'Başarılı' : 
                testResult.status === 'warning' ? 'Uyarı' : 
                testResult.status === 'down' ? 'Hata' : 'Bilinmiyor'
              }
            </div>
            {testResult.errorMessage && (
              <div className="mt-2">{testResult.errorMessage}</div>
            )}
            {testResult.responseTime && (
              <div className="mt-2">Yanıt Süresi: {testResult.responseTime} ms</div>
            )}
          </div>
          
          <div className="mt-4">
            <h3 className="font-medium mb-2">Teknik Detaylar</h3>
            <pre className="bg-gray-100 p-4 rounded overflow-auto max-h-60 text-sm">
              {JSON.stringify(testResult, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
