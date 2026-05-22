import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const PORT = Number.parseInt(process.env.PORT || "8080", 10);
const MIME = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8"
};

const server = createServer(async (req, res) => {
  const path = req.url === "/" ? "frontend/index.html" : `frontend${req.url}`;
  try {
    const data = await readFile(path);
    const extension = path.split(".").pop();
    const contentType = MIME[extension] || "text/plain; charset=utf-8";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`Frontend on http://localhost:${PORT}`);
});
