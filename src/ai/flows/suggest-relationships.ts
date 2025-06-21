
'use server';

/**
 * @fileOverview Suggests potential family relationships based on existing family tree data.
 * THIS FILE IS NO LONGER ACTIVELY USED BY THE AiTools COMPONENT.
 * It is replaced by find-external-connections.ts for the "Find External Connections" feature.
 *
 * - suggestRelationships - A function that suggests potential family relationships.
 * - SuggestRelationshipsInput - The input type for the suggestRelationships function.
 * - SuggestRelationshipsOutput - The return type for the suggestRelationships function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const FamilyMemberSchema = z.object({
  name: z.string().describe('Name of the family member'),
  relationship: z.string().describe('Relationship to the user (e.g., mother, father, sibling)'),
  dob: z.string().describe('Date of birth of the family member (YYYY-MM-DD or "N/A")'),
  isDeceased: z.boolean().optional().describe('Whether the family member is deceased.'),
  bornPlace: z.string().optional().describe('Place of birth.'),
  currentPlace: z.string().optional().describe('Current place of residence.'),
  religion: z.string().optional().describe('Religion of the family member.'),
  caste: z.string().optional().describe('Caste of the family member.'),
});

const SuggestRelationshipsInputSchema = z.object({
  familyTree: z.array(FamilyMemberSchema).describe('Existing family tree data'),
});

export type SuggestRelationshipsInput = z.infer<typeof SuggestRelationshipsInputSchema>;

const SuggestionSchema = z.object({
  suggestedRelationship: z.string().describe('The suggested relationship (e.g., grandparent, grandchild, aunt, uncle, cousin)'),
  memberName: z.string().describe('Name of the potential family member'),
  reason: z.string().describe('Reasoning behind the relationship suggestion based on the provided family tree. Consider if members are deceased when suggesting relationships (e.g. less likely to suggest a new child for a deceased person).'),
});

const SuggestRelationshipsOutputSchema = z.array(SuggestionSchema);

export type SuggestRelationshipsOutput = z.infer<typeof SuggestRelationshipsOutputSchema>;

export async function suggestRelationships(input: SuggestRelationshipsInput): Promise<SuggestRelationshipsOutput> {
  return suggestRelationshipsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestRelationshipsPrompt',
  input: {schema: SuggestRelationshipsInputSchema},
  output: {schema: SuggestRelationshipsOutputSchema},
  prompt: `Given the following family tree data, suggest potential family relationships that might be missing WITHIN THIS TREE. Focus on suggesting grandparent, grandchild, aunt, uncle, and cousin relationships. Age differences (if DOB is available and not "N/A") and existing relationships are key to inferring potential missing connections. Consider if a person is deceased; it's less likely to suggest new children for them.

Family Tree:
{{#each familyTree}}
- Name: {{name}}, Relationship: {{relationship}}, DOB: {{dob}}{{#if isDeceased}}, Deceased: Yes{{/if}}{{#if bornPlace}}, Born: {{bornPlace}}{{/if}}{{#if currentPlace}}, Lives: {{currentPlace}}{{/if}}{{#if religion}}, Religion: {{religion}}{{/if}}{{#if caste}}, Caste: {{caste}}{{/if}}
{{/each}}

Explain your reasoning for each suggestion.

Output your response as a JSON array of objects, each containing 'suggestedRelationship', 'memberName', and 'reason' fields.
`,
});

const suggestRelationshipsFlow = ai.defineFlow(
  {
    name: 'suggestRelationshipsFlow',
    inputSchema: SuggestRelationshipsInputSchema,
    outputSchema: SuggestRelationshipsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);

