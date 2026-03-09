import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface EventSource {
  id: string;
  title: string;
  date: string;
  type: "document_expiry" | "incidencia_deadline" | "reclamacion_deadline" | "audit_date" | "document_responsibility" | "training_deadline";
  link?: string;
  user_ids: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];

    // Fetch all users with their notification preferences
    const { data: users, error: usersError } = await supabase
      .from("profiles")
      .select("user_id, company_id, full_name, email");

    if (usersError) throw usersError;

    // Fetch user preferences
    const { data: preferences } = await supabase
      .from("user_notification_preferences")
      .select("user_id, alert_period_1, alert_period_2");

    const prefsMap = new Map(
      (preferences || []).map((p) => [p.user_id, p])
    );

    const events: EventSource[] = [];

    // 1. Document expiry dates
    const { data: documents } = await supabase
      .from("documents")
      .select("id, title, expiry_date, company_id, owner_id")
      .not("expiry_date", "is", null)
      .gte("expiry_date", todayStr);

    if (documents) {
      for (const doc of documents) {
        const companyUsers = users?.filter((u) => u.company_id === doc.company_id) || [];
        events.push({
          id: `doc_expiry_${doc.id}`,
          title: `Vencimiento: ${doc.title}`,
          date: doc.expiry_date!,
          type: "document_expiry",
          link: `/documentos`,
          user_ids: companyUsers.map((u) => u.user_id),
        });
      }
    }

    // 2. Incidencias deadlines
    const { data: incidencias } = await supabase
      .from("incidencias")
      .select("id, title, deadline, company_id, responsible_id")
      .not("deadline", "is", null)
      .neq("status", "closed")
      .gte("deadline", todayStr);

    if (incidencias) {
      for (const inc of incidencias) {
        const targetUsers = inc.responsible_id 
          ? [inc.responsible_id]
          : users?.filter((u) => u.company_id === inc.company_id).map((u) => u.user_id) || [];
        
        events.push({
          id: `inc_${inc.id}`,
          title: `Plazo incidencia: ${inc.title}`,
          date: inc.deadline!,
          type: "incidencia_deadline",
          link: `/incidencias`,
          user_ids: targetUsers,
        });
      }
    }

    // 3. Reclamaciones deadlines
    const { data: reclamaciones } = await supabase
      .from("reclamaciones")
      .select("id, title, response_deadline, company_id, responsible_id")
      .not("response_deadline", "is", null)
      .neq("status", "cerrada")
      .gte("response_deadline", todayStr);

    if (reclamaciones) {
      for (const rec of reclamaciones) {
        const targetUsers = rec.responsible_id 
          ? [rec.responsible_id]
          : users?.filter((u) => u.company_id === rec.company_id).map((u) => u.user_id) || [];
        
        events.push({
          id: `rec_${rec.id}`,
          title: `Plazo reclamación: ${rec.title}`,
          date: rec.response_deadline!,
          type: "reclamacion_deadline",
          link: `/reclamaciones`,
          user_ids: targetUsers,
        });
      }
    }

    // 4. Audit dates
    const { data: audits } = await supabase
      .from("audits")
      .select("id, title, audit_date, company_id, auditor_id, responsible_id")
      .not("audit_date", "is", null)
      .neq("status", "completed")
      .gte("audit_date", todayStr);

    if (audits) {
      for (const audit of audits) {
        const targetUsers = [audit.auditor_id, audit.responsible_id].filter(Boolean) as string[];
        events.push({
          id: `audit_${audit.id}`,
          title: `Auditoría: ${audit.title}`,
          date: audit.audit_date!,
          type: "audit_date",
          link: `/auditorias`,
          user_ids: targetUsers,
        });
      }
    }

    // 5. Document responsibilities (pending reviews, signatures, approvals)
    const { data: responsibilities } = await supabase
      .from("document_responsibilities")
      .select("id, document_id, user_id, action_type, due_date, documents(title)")
      .eq("status", "pending")
      .not("due_date", "is", null)
      .gte("due_date", todayStr);

    if (responsibilities) {
      for (const resp of responsibilities) {
        const actionLabel = resp.action_type === "revision" ? "Revisión" 
          : resp.action_type === "firma" ? "Firma"
          : "Aprobación";
        
        events.push({
          id: `resp_${resp.id}`,
          title: `${actionLabel} pendiente: ${(resp.documents as any)?.title || "Documento"}`,
          date: resp.due_date!,
          type: "document_responsibility",
          link: `/documentos`,
          user_ids: [resp.user_id],
        });
      }
    }

    // 6. Training deadlines
    const { data: trainings } = await supabase
      .from("training_records")
      .select("id, title, deadline, company_id")
      .not("deadline", "is", null)
      .neq("status", "completed")
      .gte("deadline", todayStr);

    if (trainings) {
      for (const training of trainings) {
        const companyUsers = users?.filter((u) => u.company_id === training.company_id) || [];
        events.push({
          id: `training_${training.id}`,
          title: `Formación: ${training.title}`,
          date: training.deadline!,
          type: "training_deadline",
          link: `/formaciones`,
          user_ids: companyUsers.map((u) => u.user_id),
        });
      }
    }

    // Generate notifications for each event and user
    const notificationsToInsert: any[] = [];
    const processedKeys = new Set<string>();

    for (const event of events) {
      const eventDate = new Date(event.date);
      eventDate.setHours(0, 0, 0, 0);
      const daysUntil = Math.floor((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      for (const userId of event.user_ids) {
        const prefs = prefsMap.get(userId) || { alert_period_1: 7, alert_period_2: 3 };
        const periods = [prefs.alert_period_1, prefs.alert_period_2, 0]; // 0 = day of event

        for (const period of periods) {
          if (daysUntil === period) {
            const key = `${event.id}_${userId}_${period}`;
            if (processedKeys.has(key)) continue;
            processedKeys.add(key);

            const message = period === 0
              ? `Hoy es el día del evento: ${event.title}`
              : `Faltan ${period} día${period > 1 ? "s" : ""} para: ${event.title}`;

            notificationsToInsert.push({
              user_id: userId,
              title: event.title,
              message,
              type: period === 0 ? "warning" : "info",
              link: event.link,
              is_read: false,
            });
          }
        }
      }
    }

    // Insert notifications (avoiding duplicates by checking existing)
    if (notificationsToInsert.length > 0) {
      // Check for existing notifications today to avoid duplicates
      const { data: existingToday } = await supabase
        .from("notifications")
        .select("title, user_id")
        .gte("created_at", todayStr);

      const existingKeys = new Set(
        (existingToday || []).map((n) => `${n.title}_${n.user_id}`)
      );

      const newNotifications = notificationsToInsert.filter(
        (n) => !existingKeys.has(`${n.title}_${n.user_id}`)
      );

      if (newNotifications.length > 0) {
        const { error: insertError } = await supabase
          .from("notifications")
          .insert(newNotifications);

        if (insertError) throw insertError;
      }

      return new Response(
        JSON.stringify({
          success: true,
          generated: newNotifications.length,
          skipped: notificationsToInsert.length - newNotifications.length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, generated: 0, message: "No events require notifications today" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error generating notifications:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
