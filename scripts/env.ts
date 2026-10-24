import { config } from "dotenv";

// Load .env.local first, then .env as a fallback.
config({ path: ".env.local" });
config();
