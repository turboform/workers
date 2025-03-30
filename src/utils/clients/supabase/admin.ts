import { createClient } from "@supabase/supabase-js";
import { Database } from 'lib/types/database.types';

export const supabaseAdminClient = createClient<Database>(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
