import { redirect } from 'next/navigation';
import { getServerUser } from '@/server/auth/page-guard';
import { listProjects } from '@/server/queries';
import { SnapshotsClient } from '@/components/panels/SnapshotsClient';

export const dynamic = 'force-dynamic';

export default async function SnapshotsPage() {
  const user = await getServerUser();
  if (!user) redirect('/login');
  const projects = await listProjects();
  return <SnapshotsClient projects={projects} role={user.role} />;
}
