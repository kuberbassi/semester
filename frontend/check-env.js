console.log("\n==================================");
console.log("🛠️  SEMESTER BUILD ENVIRONMENT CHECK");
console.log("==================================");

const clientId = process.env.VITE_GOOGLE_CLIENT_ID;

if (!clientId) {
  console.log("❌ VITE_GOOGLE_CLIENT_ID is MISSING from the build environment!");
  console.log("   -> Vite will compile the 'missing-client-id' fallback.");
  console.log("   -> Please check your Vercel Project Settings > Environment Variables.");
} else {
  console.log(`✅ VITE_GOOGLE_CLIENT_ID is SET! (Length: ${clientId.length})`);
  console.log("   -> Vite will successfully compile the Google Login.");
}
console.log("==================================\n");
