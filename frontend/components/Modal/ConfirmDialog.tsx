'use client';

import React, { useEffect, useRef } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy bỏ',
  isDestructive = false,
  onConfirm,
  onCancel,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // Focus trap, Escape key handling, and Body scroll lock (F07)
  useEffect(() => {
    if (!isOpen) return;

    // Lưu lại element đang focus trước khi mở dialog
    previousActiveElementRef.current = document.activeElement as HTMLElement | null;

    // Khóa cuộn trang
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus vào nút an toàn (nút Hủy đối với hành động destructive)
    const timer = setTimeout(() => {
      if (isDestructive && cancelButtonRef.current) {
        cancelButtonRef.current.focus();
      } else if (confirmButtonRef.current) {
        confirmButtonRef.current.focus();
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }

      // Trap Tab key inside the dialog
      if (e.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);

      // Phục hồi focus khi dialog đóng
      if (
        previousActiveElementRef.current &&
        typeof previousActiveElementRef.current.focus === 'function'
      ) {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isOpen, isDestructive, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(24, 24, 27, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        ref={dialogRef}
        role='dialog'
        aria-modal='true'
        aria-labelledby='confirm-dialog-title'
        aria-describedby='confirm-dialog-desc'
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 14,
          padding: 24,
          maxWidth: 440,
          width: '100%',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          border: '1px solid #e4e4e7',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div
            style={{
              padding: 8,
              borderRadius: 8,
              backgroundColor: isDestructive ? '#fef2f2' : '#f4f4f5',
              color: isDestructive ? '#b91c1c' : '#18181b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isDestructive ? <AlertTriangle size={22} /> : <HelpCircle size={22} />}
          </div>
          <h2
            id='confirm-dialog-title'
            style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#18181b' }}
          >
            {title}
          </h2>
        </div>

        <p
          id='confirm-dialog-desc'
          style={{ margin: '0 0 20px 0', fontSize: '0.9rem', color: '#52525b', lineHeight: 1.5 }}
        >
          {message}
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            ref={cancelButtonRef}
            type='button'
            onClick={onCancel}
            style={{
              padding: '9px 16px',
              borderRadius: 8,
              border: '1px solid #e4e4e7',
              backgroundColor: '#ffffff',
              color: '#52525b',
              fontWeight: 500,
              fontSize: '0.88rem',
              cursor: 'pointer',
            }}
          >
            {cancelText}
          </button>

          <button
            ref={confirmButtonRef}
            type='button'
            onClick={onConfirm}
            style={{
              padding: '9px 18px',
              borderRadius: 8,
              border: 'none',
              backgroundColor: isDestructive ? '#b91c1c' : '#18181b',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '0.88rem',
              cursor: 'pointer',
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
