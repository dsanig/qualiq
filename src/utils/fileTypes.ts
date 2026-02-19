export type DocumentFileType = "pdf" | "word" | "excel" | "image" | "other";

const WORD_EXTENSIONS = new Set(["doc", "docx"]);
const EXCEL_EXTENSIONS = new Set(["xls", "xlsx"]);
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);

const WORD_MIME_TYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-word",
]);

const EXCEL_MIME_TYPES = new Set([
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/excel",
  "application/x-excel",
]);

const IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpg",
  "image/jpeg",
  "image/webp",
]);

export function getFileExtension(filename: string): string {
  const trimmed = filename?.trim() ?? "";
  const dotIndex = trimmed.lastIndexOf(".");
  if (dotIndex === -1 || dotIndex === trimmed.length - 1) return "";
  return trimmed.slice(dotIndex + 1).toLowerCase();
}

export function inferMimeOrExt(file: File): { mime: string; ext: string } {
  return {
    mime: (file?.type ?? "").toLowerCase().trim(),
    ext: getFileExtension(file?.name ?? ""),
  };
}

export function fileTypeForDb(file: File): DocumentFileType {
  const { mime, ext } = inferMimeOrExt(file);

  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (WORD_MIME_TYPES.has(mime) || WORD_EXTENSIONS.has(ext)) return "word";
  if (EXCEL_MIME_TYPES.has(mime) || EXCEL_EXTENSIONS.has(ext)) return "excel";
  if (IMAGE_MIME_TYPES.has(mime) || IMAGE_EXTENSIONS.has(ext)) return "image";

  return "other";
}

export function debugFileTypeMapping(file: File): void {
  if (!import.meta.env.DEV) return;
  const { mime, ext } = inferMimeOrExt(file);
  // Dev-only log to validate mapper output without exposing in production builds.
  console.debug("[documents] fileTypeForDb mapping", {
    filename: file.name,
    mime,
    ext,
    mappedType: fileTypeForDb(file),
  });
}


export function runFileTypeRuntimeChecks(): void {
  if (!import.meta.env.DEV) return;

  const fixtures = [
    { file: { name: "sample.pdf", type: "application/pdf" } as File, expected: "pdf" as const },
    { file: { name: "sample.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" } as File, expected: "word" as const },
    { file: { name: "sample.xlsx", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } as File, expected: "excel" as const },
    { file: { name: "sample.png", type: "image/png" } as File, expected: "image" as const },
  ];

  const hasMismatch = fixtures.some(({ file, expected }) => fileTypeForDb(file) !== expected);
  if (hasMismatch) {
    console.warn("[documents] fileTypeForDb runtime check detected unexpected mapping");
  }
}
