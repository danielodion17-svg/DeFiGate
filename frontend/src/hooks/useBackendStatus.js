import { useState, useEffect } from 'react';
import { apiUrl } from '../api';

export function useBackendStatus() {
  const [backendStatus, setBackendStatus] = useState('checking'); // 'online', 'offline', 'checking'

  useEffect(() => {
    let isCancelled = false;
    const checkBackendStatus = async () => {
      try {
        const response = await fetch(apiUrl('/health'));
        if (isCancelled) return;
        setBackendStatus(response.ok ? 'online' : 'offline');
      } catch (error) {
        if (isCancelled) return;
        setBackendStatus('offline');
      }
    };

    checkBackendStatus();

    return () => {
      isCancelled = true;
    };
  }, []);

  return backendStatus;
}