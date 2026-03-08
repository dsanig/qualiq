import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface AuditLogEntry {
  action: string;
  entity_type: string;
  entity_id?: string;
  entity_title?: string;
  details?: Record<string, unknown>;
}

export function useAuditLog() {
  const { user, profile } = useAuth();

  const logAction = useCallback(
    async (entry: AuditLogEntry) => {
      if (!user) return;

      try {
        await (supabase as any).from("audit_trail").insert({
          company_id: profile?.company_id ?? null,
          user_id: user.id,
          user_email: user.email ?? profile?.email ?? null,
          user_name: profile?.full_name ?? user.email ?? null,
          action: entry.action,
          entity_type: entry.entity_type,
          entity_id: entry.entity_id ?? null,
          entity_title: entry.entity_title ?? null,
          details: entry.details ?? {},
        });
      } catch {
        // Audit logging should never break user flows
      }
    },
    [user, profile]
  );

  return { logAction };
}

/**
 * Standalone function for logging when hooks aren't available (e.g., auth flows).
 */
export async function logAuditAction(entry: AuditLogEntry & { userId: string; userEmail?: string; userName?: string; companyId?: string }) {
  try {
    await (supabase as any).from("audit_trail").insert({
      company_id: entry.companyId ?? null,
      user_id: entry.userId,
      user_email: entry.userEmail ?? null,
      user_name: entry.userName ?? null,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id ?? null,
      entity_title: entry.entity_title ?? null,
      details: entry.details ?? {},
    });
  } catch {
    // Silent fail
  }
}
