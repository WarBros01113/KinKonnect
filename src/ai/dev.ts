
import { config } from 'dotenv';
config();

// import '@/ai/flows/suggest-relationships.ts'; // No longer used for the primary AI tool
// import '@/ai/flows/find-external-connections.ts'; // Replaced by the new discovery page functionality with backend scan
// import '@/ai/flows/discover-family-trees.ts'; // This AI flow is no longer directly used by the UI, replaced by deterministic scan
import '@/ai/flows/describe-relationship-flow.ts';
    
