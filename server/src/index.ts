import { app } from "./app";

app.listen(Number(process.env.PORT ?? 4000));

console.log(`RFP OS API listening on http://localhost:${app.server?.port}`);
