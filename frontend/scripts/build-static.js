const fs = require("node:fs");
const path = require("node:path");

require("./generate-config");

const root = path.join(__dirname, "..");
const dist = path.join(root, "dist");

const entriesToCopy = [
  "index.html",
  "style.css",
  "script.js",
  "config.js",
  "admin",
  "assets",
  "booking",
  "doctors"
];

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const entry of entriesToCopy) {
  const source = path.join(root, entry);
  const target = path.join(dist, entry);

  fs.cpSync(source, target, { recursive: true });
}

console.log(`Generated static build in ${dist}`);
