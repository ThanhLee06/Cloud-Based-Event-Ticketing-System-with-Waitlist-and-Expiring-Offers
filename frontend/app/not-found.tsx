import React from 'react';
import Link from 'next/link';
import { Compass, ArrowLeft } from 'lucide-react';

const NotFoundPage: React.FC = () => (
  <div className='ef-container-sm'>
    <div className='ef-icon-circle ef-icon-circle-neutral'>
      <Compass size={32} />
    </div>

    <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: 8, letterSpacing: '-0.02em' }}>
      404 - Không tìm thấy trang
    </h1>

    <p
      style={{ fontSize: '0.94rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 28 }}
    >
      Đường dẫn bạn yêu cầu không tồn tại hoặc đã được thay đổi. Vui lòng quay lại trang khám phá để
      tiếp tục tìm sự kiện.
    </p>

    <Link href='/' className='ef-btn ef-btn-primary'>
      <ArrowLeft size={16} />
      <span>Quay lại trang khám phá</span>
    </Link>
  </div>
);

export default NotFoundPage;
