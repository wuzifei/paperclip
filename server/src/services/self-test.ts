import fs from "fs/promises";
import path from "path";
import { assembleMemoryContext } from "./memory-injector.js";
import { getNotificationChannel } from "./notification-channels.js";

async function run() {
  console.log("==========================================");
  console.log("Starting Auto Self-Test...");
  console.log("==========================================\n");

  // 1. Test Memory Injector
  console.log("▶ Testing Memory Injector (assembleMemoryContext)...");
  const tempMemoryDir = path.join(process.cwd(), ".paperclip_test_memory");

  try {
    await fs.mkdir(path.join(tempMemoryDir, "agents", "test-agent"), { recursive: true });
    await fs.mkdir(path.join(tempMemoryDir, "tickets"), { recursive: true });

    await fs.writeFile(path.join(tempMemoryDir, "project_global.md"), "Project global rule");
    await fs.writeFile(path.join(tempMemoryDir, "agents", "test-agent", "rules.md"), "Agent specific rule");
    await fs.writeFile(path.join(tempMemoryDir, "tickets", "ISSUE-123.md"), "Ticket context");

    const ctx = await assembleMemoryContext("test-agent", "ISSUE-123", tempMemoryDir);
    console.log("Loaded Memory Layers:", ctx.layers);

    let passMemory = true;
    if (!ctx.text.includes("Project global rule")) passMemory = false;
    if (!ctx.text.includes("Agent specific rule")) passMemory = false;
    if (!ctx.text.includes("Ticket context")) passMemory = false;

    if (passMemory) {
      console.log("✅ Memory Injector Test Passed!");
    } else {
      console.error("❌ Memory Injector Test Failed! Rendered text:\n", ctx.text);
    }
  } finally {
    await fs.rm(tempMemoryDir, { recursive: true, force: true });
  }

  // 2. Test Notification Channels
  console.log("\n▶ Testing Notification Channels Registration...");
  const feishu = getNotificationChannel("feishu");
  const openclaw = getNotificationChannel("openclaw");
  const generic = getNotificationChannel("generic");

  if (feishu?.type === "feishu" && openclaw?.type === "openclaw" && generic?.type === "generic") {
    console.log("✅ All Notification Channels Registered Successfully!");
  } else {
    console.error("❌ Notification Channels missing or incorrect type!");
  }

  console.log("\n==========================================");
  console.log("Auto Self-Test Completed!");
  console.log("==========================================");
}

run().catch(err => {
  console.error("Test failed with exception:", err);
  process.exit(1);
});
