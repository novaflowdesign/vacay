import { useEffect } from 'react';
import { useSession } from '../lib/useSession';
import { withBase } from '../lib/url';

// Client-side auth guard for statically-rendered pages.
// Actual data access is protected by Supabase RLS — this only redirects
// signed-out visitors away from the UI shell.
export default function RequireAuth() {
  const session = useSession();

  useEffect(() => {
    if (session === null) {
      window.location.replace(withBase('/login'));
    }
  }, [session]);

  return null;
}
