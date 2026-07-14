import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: undefined,
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
