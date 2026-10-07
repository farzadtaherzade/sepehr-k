export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.INIT_ON_START === 'true') {
      const { initDatabase } = await import('./server/init-db');
      await initDatabase().catch((e: unknown) => {
        // Loud but non-fatal: if the DB is briefly unavailable the app still
        // boots; login/queries surface the real error. Restart to retry.
        console.error('[init-db] FAILED —', e instanceof Error ? e.message : e);
      });
    }
  }
}
