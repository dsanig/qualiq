import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response("Token requerido", { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Find the share link
  const { data: link, error: linkError } = await supabase
    .from("document_share_links")
    .select("id, document_id, expires_at, download_count")
    .eq("token", token)
    .single();

  if (linkError || !link) {
    return new Response("Enlace no válido o no encontrado.", { status: 404, headers: corsHeaders });
  }

  // Check expiration
  if (new Date(link.expires_at) < new Date()) {
    return new Response("Este enlace ha expirado.", { status: 410, headers: corsHeaders });
  }

  // Get document info
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("file_url, code, title, file_type, status")
    .eq("id", link.document_id)
    .single();

  if (docError || !doc) {
    return new Response("Documento no encontrado.", { status: 404, headers: corsHeaders });
  }

  if (doc.status !== "approved") {
    return new Response("Este documento ya no está disponible para descarga.", { status: 403, headers: corsHeaders });
  }

  // Download the file from storage
  const { data: fileData, error: fileError } = await supabase.storage
    .from("documents")
    .download(doc.file_url);

  if (fileError || !fileData) {
    return new Response("Error al descargar el archivo.", { status: 500, headers: corsHeaders });
  }

  // Increment download count
  await supabase
    .from("document_share_links")
    .update({ download_count: link.download_count + 1 })
    .eq("id", link.id);

  // Determine content type
  const contentType =
    doc.file_type === "pdf" ? "application/pdf" :
    doc.file_type === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" :
    doc.file_type === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" :
    "application/octet-stream";

  const fileName = `${doc.code}-${doc.title}.${doc.file_type}`;

  return new Response(fileData, {
    headers: {
      ...corsHeaders,
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
});
