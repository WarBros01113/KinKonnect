
import { genkit as createGenkitInstance, Genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';

// Define a unique symbol to store the Genkit instance on the global object
const GENKIT_SYMBOL = Symbol.for('app.kinkonnect.genkit');

// Augment the NodeJS.Global interface to include our symbol
interface CustomGlobal extends NodeJS.Global {
  [GENKIT_SYMBOL]?: Genkit;
}
const customGlobal = global as CustomGlobal;

let ai: Genkit;

// Check for GOOGLE_GENAI_API_KEY
const googleApiKey = process.env.GOOGLE_GENAI_API_KEY;
if (!googleApiKey) {
  console.warn(
`[KinKonnect Genkit] WARNING: The GOOGLE_GENAI_API_KEY environment variable is not set.
The Google AI plugin (Genkit) will not be able to function correctly.
Please ensure this key is defined in your project's environment variables (e.g., in an .env file or through Firebase Studio's secret management if available).
You can get an API key from Google AI Studio: https://aistudio.google.com/app/apikey`
  );
}

const genkitPlugins = [googleAI()]; // googleAI() will use GOOGLE_GENAI_API_KEY from env

if (process.env.NODE_ENV === 'production') {
  // In production, always create a new instance
  ai = createGenkitInstance({
    plugins: genkitPlugins,
    model: 'googleai/gemini-2.0-flash',
  });
} else {
  // In development, try to reuse an existing instance from the global object
  // This helps prevent re-initialization issues with HMR
  if (!customGlobal[GENKIT_SYMBOL]) {
    console.log('[KinKonnect Genkit] Initializing new Genkit instance for development mode...');
    customGlobal[GENKIT_SYMBOL] = createGenkitInstance({
      plugins: genkitPlugins,
      model: 'googleai/gemini-2.0-flash',
    });
  } else {
    console.log('[KinKonnect Genkit] Re-using existing Genkit instance from global for development mode.');
  }
  ai = customGlobal[GENKIT_SYMBOL]!;
}

export { ai };
