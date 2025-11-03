import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { startSolitaireServer } from "./solitaireServer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = http.createServer(app);

app.use(express.static(path.join(__dirname, "../public")));

startSolitaireServer(server);

server.listen(8080, () => console.log("Server running on port 8080"));
