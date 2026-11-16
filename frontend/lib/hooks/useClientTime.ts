'use client';

import { useState, useEffect } from 'react';

/**
 * Hook trả về timestamp hiện tại (mili-giây), cập nhật mỗi giây.
 * Khởi tạo an toàn với SSR để tránh chênh lệch thời gian gây hydration mismatch (React #418).
 */
export const useClientTime = (): number => {
  const [now, setNow] = useState<number>(0);

  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return now;
};
