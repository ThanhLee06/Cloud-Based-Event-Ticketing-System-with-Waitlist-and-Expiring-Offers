'use client';

import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  id: string;
};

/**
 * Ô nhập mật khẩu có nút hiện/ẩn (biểu tượng con mắt).
 * Dùng thay cho <input type='password' className='ef-input' /> ở mọi form.
 */
const PasswordInput: React.FC<PasswordInputProps> = ({ className, style, ...props }) => {
  const [visible, setVisible] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`${className ?? 'ef-input'} ef-password-input`}
        style={{ paddingRight: 42, ...style }}
      />
      <button
        type='button'
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        aria-pressed={visible}
        aria-controls={props.id}
        title={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        disabled={props.disabled}
        style={{
          position: 'absolute',
          top: '50%',
          right: 4,
          transform: 'translateY(-50%)',
          width: 34,
          height: 34,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          borderRadius: 6,
          background: 'transparent',
          color: 'var(--text-muted)',
          cursor: 'pointer',
        }}
      >
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
};

export default PasswordInput;
