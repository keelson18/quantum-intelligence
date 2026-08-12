// ============================================================================
// Role assignment — privileged and server-side only.
// Clients cannot write to user_roles (grants revoked), so a new account claims
// its default non-privileged role here, after its identity is verified.
// ============================================================================

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DEFAULT_ROLE = "trader" as const;

export const claimDefaultRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as {
      from(table: string): {
        select(cols: string): { eq(col: string, val: string): { limit(n: number): Promise<{ data: unknown[] | null }> } };
        insert(rows: Record<string, unknown>[]): Promise<{ error: { message: string } | null }>;
      };
    };

    const { data: existing } = await db.from("user_roles").select("id").eq("user_id", context.userId).limit(1);
    if (existing && existing.length > 0) return { role: null };

    const { error } = await db.from("user_roles").insert([{ user_id: context.userId, role: DEFAULT_ROLE }]);
    if (error) {
      console.error("[roles] default role assignment failed", error.message);
      return { error: "Could not assign default role" as const };
    }
    return { role: DEFAULT_ROLE };
  });
