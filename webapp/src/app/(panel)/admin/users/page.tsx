import { redirect } from 'next/navigation';
import { getServerUser } from '@/server/auth/page-guard';
import { UsersClient } from '@/components/panels/UsersClient';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const user = await getServerUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/');
  return <UsersClient currentUid={user.uid} />;
}
