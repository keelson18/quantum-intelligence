import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Service-role Supabase client used by server-only modules. */
export type AdminClient = SupabaseClient<Database>;
