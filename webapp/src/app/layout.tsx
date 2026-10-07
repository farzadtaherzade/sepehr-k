import type { Metadata } from 'next';
import 'vazirmatn/Vazirmatn-font-face.css';
import './globals.css';
import { UiProvider } from '@/components/ui-providers';

export const metadata: Metadata = {
  title: 'سامانه مدیریت داده‌های پروژه | EVM',
  description: 'سامانه مدیریت داده‌های پروژه‌ها، گزارش‌های دوره‌ای و شاخص‌های EVM',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <UiProvider>{children}</UiProvider>
      </body>
    </html>
  );
}
