// API client for Zada Pharmacy SPMS (Web & Electron)

const BASE_URL = import.meta.env.VITE_API_URL || '';

function getToken() {
  return localStorage.getItem('spms_token');
}

export function setToken(token) {
  if (token) {
    localStorage.setItem('spms_token', token);
  } else {
    localStorage.removeItem('spms_token');
  }
}

export function getSavedUser() {
  try {
    const raw = localStorage.getItem('spms_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSavedUser(user) {
  if (user) {
    localStorage.setItem('spms_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('spms_user');
  }
}

async function request(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    // Session expired or invalid
    setToken(null);
    setSavedUser(null);
    window.dispatchEvent(new CustomEvent('auth:expired'));
    throw new Error('Session expired. Please log in again.');
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data;
}

const session = () => ({ token: getToken() });
export const api = {
  records: {
    duplicates: data => window.supplierAPI ? window.supplierAPI.duplicates(data,session()) : request('/api/records/duplicates',{method:'POST',body:JSON.stringify(data)}),
    exportData: data => window.supplierAPI ? window.supplierAPI.exportData(data,session()) : request('/api/records/export',{method:'POST',body:JSON.stringify(data)}),
    backupList: () => window.supplierAPI ? window.supplierAPI.backupList(null,session()) : request('/api/records/backups'),
    createBackup: () => window.supplierAPI ? window.supplierAPI.createBackup(null,session()) : request('/api/records/backups',{method:'POST'}),
    downloadBackup: id => window.supplierAPI ? window.supplierAPI.downloadBackup(id,session()) : request(`/api/records/backups/${encodeURIComponent(id)}`),
    restoreBackup: data => window.supplierAPI ? window.supplierAPI.restoreBackup(data.id || data.backup,session()) : request('/api/records/restore',{method:'POST',body:JSON.stringify(data)}),
    auditList: filters => window.supplierAPI ? window.supplierAPI.auditList(filters,session()) : request(`/api/records/audit?${new URLSearchParams(filters)}`),
  },
  returns: {
    record: data => window.supplierAPI ? window.supplierAPI.recordEvent(data,session()) : request('/api/returns', { method: 'POST', body: JSON.stringify(data) }),
    syncStatus: () => window.supplierAPI ? window.supplierAPI.syncStatus(null,session()) : request('/api/returns/sync-status'),
  },
  // Auth API
  auth: {
    login: async (username, password) => {
      const res = await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setToken(res.token);
      setSavedUser(res.user);
      return res;
    },
    me: async () => {
      return request('/api/auth/me');
    },
    logout: () => {
      setToken(null);
      setSavedUser(null);
    },
    changePassword: async (current_password, new_password) => {
      return request('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password, new_password }),
      });
    },
    getUsers: async () => {
      return request('/api/auth/users');
    },
    createUser: async (userData) => {
      return request('/api/auth/users', {
        method: 'POST',
        body: JSON.stringify(userData),
      });
    },
    toggleStatus: async (userId, status) => {
      return request(`/api/auth/users/${userId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    },
  },

  // Bills API
  bills: {
    list: async (filters = {}) => {
      if (window.supplierAPI) return window.supplierAPI.list(filters,session());
      const params = new URLSearchParams();
      if (filters.from) params.append('from', filters.from);
      if (filters.to) params.append('to', filters.to);
      if (filters.search) params.append('search', filters.search);
      const query = params.toString() ? `?${params.toString()}` : '';
      return request(`/api/bills${query}`);
    },
    save: async (billData) => {
      if (window.supplierAPI) return window.supplierAPI.saveBill(billData,session());
      return request('/api/bills', {
        method: 'POST',
        body: JSON.stringify(billData),
      });
    },
    delete: async (syncId) => {
      if (window.supplierAPI) return window.supplierAPI.deleteBill(syncId,session());
      return request(`/api/bills/${encodeURIComponent(syncId)}`, {
        method: 'DELETE',
      });
    },
    suppliers: async () => {
      if (window.supplierAPI) return window.supplierAPI.suppliers(null,session());
      return request('/api/bills/suppliers');
    },
  },

  // Payments API
  payments: {
    add: async (paymentData) => {
      if (window.supplierAPI) return window.supplierAPI.addPayment(paymentData,session());
      return request('/api/payments', {
        method: 'POST',
        body: JSON.stringify(paymentData),
      });
    },
    delete: async (syncId) => {
      if (window.supplierAPI) return window.supplierAPI.deletePayment(syncId,session());
      return request(`/api/payments/${encodeURIComponent(syncId)}`, {
        method: 'DELETE',
      });
    },
  },
};
