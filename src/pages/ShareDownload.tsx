import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, FileDown, AlertCircle } from "lucide-react";

export default function ShareDownload() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "downloading" | "error" | "expired">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("Enlace no válido: falta el token.");
      return;
    }

    const download = async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/share-document?token=${token}`
        );

        if (response.status === 410) {
          setStatus("expired");
          return;
        }

        if (!response.ok) {
          const text = await response.text();
          setStatus("error");
          setErrorMsg(text || "Error al descargar el documento.");
          return;
        }

        setStatus("downloading");

        const blob = await response.blob();
        const disposition = response.headers.get("Content-Disposition") || "";
        const match = disposition.match(/filename="?(.+?)"?$/);
        const fileName = match ? match[1] : "documento";

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err: any) {
        setStatus("error");
        setErrorMsg(err.message || "Error inesperado.");
      }
    };

    download();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
          <img src="/iQ_V1.svg" alt="QualiQ" className="w-9 h-9" />
        </div>
        <h1 className="text-xl font-bold text-foreground">
          QualiQ<span className="text-sm font-normal italic text-muted-foreground">, by INMEDSA</span>
        </h1>

        {status === "loading" && (
          <div className="space-y-2">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-accent" />
            <p className="text-sm text-muted-foreground">Preparando descarga...</p>
          </div>
        )}

        {status === "downloading" && (
          <div className="space-y-2">
            <FileDown className="w-8 h-8 mx-auto text-success" />
            <p className="text-sm text-foreground font-medium">Descarga iniciada</p>
            <p className="text-xs text-muted-foreground">Si la descarga no comienza automáticamente, revisa tu carpeta de descargas.</p>
          </div>
        )}

        {status === "expired" && (
          <div className="space-y-2">
            <AlertCircle className="w-8 h-8 mx-auto text-warning" />
            <p className="text-sm text-foreground font-medium">Enlace expirado</p>
            <p className="text-xs text-muted-foreground">Este enlace de descarga ha caducado. Solicita uno nuevo al remitente.</p>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-2">
            <AlertCircle className="w-8 h-8 mx-auto text-destructive" />
            <p className="text-sm text-foreground font-medium">Error</p>
            <p className="text-xs text-muted-foreground">{errorMsg}</p>
          </div>
        )}
      </div>
    </div>
  );
}
