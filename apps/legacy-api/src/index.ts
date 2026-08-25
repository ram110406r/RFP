import { app } from "./app";

const port = Number(process.env.PORT ?? 4000);
const hostname = process.env.HOST ?? "0.0.0.0";

app.listen({ port, hostname });

console.log(
  `RFP OS API listening on http://${app.server?.hostname ?? hostname}:${app.server?.port ?? port}`,
);
