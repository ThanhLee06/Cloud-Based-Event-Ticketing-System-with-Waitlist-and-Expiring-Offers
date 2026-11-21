import React from 'react';
import { type Metadata, type Viewport } from 'next';
import './styles/site.css';

import { MockStoreProvider } from '@lib/mock/store';
import { AuthProvider } from '@lib/auth/AuthProvider';
import Header from '@components/Header/Header';
import Footer from '@components/Footer/Footer';
import ScenarioToolbar from '@components/Demo/ScenarioToolbar';

export const viewport: Viewport = {
  width: 'device-width',
  themeColor: '#18181b',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: 'EventFlow - Khám Phá & Đặt Vé Sự Kiện Trực Tuyến',
    template: '%s · EventFlow',
  },
  description:
    'Nền tảng đặt vé sự kiện với cơ chế giữ chỗ 10 phút, tự động điều phối danh sách chờ FIFO và cấp quyền mua vé có thời hạn.',
  keywords:
    'EventFlow, bán vé sự kiện, vé ca nhạc, danh sách chờ FIFO, quyền mua vé có thời hạn, expiring offers',
  icons: {
    icon: '/favicon.ico',
    apple: '/logo192.png',
  },
};

const RootLayout: React.FC<Readonly<{ children: React.ReactNode }>> = ({ children }) => {
  return (
    <html lang='vi'>
      <head>
        <link rel='preconnect' href='https://fonts.googleapis.com' />
        <link rel='preconnect' href='https://fonts.gstatic.com' crossOrigin='anonymous' />
        <link
          href='https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,600&display=swap'
          rel='stylesheet'
        />
      </head>
      <body
        style={{
          backgroundColor: '#fafafa',
          color: '#18181b',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          fontFamily:
            "'Plus Jakarta Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <MockStoreProvider>
          <AuthProvider>
            <Header />
            <main style={{ flex: 1 }}>{children}</main>
            <Footer />
            <ScenarioToolbar />
          </AuthProvider>
        </MockStoreProvider>
      </body>
    </html>
  );
};

export default RootLayout;
