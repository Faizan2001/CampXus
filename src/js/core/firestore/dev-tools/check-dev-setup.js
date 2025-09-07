/**
 * Development Environment Checker
 *
 * This script validates that your development environment is properly configured
 * and provides helpful feedback about your Firebase setup.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function checkEnvironmentSetup() {
  console.log("🔍 Checking MeetchuThere development environment...\n");

  const checks = [];

  // Check .env.local file
  const envPath = path.join(__dirname, "..", ".env.local");
  if (fs.existsSync(envPath)) {
    checks.push({ name: ".env.local file", status: "✅", message: "Found" });

    // Check if it has Firebase config
    const envContent = fs.readFileSync(envPath, "utf8");
    const hasFirebaseVars =
      envContent.includes("FIREBASE_API_KEY") &&
      envContent.includes("FIREBASE_PROJECT_ID");

    if (hasFirebaseVars) {
      checks.push({
        name: "Firebase environment variables",
        status: "✅",
        message: "Configured",
      });
    } else {
      checks.push({
        name: "Firebase environment variables",
        status: "❌",
        message: "Missing Firebase config in .env.local",
      });
    }
  } else {
    checks.push({
      name: ".env.local file",
      status: "❌",
      message: "Not found - create this file with your Firebase config",
    });
  }

  // Check generated config
  const configPath = path.join(__dirname, "firebase", "env-config.js");
  if (fs.existsSync(configPath)) {
    checks.push({
      name: "Generated environment config",
      status: "✅",
      message: "Ready for browser",
    });
  } else {
    checks.push({
      name: "Generated environment config",
      status: "⚠️",
      message: 'Run "npm run dev:config" to generate',
    });
  }

  // Check package.json scripts
  const packagePath = path.join(__dirname, "..", "package.json");
  if (fs.existsSync(packagePath)) {
    const packageContent = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    if (packageContent.scripts && packageContent.scripts["dev:config"]) {
      checks.push({
        name: "Development scripts",
        status: "✅",
        message: "Available",
      });
    } else {
      checks.push({
        name: "Development scripts",
        status: "❌",
        message: "Missing dev:config script",
      });
    }
  }

  // Check Firebase dependencies
  const nodeModulesPath = path.join(
    __dirname,
    "..",
    "node_modules",
    "firebase"
  );
  if (fs.existsSync(nodeModulesPath)) {
    checks.push({ name: "Firebase SDK", status: "✅", message: "Installed" });
  } else {
    checks.push({
      name: "Firebase SDK",
      status: "❌",
      message: 'Run "npm install" to install dependencies',
    });
  }

  // Display results
  console.log("📋 Environment Check Results:\n");
  checks.forEach((check) => {
    console.log(`${check.status} ${check.name}: ${check.message}`);
  });

  // Provide recommendations
  const failedChecks = checks.filter((check) => check.status === "❌");
  const warningChecks = checks.filter((check) => check.status === "⚠️");

  if (failedChecks.length === 0 && warningChecks.length === 0) {
    console.log("\n🎉 Your development environment is ready!");
    console.log("💡 You can start developing with: npm run dev:serve");
  } else {
    console.log("\n🔧 Action Required:");

    if (failedChecks.length > 0) {
      console.log("\n❌ Critical Issues:");
      failedChecks.forEach((check) => {
        console.log(`   • ${check.name}: ${check.message}`);
      });
    }

    if (warningChecks.length > 0) {
      console.log("\n⚠️ Warnings:");
      warningChecks.forEach((check) => {
        console.log(`   • ${check.name}: ${check.message}`);
      });
    }

    console.log("\n📖 See README.md for detailed setup instructions.");
  }
}

// Run the checker
checkEnvironmentSetup();
