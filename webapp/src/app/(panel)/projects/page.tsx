import { redirect } from 'next/navigation';
import { getServerUser } from '@/server/auth/page-guard';
import { ProjectsClient } from '@/components/panels/ProjectsClient';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const user = await getServerUser();
  if (!user) redirect('/login');
  return <ProjectsClient role={user.role} />;
}
