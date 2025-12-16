import * as esbuild from "esbuild";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

async function build() {
  const buildDir = path.join(rootDir, "build");
  const addonDir = path.join(rootDir, "addon");

  // Clean and create build directory
  if (fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true });
  }
  fs.mkdirSync(buildDir, { recursive: true });

  // Create output directory for JS
  const outDir = path.join(buildDir, "content");
  fs.mkdirSync(outDir, { recursive: true });
  
  const tempOutFile = path.join(outDir, "zotero-add-items-from-text.temp.js");
  const finalOutFile = path.join(outDir, "zotero-add-items-from-text.js");

  // Bundle TypeScript
  console.log("Bundling TypeScript...");
  
  // Build the bundle to a temp file first
  await esbuild.build({
    entryPoints: [path.join(rootDir, "src", "index.ts")],
    bundle: true,
    outfile: tempOutFile,
    format: "iife",
    globalName: "__AddItemsFromTextBundle",
    platform: "browser",
    target: "firefox102",
    sourcemap: false,
    minify: false,
  });
  
  // Read the bundled code
  const bundledCode = fs.readFileSync(tempOutFile, 'utf8');
  
  // The bundle creates __AddItemsFromTextBundle, but we need to extract AddItemsFromText from it
  // and assign to the scope where loadSubScript runs (which is the bootstrap scope)
  const wrappedCode = `// Zotero Add Items from Text Plugin
// This file is loaded via Services.scriptloader.loadSubScript() in bootstrap.js
// Variables declared here become available in the bootstrap scope

${bundledCode}

// Make AddItemsFromText available in the bootstrap scope
var AddItemsFromText = __AddItemsFromTextBundle.AddItemsFromText || __AddItemsFromTextBundle;
`;
  
  // Write the final JS file
  fs.writeFileSync(finalOutFile, wrappedCode);
  
  // Remove temp file
  fs.unlinkSync(tempOutFile);

  // Copy addon files
  console.log("Copying addon files...");
  copyRecursive(addonDir, buildDir);

  // Create install.rdf for legacy compatibility (if needed)
  // Zotero 7 uses manifest.json, but some tools expect install.rdf

  console.log("Build complete!");
  console.log(`Output: ${buildDir}`);
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;

  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    for (const file of fs.readdirSync(src)) {
      copyRecursive(path.join(src, file), path.join(dest, file));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

build().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
