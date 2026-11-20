import { ServerActionResult } from '@shared/actions/server-action-result';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface SharePollingData {
  expiredAt: Date | null;
  manuallyStoppedAt: Date | null;
  tokenPointsLimit: number | null;
  budgetUsedBySharedChat: number;
  tokenLimitExceeded: boolean;
}

export function useShareDataPolling({
  fetchShareData,
  isActive,
  intervalMs = 60_000,
}: {
  fetchShareData: () => Promise<ServerActionResult<SharePollingData>>;
  isActive: boolean;
  intervalMs?: number;
}): { data: SharePollingData | null; refetch: () => Promise<void> } {
  const [polledData, setPolledData] = useState<SharePollingData | null>(null);

  // we store that function in a ref to avoid re-running the effect when the function changes
  // this is important if the calling component uses a lambda function that is re-created on every render
  const fetchRef = useRef(fetchShareData);

  useEffect(() => {
    fetchRef.current = fetchShareData;
  }, [fetchShareData]);

  const poll = useCallback(async () => {
    const result = await fetchRef.current(); // latest version
    if (result.success && result.value) {
      setPolledData(result.value);
    }
  }, []);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const interval = setInterval(() => void poll(), intervalMs);
    return () => clearInterval(interval);
  }, [isActive, intervalMs, poll]);

  return { data: polledData, refetch: poll };
}
