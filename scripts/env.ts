import { config } from "dotenv";

// Load .env.local first (local Supabase), then .env as a fallback.
config({ path: ".env.local" });
config();
