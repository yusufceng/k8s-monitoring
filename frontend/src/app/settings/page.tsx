"use client";

import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function Settings() {
  const [apiUrl, setApiUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [skipTLSVerify, setSkipTLSVerify] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage({ text: '', type: '' });

    try {
      // Bu endpoint henüz oluşturulmadı, sonraki adımda ekleyeceğiz
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/settings`, {
        k8s_api_url: apiUrl,
        k8s_api_token: apiToken,
        k8s_skip_tls_verify: skipTLSVerify
      });
      
      setMessage({ 
        text: 'Ayarlar başarıyla kaydedildi. Kubernetes bağlantısı yeniden başlatılıyor...', 
        type: 'success'
      });
      
      // Bir kaç saniye sonra bağlantıyı test et
      setTimeout(testConnection, 3000);
    } catch (error) {
      setMessage({ 
        text: 'Ayarlar kaydedilirken bir hata oluştu!', 
        type: 'error'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const testConnection = async () => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/health`);
      
      if (response.data.kubernetes_connected) {
        setMessage({ 
          text: 'Kubernetes API bağlantısı başarılı!', 
          type: 'success'
        });
      } else {
        setMessage({ 
          text: 'Kubernetes API bağlantısı kurulamadı. Ayarlarınızı kontrol edin.', 
          type: 'error'
        });
      }
    } catch (error) {
      setMessage({ 
        text: 'Bağlantı testi başarısız oldu!', 
        type: 'error'
      });
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Ayarlar</h1>
      
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Kubernetes Bağlantı Ayarları</h2>
        
        {message.text && (
          <div className={`p-4 mb-4 rounded ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {message.text}
          </div>
        )}
        
        <form onSubmit={saveSettings}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Kubernetes/OpenShift API URL
            </label>
            <input
              type="text"
              className="w-full p-2 border border-gray-300 rounded"
              placeholder="https://api.cluster.example.com:6443"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
            />
            <p className="text-sm text-gray-500 mt-1">
              Örnek: https://api.ocp4.example.com:6443
            </p>
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              API Token
            </label>
            <textarea
              className="w-full p-2 border border-gray-300 rounded"
              placeholder="eyJhbGciOiJSUzI1NiIsImtpZCI6I..."
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              rows={4}
            />
            <p className="text-sm text-gray-500 mt-1">
              OpenShift/Kubernetes servis hesabı tokenını buraya yapıştırın
            </p>
          </div>
          
          <div className="mb-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                className="h-4 w-4 text-blue-600"
                checked={skipTLSVerify}
                onChange={(e) => setSkipTLSVerify(e.target.checked)}
              />
              <span className="ml-2 text-sm text-gray-700">
                TLS doğrulamasını atla (güvenli olmayan ortamlar için)
              </span>
            </label>
          </div>
          
          <div className="mt-6">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
            </button>
            
            <button
              type="button"
              className="ml-4 px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 focus:outline-none"
              onClick={testConnection}
            >
              Bağlantıyı Test Et
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
