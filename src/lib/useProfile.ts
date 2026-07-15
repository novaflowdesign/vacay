import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useSession } from './useSession';
import type { Profile } from './types';

// undefined = still checking, null = no session / no profile row, Profile = loaded
export function useProfile() {
  const session = useSession();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    if (session === null) {
      setProfile(null);
      return;
    }
    if (!session) return;

    let cancelled = false;

    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        if (!cancelled) setProfile((data as Profile) ?? null);
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  return profile;
}
