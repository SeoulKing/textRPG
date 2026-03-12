import path from "node:path";
import { PostgresGameRepository } from "../game/postgres-repository";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL 환경변수가 필요합니다.");
  }

  const rootDir = path.resolve(__dirname, "..", "..");
  const repository = new PostgresGameRepository(databaseUrl, rootDir);
  await repository.init();
  console.log("Database schema initialized.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
