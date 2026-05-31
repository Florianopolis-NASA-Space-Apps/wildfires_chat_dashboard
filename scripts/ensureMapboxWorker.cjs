const fs = require("fs");
const path = require("path");

function ensureMapboxWorker({
  projectRoot,
  sourceRelativePath = path.join(
    "node_modules",
    "mapbox-gl",
    "dist",
    "mapbox-gl-csp-worker.js"
  ),
  targetRelativePath = path.join("public", "mapbox-gl-csp-worker.js"),
}) {
  const sourcePath = path.join(projectRoot, sourceRelativePath);
  const targetPath = path.join(projectRoot, targetRelativePath);
  const targetDirectory = path.dirname(targetPath);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing Mapbox worker source file: ${sourcePath}`);
  }

  fs.mkdirSync(targetDirectory, { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function run() {
  const projectRoot = path.resolve(__dirname, "..");
  ensureMapboxWorker({ projectRoot });
  console.log("Ensured public/mapbox-gl-csp-worker.js");
}

try {
  run();
} catch (error) {
  console.error("Failed to ensure mapbox-gl-csp-worker.js:", error);
  process.exit(1);
}
