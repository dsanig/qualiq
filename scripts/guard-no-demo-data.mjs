import { readFileSync } from "node:fs";

const targets = [
  "src/components/analytics/PredictiveAnalyticsView.tsx",
  "src/components/dashboard/DashboardView.tsx",
  "src/components/dashboard/ComplianceScore.tsx",
  "supabase/functions/analyze-capa-patterns/index.ts",
];

const bannedPatterns = [
  { regex: /export\s+const\s+demoData/i, reason: "export const demoData" },
  { regex: /\bmockData\b/i, reason: "mockData" },
  { regex: /\bfaker\b/i, reason: "faker" },
  { regex: /\|\|\s*demo/i, reason: "fallback con || demo" },
  { regex: /return\s+demo/i, reason: "return demo" },
  { regex: /\b(Demo|Test|Sample)\b.{0,40}\[/, reason: "array etiquetado como demo/test/sample" },
];

const violations = [];
for (const file of targets) {
  const content = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  for (const rule of bannedPatterns) {
    if (rule.regex.test(content)) {
      violations.push(`${file}: patrón prohibido detectado -> ${rule.reason}`);
    }
  }
}

if (violations.length > 0) {
  console.error("[guard-no-demo-data] Error: se detectaron patrones demo/mock en módulos críticos.");
  for (const violation of violations) {
    console.error(` - ${violation}`);
  }
  process.exit(1);
}

console.log("[guard-no-demo-data] OK: no se detectaron patrones demo/mock en módulos críticos.");
