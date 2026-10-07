import { notFound, redirect } from 'next/navigation';
import { getServerUser } from '@/server/auth/page-guard';
import { getProjectDetail } from '@/server/queries';
import { ProjectDetailClient } from '@/components/panels/ProjectDetailClient';

export const dynamic = 'force-dynamic';

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser();
  if (!user) redirect('/login');
  const { id } = await params;
  const pid = Number(id);
  if (!Number.isInteger(pid)) notFound();
  const detail = await getProjectDetail(pid);
  if (!detail) notFound();
  return <ProjectDetailClient initial={detail} role={user.role} />;
}
