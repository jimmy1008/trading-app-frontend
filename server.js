import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.static(__dirname));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("Frontend running on port", PORT);
});

