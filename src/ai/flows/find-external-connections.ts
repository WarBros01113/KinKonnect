
'use server';

/**
 * @fileOverview A flow to simulate finding potential connections to hypothetical family trees of other users within the KinKonnect application.
 *
 * - findExternalConnections - A function that simulates searching for external family connections.
 * - FindExternalConnectionsInput - The input type for the findExternalConnections function.
 * - FindExternalConnectionsOutput - The return type for the findExternalConnections function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const FamilyMemberSchema = z.object({
  name: z.string().describe('Name of the family member.'),
  dob: z.string().describe('Date of birth of the family member (YYYY-MM-DD or "N/A").'),
  isDeceased: z.boolean().optional().describe('Whether the family member is deceased.'),
  relationship: z.string().describe('Relationship to the user (e.g., mother, father, sibling).'), // This is user-centric relationship
  bornPlace: z.string().optional().describe('Place of birth.'),
  currentPlace: z.string().optional().describe('Current place of residence.'),
  religion: z.string().optional().describe('Religion of the family member.'),
  caste: z.string().optional().describe('Caste of the family member.'),
});

const FindExternalConnectionsInputSchema = z.object({
  familyMembers: z.array(FamilyMemberSchema).describe('An array of key family member objects from the user\'s tree to use as search anchors.'),
});

export type FindExternalConnectionsInput = z.infer<typeof FindExternalConnectionsInputSchema>;

const MatchedPairSchema = z.object({
    userMemberName: z.string().describe("Name of the member from the current user's tree."),
    userMemberDob: z.string().optional().describe("DOB of the member from the current user's tree."),
    hypotheticalOtherMemberName: z.string().describe("Hypothesized name of the similar member in another KinKonnect user's tree."),
    hypotheticalOtherMemberDob: z.string().optional().describe("Hypothesized DOB of the similar member in another KinKonnect user's tree."),
    similarityPoints: z.array(z.string()).describe("Key points of similarity (e.g., 'Shared surname', 'Similar birth year', 'Same location').")
});

const PotentialTreeMatchSchema = z.object({
  hypotheticalOtherUserName: z.string().describe("A generic identifier for the hypothetical other KinKonnect user or tree (e.g., 'Tree from User K123', 'A family branch in Anytown')."),
  matchingStrength: z.string().describe("Description of the similarity strength (e.g., 'Strong similarity, 5 members', 'Partial overlap, 3 members')."),
  reasoning: z.string().describe("General explanation for why this hypothetical connection is suggested, based on patterns observed."),
  matchedPairs: z.array(MatchedPairSchema).describe("Array of member pairs that form the basis of this hypothetical tree match."),
});

const FindExternalConnectionsOutputSchema = z.array(PotentialTreeMatchSchema);

export type FindExternalConnectionsOutput = z.infer<typeof FindExternalConnectionsOutputSchema>;

export async function findExternalConnections(input: FindExternalConnectionsInput): Promise<FindExternalConnectionsOutput> {
  return findExternalConnectionsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'findExternalConnectionsPrompt',
  input: {schema: FindExternalConnectionsInputSchema},
  output: {schema: FindExternalConnectionsOutputSchema},
  prompt: `You are an advanced genealogical matching system AI within the KinKonnect application.
Your task is to analyze the provided user's family tree and identify *hypothetical other family trees stored by other KinKonnect users* that show significant similarities.
A significant similarity means finding a cluster of 4-5 individuals in a hypothetical other tree who appear to match individuals in the user's tree based on names (allowing for some variation), approximate ages/birth years (DOB), and key locations (birth or current place).

The current user has provided the following key individuals from their own family tree:
{{#each familyMembers}}
- Name: {{name}}, DOB: {{dob}}{{#if isDeceased}}, Deceased: Yes{{/if}}, Relationship to User: {{relationship}}{{#if bornPlace}}, Born: {{bornPlace}}{{/if}}{{#if currentPlace}}, Current Residence: {{currentPlace}}{{/if}}
{{/each}}

Your goal is to:
1. Examine the user's family members.
2. Generate 1-2 plausible scenarios of *hypothetical other KinKonnect users' trees* that might contain a cluster of 4-5 similar individuals.
3. For each hypothetical matching tree:
    - Provide a generic identifier for the other user/tree (e.g., "Tree from User AB123", "A Smith family branch from Springfield").
    - Describe the strength of the match (e.g., "Strong similarity, 5 members matched").
    - Offer a brief reasoning.
    - Detail the 'matchedPairs'. For each pair, specify the member from the user's tree and the *hypothesized similar member* you've imagined in the other tree, along with the specific reasons for their similarity (e.g., "Shared surname 'Jones'", "Birth years within 2 years", "Both born in 'Anytown'").
4. Make your generated scenarios sound plausible as if discovered within the KinKonnect ecosystem.
5. **Important**: You DO NOT have actual access to other users' data; you are generating these plausible scenarios. Do not invent wildly unrelated people. Focus on overlaps based on common genealogical patterns.
6. If the input tree is too small or lacks detail to make reasonable hypothetical matches, return an empty array or a single entry explaining that more data is needed from the user.

Output your response as a JSON array of objects matching the 'PotentialTreeMatchSchema'.
`,
});

const findExternalConnectionsFlow = ai.defineFlow(
  {
    name: 'findExternalConnectionsFlow',
    inputSchema: FindExternalConnectionsInputSchema,
    outputSchema: FindExternalConnectionsOutputSchema,
  },
  async input => {
    // Ensure at least a few members are present to make simulation meaningful
    if (input.familyMembers.length < 3) {
      return [{
        hypotheticalOtherUserName: "System Note",
        matchingStrength: "Insufficient Data",
        reasoning: "Please add more family members (at least 3) to your tree for the simulation to generate potential connections.",
        matchedPairs: []
      }];
    }
    const {output} = await prompt(input);
    return output!;
  }
);

