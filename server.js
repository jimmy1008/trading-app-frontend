import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

app.get("/:page", (req, res) => {
  const filePath = path.join(__dirname, req.params.page);
  res.sendFile(filePath, err => {
    if (err) res.status(404).send("Not found");
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("Frontend running on port", PORT);
});
