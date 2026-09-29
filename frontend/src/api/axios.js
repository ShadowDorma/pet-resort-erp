import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = String(error.config?.url || '');
    const isAuthCall = url.includes('/auth/login') || url.includes('/auth/register');
    if (error.code === 'ECONNABORTED' && !error.response) {
      error.message = 'La solicitud tardó demasiado. Intenta de nuevo.';
    }
    if (error.response?.status === 401 && !isAuthCall) {
      localStorage.removeItem('token');
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth')) {
        window.location.assign('/auth');
      }
    }
    return Promise.reject(error);
  }
);

export default api;
