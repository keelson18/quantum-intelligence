import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedClient } from "@/integrations/supabase/client";

// The ported modules were written against an untyped client; keep that shape so
// row objects stay loosely typed while still using the Lovable Cloud connection.
export const supabase = typedClient as unknown as SupabaseClient;
