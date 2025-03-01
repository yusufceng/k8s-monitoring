// frontend/src/lib/api.ts
import axios from 'axios';

// API URL'sini env değişkeninden al
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

// API istemcisini oluştur
const apiClient = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Servis API fonksiyonları
export const serviceApi = {
  getAll: async () => {
    const response = await apiClient.get('/services');
    return response.data;
  },
  getById: async (id: number) => {
    const response = await apiClient.get(`/services/${id}`);
    return response.data;
  },
  create: async (service: any) => {
    const response = await apiClient.post('/services', service);
    return response.data;
  },
  update: async (id: number, service: any) => {
    const response = await apiClient.put(`/services/${id}`, service);
    return response.data;
  },
  delete: async (id: number) => {
    const response = await apiClient.delete(`/services/${id}`);
    return response.data;
  },
  getByNamespace: async (namespace: string) => {
    const response = await apiClient.get(`/services/namespace/${namespace}`);
    return response.data;
  },
  getByType: async (type: string) => {
    const response = await apiClient.get(`/services/type/${type}`);
    return response.data;
  },
};

// Uptime API fonksiyonları
export const uptimeApi = {
  getCurrentStatus: async () => {
    const response = await apiClient.get('/uptime/current');
    return response.data;
  },
  getServiceHistory: async (id: number, limit = 100) => {
    const response = await apiClient.get(`/uptime/service/${id}?limit=${limit}`);
    return response.data;
  },
  getServiceStats: async (id: number, start?: string, end?: string) => {
    let url = `/uptime/service/${id}/stats`;
    if (start && end) {
      url += `?start=${start}&end=${end}`;
    }
    const response = await apiClient.get(url);
    return response.data;
  },
};

// Alarm API fonksiyonları
export const alertApi = {
  getActive: async () => {
    const response = await apiClient.get('/alerts');
    return response.data;
  },
  getServiceAlerts: async (id: number, includeResolved = false) => {
    const response = await apiClient.get(`/alerts/service/${id}?includeResolved=${includeResolved}`);
    return response.data;
  },
  getById: async (id: number) => {
    const response = await apiClient.get(`/alerts/${id}`);
    return response.data;
  },
  resolve: async (id: number) => {
    const response = await apiClient.post(`/alerts/${id}/resolve`);
    return response.data;
  },
};

// Dashboard API fonksiyonları
export const dashboardApi = {
  getSummary: async () => {
    const response = await apiClient.get('/dashboard/summary');
    return response.data;
  },
  getRecentAlerts: async () => {
    const response = await apiClient.get('/dashboard/recent-alerts');
    return response.data;
  },
  getStatusCounts: async () => {
    const response = await apiClient.get('/dashboard/status-counts');
    return response.data;
  },
};
