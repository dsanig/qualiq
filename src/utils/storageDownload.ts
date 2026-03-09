import type { SupabaseClient } from "@supabase/supabase-js";

type DownloadStorageFileParams = {
  supabase: SupabaseClient;
  bucketId: string;
  objectPath: string;
  downloadFileName: string;
};

export const downloadStorageFile = async ({
  supabase,
  bucketId,
  objectPath,
  downloadFileName,
}: DownloadStorageFileParams): Promise<boolean> => {
  const { data, error } = await supabase.storage.from(bucketId).download(objectPath);
  if (error || !data) return false;

  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = downloadFileName;
  link.click();
  URL.revokeObjectURL(url);
  return true;
};

