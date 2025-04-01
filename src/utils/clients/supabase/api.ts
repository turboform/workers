import { createClient } from '@supabase/supabase-js';
import { AppContext } from 'lib/types/app-context';
import { Database } from 'lib/types/database.types';

export const supabaseApiClient = (authToken: string, c: AppContext) => createClient<Database>(
  c.env.SUPABASE_URL,
  c.env.SUPABASE_ANON_KEY,
  {
    global: {
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
    }
  })