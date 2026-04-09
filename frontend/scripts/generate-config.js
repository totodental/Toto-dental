const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const outputPath = path.join(root, "config.js");

const rawApiBase = process.env.VITE_API_URL || "https://toto-dental.onrender.com/api";
const apiBase = rawApiBase.replace(/\/+$/, "") || "https://toto-dental.onrender.com/api";

const content = `window.__APP_CONFIG__ = ${JSON.stringify(
  {
    API_BASE: apiBase
  },
  null,
  2
)};
`;

fs.writeFileSync(outputPath, content, "utf8");
console.log(`Generated frontend/config.js with API_BASE=${apiBase}`);
