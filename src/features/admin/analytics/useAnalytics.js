import { useEffect, useState } from 'react';
import { fetchAnalytics } from './analyticsApi';

export function useAnalytics(filters, revision) {
  const query = new URLSearchParams(filters).toString();
  const key = `${query}:${revision}`;
  const [result, setResult] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    fetchAnalytics(query, controller.signal).then(
      (data) => { if (!controller.signal.aborted) setResult({ key, data }); },
      (error) => { if (!controller.signal.aborted) setResult({ key, error: error.message }); }
    );
    return () => controller.abort();
  }, [query, key]);
  return result?.key === key ? { ...result, loading: false } : { loading: true };
}
