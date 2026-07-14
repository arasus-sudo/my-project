import "dotenv/config";
import { buildApp } from "./app";

const app = buildApp();
const port = Number(process.env.PORT) || 8001;

app
  .listen({ port, host: "127.0.0.1" })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
