import axios from 'axios';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Add auth token to all requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('opsflow_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('opsflow_token');
      localStorage.removeItem('opsflow_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Generate idempotency key for mutations
function idempotencyHeaders(): Record<string, string> {
  return { 'Idempotency-Key': crypto.randomUUID() };
}

// ===== AUTH =====
export const authAPI = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (email: string, password: string, displayName: string) =>
    api.post('/auth/register', { email, password, displayName }),
  me: () => api.get('/auth/me'),
};

// ===== WORK ITEMS =====
export const workItemsAPI = {
  list: (params?: Record<string, string>) =>
    api.get('/work-items', { params }),
  get: (id: string) =>
    api.get(`/work-items/${id}`),
  create: (data: any) =>
    api.post('/work-items', data, { headers: idempotencyHeaders() }),
  update: (id: string, data: any) =>
    api.patch(`/work-items/${id}`, data, { headers: idempotencyHeaders() }),
  changeStatus: (id: string, status: string, version: number) =>
    api.post(`/work-items/${id}/status`, { status, version }, { headers: idempotencyHeaders() }),
  assign: (id: string, assignedToId: string | null, version: number) =>
    api.post(`/work-items/${id}/assign`, { assignedToId, version }, { headers: idempotencyHeaders() }),
  addComment: (id: string, content: string) =>
    api.post(`/work-items/${id}/comments`, { content }, { headers: idempotencyHeaders() }),
  getComments: (id: string) =>
    api.get(`/work-items/${id}/comments`),
  acceptAISuggestion: (id: string, field: string, value: any, version: number) =>
    api.post(`/work-items/${id}/ai-suggestion`, { action: 'accept', field, value, version }),
  dismissAISuggestion: (id: string, field: string) =>
    api.post(`/work-items/${id}/ai-suggestion`, { action: 'dismiss', field }),
  delete: (id: string) =>
    api.delete(`/work-items/${id}`),
};

// ===== TEAMS =====
export const teamsAPI = {
  list: () => api.get('/teams'),
  get: (id: string) => api.get(`/teams/${id}`),
  create: (data: { name: string; description?: string }) => api.post('/teams', data),
  addMember: (teamId: string, userId: string, role?: string) =>
    api.post(`/teams/${teamId}/members`, { userId, role }),
};

// ===== USERS =====
export const usersAPI = {
  list: (params?: Record<string, string>) => api.get('/users', { params }),
  notifications: () => api.get('/users/notifications'),
  markRead: (id: string) => api.patch(`/users/notifications/${id}/read`),
  markAllRead: () => api.patch('/users/notifications/read-all'),
};

// ===== DASHBOARD =====
export const dashboardAPI = {
  get: () => api.get('/dashboard'),
};

// ===== AI =====
export const aiAPI = {
  status: () => api.get('/ai/status'),
  classify: (title: string, description: string) =>
    api.post('/ai/classify', { title, description }),
  summarize: (id: string) => api.post(`/ai/summarize/${id}`),
  findSimilar: (title: string, description: string, teamId: string) =>
    api.post('/ai/find-similar', { title, description, teamId }),
};

export default api;
