import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// 靜態檔案目錄指向 frontend 根目錄
app.use(express.static(__dirname));

// fallback：任何路徑都回傳 register.html，支援直接輸入網址
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "register.html"));
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Frontend running on ${port}`));
