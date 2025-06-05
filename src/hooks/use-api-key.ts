import { useState, useCallback } from 'react';

export function useApiKey() {
  const [apiKey, setApiKey] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return process.env.NEXT_PUBLIC_TINFOIL_API_KEY || localStorage.getItem('tinfoil_api_key');
    }
    return null;
  });

  const getApiKey = useCallback(async () => {
    if (apiKey) {
      return apiKey;
    }

    if (typeof window !== 'undefined') {
      const key = prompt('Please enter your Tinfoil API key:');
      if (key) {
        localStorage.setItem('tinfoil_api_key', key);
        setApiKey(key);
        return key;
      }
    }

    return '';
  }, [apiKey]);

  const clearApiKey = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('tinfoil_api_key');
    }
    setApiKey(null);
  }, []);

  return {
    apiKey,
    getApiKey,
    clearApiKey,
  };
} 