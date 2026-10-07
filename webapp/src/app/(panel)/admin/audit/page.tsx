import { redirect } from 'next/navigation';
import { getServerUser } from '@/server/auth/page-guard';
import { AuditClient } from '@/components/panels/AuditClient';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const user = await getServerUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/');
  return <AuditClient />;
}
