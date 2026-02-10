import client from '../api/client';

export interface SystemAlert {
  id: number;
  severity: 'info' | 'warning' | 'critical' | 'medium';
  message: string;
  is_resolved: boolean;
  status: 'active' | 'pending_user' | 'resolved';
  created_at: string;
}

export interface BackupResponse {
  status: string;
  message: string;
  file: string;
  path: string;
}

export interface BackupFile {
  filename: string;
  created_at: string;
  size_mb: number;
  type: 'manual' | 'auto';
}

export const getSystemAlerts = async (): Promise<SystemAlert[]> => {
  const token = localStorage.getItem('user_token');
  const response = await client.get('/api/v1/system/alerts', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const getShelfRestockAlerts = async (): Promise<SystemAlert[]> => {
  const token = localStorage.getItem('user_token');
  const response = await client.get('/api/v1/system/alerts/shelf-restock', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const getOperationalAlerts = async (): Promise<SystemAlert[]> => {
  const token = localStorage.getItem('user_token');
  const response = await client.get('/api/v1/system/alerts/operational', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const getUnresolvedAlertCount = async (): Promise<number> => {
  const token = localStorage.getItem('user_token');
  try {
    const response = await client.get('/api/v1/system/alerts/count', {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data.count;
  } catch (error) {
    console.error("Failed to fetch alert count", error);
    return 0;
  }
};

export const triggerManualBackup = async (): Promise<BackupResponse> => {
  const token = localStorage.getItem('user_token');
  const response = await client.post('/api/v1/system/backup', {}, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const getBackups = async (): Promise<BackupFile[]> => {
  const token = localStorage.getItem('user_token');
  const response = await client.get('/api/v1/system/backups', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const restoreBackup = async (filename: string) => {
  const token = localStorage.getItem('user_token');
  const response = await client.post(`/api/v1/system/restore/${filename}`, {}, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const deleteBackup = async (filename: string) => {
  const token = localStorage.getItem('user_token');
  const response = await client.delete(`/api/v1/system/backups/${filename}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const resolveAlert = async (alertId: number): Promise<{ status: string; message: string }> => {
  const token = localStorage.getItem('user_token');
  const response = await client.patch(`/api/v1/system/alerts/${alertId}/resolve`, {}, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const requestAlertClosure = async (alertId: number): Promise<{ status: string; message: string }> => {
  const token = localStorage.getItem('user_token');
  const response = await client.put(`/api/v1/system/alerts/${alertId}/request_closure`, {}, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};
