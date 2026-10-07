import { redirect } from 'next/navigation';
import { getServerUser } from '@/server/auth/page-guard';
import { Shell } from '@/components/Shell';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser();
  if (!user) redirect('/login');
  if (user.mustChangePassword) redirect('/change-password');
  return <Shell user={{ name: user.name, username: user.username, role: user.role }}>{children}</Shell>;
}
