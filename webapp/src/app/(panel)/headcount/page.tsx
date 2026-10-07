import { redirect } from 'next/navigation';
import { getServerUser } from '@/server/auth/page-guard';
import { listCategories, listHeadcount, listProjects, listSnapshots } from '@/server/queries';
import { HeadcountClient } from '@/components/panels/HeadcountClient';

export const dynamic = 'force-dynamic';

export default async function HeadcountPage() {
  const user = await getServerUser();
  if (!user) redirect('/login');
  const [projects, categories, snapshots, headcount] = await Promise.all([
    listProjects(),
    listCategories(),
    listSnapshots({}),
    listHeadcount(),
  ]);
  return (
    <HeadcountClient
      projects={projects}
      categories={categories}
      snapshots={snapshots.map((s) => ({ id: s.id, project_id: s.project_id, project_name: s.project_name ?? '', report_date: s.report_date }))}
      headcount={headcount}
      role={user.role}
    />
  );
}
