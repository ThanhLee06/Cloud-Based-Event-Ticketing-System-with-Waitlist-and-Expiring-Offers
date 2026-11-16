'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { formatTimeRemaining } from '@lib/utils/format';
import { Timer, TimerOff, Clock, AlertTriangle } from 'lucide-react';

interface CountdownProps {
  expiresAt: string;
  onExpire?: () => void;
  label?: string;
  compact?: boolean;
}

const Countdown: React.FC<CountdownProps> = ({
  expiresAt,
  onExpire,
  label = 'Thời gian giữ vé còn lại:',
  compact = false,
}) => {
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const targetTime = useMemo(() => new Date(expiresAt).getTime(), [expiresAt]);

  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [hasExpired, setHasExpired] = useState<boolean>(false);
  const hasCalledExpireRef = useRef<boolean>(false);

  useEffect(() => {
    setIsMounted(true);
    const initialRemaining = Math.max(0, Math.floor((targetTime - Date.now()) / 1000));
    setSecondsLeft(initialRemaining);
    const expired = initialRemaining <= 0;
    setHasExpired(expired);
    hasCalledExpireRef.current = expired;
    if (expired) {
      onExpire?.();
    }
  }, [targetTime, onExpire]);

  useEffect(() => {
    if (!isMounted) return;

    const checkExpiry = () => {
      const remaining = Math.max(0, Math.floor((targetTime - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        setHasExpired(true);
        if (!hasCalledExpireRef.current) {
          hasCalledExpireRef.current = true;
          onExpire?.();
        }
      } else {
        setHasExpired(false);
        hasCalledExpireRef.current = false;
      }
    };

    const interval = setInterval(checkExpiry, 1000);
    return () => clearInterval(interval);
  }, [targetTime, onExpire, isMounted]);

  const isUrgent = isMounted && secondsLeft > 0 && secondsLeft <= 60;

  if (compact) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '4px 8px',
          borderRadius: 6,
          backgroundColor: !isMounted
            ? '#f4f4f5'
            : hasExpired
              ? '#fef2f2'
              : isUrgent
                ? '#fffbeb'
                : '#f4f4f5',
          color: !isMounted ? '#52525b' : hasExpired ? '#b91c1c' : isUrgent ? '#92400e' : '#18181b',
          fontWeight: 600,
          fontSize: '0.82rem',
          border: `1px solid ${
            !isMounted ? '#e4e4e7' : hasExpired ? '#fecaca' : isUrgent ? '#fde68a' : '#e4e4e7'
          }`,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {!isMounted ? (
          <Clock size={14} />
        ) : hasExpired ? (
          <TimerOff size={14} />
        ) : (
          <Timer size={14} />
        )}
        {!isMounted ? '--:--' : hasExpired ? 'Đã hết hạn' : formatTimeRemaining(secondsLeft)}
      </span>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderRadius: 12,
        backgroundColor: !isMounted
          ? '#f4f4f5'
          : hasExpired
            ? '#fef2f2'
            : isUrgent
              ? '#fffbeb'
              : '#fafafa',
        border: `1px solid ${
          !isMounted ? '#e4e4e7' : hasExpired ? '#fecaca' : isUrgent ? '#fde68a' : '#e4e4e7'
        }`,
        transition: 'background-color 0.2s ease, border-color 0.2s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            padding: 8,
            borderRadius: 8,
            backgroundColor: !isMounted
              ? '#f4f4f5'
              : hasExpired
                ? '#fee2e2'
                : isUrgent
                  ? '#fef3c7'
                  : '#f4f4f5',
            color: !isMounted
              ? '#52525b'
              : hasExpired
                ? '#b91c1c'
                : isUrgent
                  ? '#92400e'
                  : '#18181b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {!isMounted ? (
            <Clock size={20} />
          ) : hasExpired ? (
            <TimerOff size={20} />
          ) : isUrgent ? (
            <AlertTriangle size={20} />
          ) : (
            <Clock size={20} />
          )}
        </div>
        <div>
          <div
            style={{
              fontSize: '0.84rem',
              color: isMounted && hasExpired ? '#991b1b' : '#52525b',
              fontWeight: 500,
            }}
          >
            {label}
          </div>
          {isMounted && isUrgent && !hasExpired && (
            <div style={{ fontSize: '0.74rem', color: '#92400e', fontWeight: 600, marginTop: 2 }}>
              Sắp hết hạn! Vui lòng hoàn tất trong thời gian còn lại.
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          fontSize: '1.25rem',
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          color: !isMounted ? '#52525b' : hasExpired ? '#b91c1c' : isUrgent ? '#92400e' : '#18181b',
          letterSpacing: '0.04em',
          backgroundColor: '#ffffff',
          padding: '4px 10px',
          borderRadius: 6,
          border: '1px solid #e4e4e7',
        }}
      >
        {!isMounted ? '--:--' : hasExpired ? '00:00' : formatTimeRemaining(secondsLeft)}
      </div>
    </div>
  );
};

export default Countdown;
