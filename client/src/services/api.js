import axios from 'axios';

export const TOKEN_KEY = 'ff_token';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api', timeout: 60000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const url = error.config?.url || '';
    if (error.response?.status === 401 && !url.startsWith('/auth/login') && !url.startsWith('/auth/register')) {
      localStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new Event('ff:unauthorized'));
    }
    return Promise.reject(error);
  }
);

export function errorMessage(err, fallback = 'Something went wrong') {
  if (err?.response?.data?.message) return err.response.data.message;
  if (err?.code === 'ECONNABORTED') return 'The request timed out';
  if (err?.message === 'Network Error') return 'Cannot reach the server';
  return err?.message || fallback;
}

export default api;
