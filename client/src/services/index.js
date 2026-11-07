import api from './api';

const data = (p) => p.then((r) => r.data);

export const authApi = {
  register: (body) => data(api.post('/auth/register', body)),
  login: (body) => data(api.post('/auth/login', body)),
  me: () => data(api.get('/auth/me')),
  updateProfile: (body) => data(api.put('/auth/profile', body)),
  changePassword: (body) => data(api.put('/auth/password', body)),
  deleteAccount: (password) => data(api.delete('/auth/account', { data: { password } })),
};
export const workflowApi = {
  list: (params) => data(api.get('/workflows', { params })),
  get: (id) => data(api.get(`/workflows/${id}`)),
  create: (body) => data(api.post('/workflows', body)),
  update: (id, body) => data(api.put(`/workflows/${id}`, body)),
  remove: (id) => data(api.delete(`/workflows/${id}`)),
  duplicate: (id) => data(api.post(`/workflows/${id}/duplicate`)),
  setStatus: (id, status) => data(api.patch(`/workflows/${id}/status`, { status })),
  execute: (id, input) => data(api.post(`/workflows/${id}/execute`, { input })),
};
export const executionApi = {
  list: (params) => data(api.get('/executions', { params })),
  get: (id) => data(api.get(`/executions/${id}`)),
  retry: (id) => data(api.post(`/executions/${id}/retry`)),
  cancel: (id) => data(api.post(`/executions/${id}/cancel`)),
};
export const templateApi = {
  list: () => data(api.get('/templates')),
  get: (id) => data(api.get(`/templates/${id}`)),
  clone: (id, name) => data(api.post(`/templates/${id}/clone`, name ? { name } : {})),
};
export const integrationApi = {
  list: () => data(api.get('/integrations')),
  create: (body) => data(api.post('/integrations', body)),
  update: (id, body) => data(api.put(`/integrations/${id}`, body)),
  remove: (id) => data(api.delete(`/integrations/${id}`)),
};
export const dashboardApi = {
  stats: () => data(api.get('/dashboard/stats')),
  analytics: (days = 14) => data(api.get('/dashboard/analytics', { params: { days } })),
};
