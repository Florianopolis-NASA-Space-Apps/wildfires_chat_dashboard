const fs = require("fs");
const path = require("path");

function ensureSqlWasm({
  projectRoot,
  sourceRelativePath = path.join("node_modules", "sql.js", "dist", "sql-wasm.wasm"),
  targetRelativePath = path.join("public", "sql-wasm.wasm"),
}) {
  const sourcePath = path.join(projectRoot, sourceRelativePath);
  const targetPath = path.join(projectRoot, targetRelativePath);
  const targetDirectory = path.dirname(targetPath);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing SQL.js wasm source file: ${sourcePath}`);
  }

  fs.mkdirSync(targetDirectory, { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function run() {
  const projectRoot = path.resolve(__dirname, "..");
  ensureSqlWasm({ projectRoot });
  console.log("Ensured public/sql-wasm.wasm");
}

try {
  run();
} catch (error) {
  console.error("Failed to ensure sql-wasm.wasm:", error);
  process.exit(1);
}
