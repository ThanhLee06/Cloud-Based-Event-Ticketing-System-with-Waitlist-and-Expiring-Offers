'use client';

import { useState, useEffect } from 'react';
import { getServerNow } from '@lib/api/client';

/**
 * Hook trả về timestamp hiện tại (mili-giây), cập nhật mỗi giây.
 * Đếm theo giờ server (ST-007) để khớp với expiresAt UTC do backend trả về.
 * Khởi tạo an toàn với SSR để tránh chênh lệch thời gian gây hydration mismatch (React #418).
 */
export const useClientTime = (): number => {
  const [now, setNow] = useState<number>(0);

  useEffect(() => {
    setNow(getServerNow());
    const interval = setInterval(() => {
      setNow(getServerNow());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return now;
};
