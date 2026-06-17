export function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.LOCAL_DATABASE_URL ||
    ''
  );
}

export function hasDatabaseUrl() {
  return Boolean(getDatabaseUrl());
}

export function requireDatabaseUrl() {
  const url = getDatabaseUrl();
  if (!url) {
    throw new Error(
      'Missing DATABASE_URL, SUPABASE_DATABASE_URL, or LOCAL_DATABASE_URL. Set one of these environment variables before starting the backend.'
    );
  }
  return url;
}
