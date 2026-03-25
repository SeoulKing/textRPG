import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function parseEnvValue(raw: string) {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadEnvFile(filePath: string, options?: { override?: boolean }) {
  if (!existsSync(filePath)) {
    return;
  }

  const override = options?.override ?? false;
  const content = readFileSync(filePath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || (!override && process.env[key] !== undefined)) {
      return;
    }

    const value = parseEnvValue(trimmed.slice(separatorIndex + 1));
    process.env[key] = value;
  });
}

const projectRoot = path.resolve(__dirname, "..");

loadEnvFile(path.join(projectRoot, ".env"));
loadEnvFile(path.join(projectRoot, ".env.local"), { override: true });
