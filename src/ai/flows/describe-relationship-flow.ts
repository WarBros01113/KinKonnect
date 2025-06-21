
'use server';
/**
 * @fileOverview An AI flow to describe the genealogical relationship between two people based on a path.
 *
 * - describeRelationship - A function that takes a path and returns a human-readable relationship name.
 * - DescribeRelationshipInput - The input type for the flow.
 * - DescribeRelationshipOutput - The output type for the flow.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import type { AiRelationshipPathStep } from '@/types';


// Define Zod schema for AiRelationshipPathStep as it's used in the input
const AiRelationshipPathStepSchema = z.object({
  personName: z.string().describe("Name of the person in this step of the path."),
  connectionToPreviousPerson: z.string().describe("Describes how this person is related to the *previous* person in the path. For the first person, this will be 'Self' or 'Starting Point'."),
});

const DescribeRelationshipInputSchema = z.object({
  person1Name: z.string().describe("Name of the starting person (Person 1)."),
  person2Name: z.string().describe("Name of the target person (Person 2)."),
  path: z.array(AiRelationshipPathStepSchema).min(1).describe("An array of steps detailing the path from Person 1 to Person 2. Each step includes a person's name and their connection to the previous person in the path."),
});

export type DescribeRelationshipInput = z.infer<typeof DescribeRelationshipInputSchema>;

const DescribeRelationshipOutputSchema = z.object({
  relationshipName: z.string().describe("The genealogical term for the relationship of Person 2 to Person 1 (e.g., 'Paternal Uncle', 'First Cousin Once Removed', 'Spouse's Mother', 'Self')."),
  explanation: z.string().optional().describe("A brief explanation of how the relationship was derived from the path, if helpful or if the term is complex."),
});

export type DescribeRelationshipOutput = z.infer<typeof DescribeRelationshipOutputSchema>;

export async function describeRelationship(input: DescribeRelationshipInput): Promise<DescribeRelationshipOutput> {
  if (input.path.length === 1 && input.person1Name === input.person2Name) {
    return { relationshipName: "Self (Same Person)" };
  }
  return describeRelationshipFlow(input);
}

const prompt = ai.definePrompt({
  name: 'describeRelationshipPrompt',
  input: {schema: DescribeRelationshipInputSchema},
  output: {schema: DescribeRelationshipOutputSchema},
  prompt: `You are a genealogy expert. Your task is to determine the genealogical relationship of Person 2 to Person 1, based on a given path.

Person 1: {{{person1Name}}}
Person 2: {{{person2Name}}}

Path from Person 1 to Person 2:
{{#each path}}
- {{personName}} ({{connectionToPreviousPerson}})
{{/each}}

The 'connectionToPreviousPerson' field for each step describes how that person is related to the person *immediately preceding them* in the list. The first person's connection is "Self" or "Starting Point".

Based on this path, what is the specific genealogical relationship of {{{person2Name}}} (Person 2) to {{{person1Name}}} (Person 1)?
Provide the common genealogical term. For example:
- If Person 2 is Person 1's father's brother, the relationshipName is "Paternal Uncle".
- If Person 2 is Person 1's mother's sister's son, the relationshipName is "Maternal First Cousin".
- If Person 2 is Person 1's wife's mother, the relationshipName is "Mother-in-law" or "Spouse's Mother".
- If Person 2 is Person 1's son's daughter, the relationshipName is "Granddaughter".
- If Person 2 is Person 1, the relationshipName is "Self".

If the path is simply Person 1 -> Person 2 (e.g. direct father, mother, son, daughter, spouse, sibling), use the direct term.
For spouse connections, use terms like "Spouse", "Husband", "Wife".
If a step says "is child of X (specifically, Y)" it means Y is a child of X.
If a step says "is father of X", it means the current person is the father of X.

Provide an optional brief explanation if the relationship term is complex or to clarify the derivation (e.g., "Person 2 is Person 1's mother's brother, hence Paternal Uncle." - Note: this example explanation is slightly flawed, it should be "maternal uncle").
Be precise with terms like "grand-uncle", "first cousin once removed", etc. if the path supports it.
Assume direct lineage unless specified otherwise (e.g., "step-father" would usually be explicit).
Prioritize common terms.

Output your response in the specified JSON format.
`,
});

const describeRelationshipFlow = ai.defineFlow(
  {
    name: 'describeRelationshipFlow',
    inputSchema: DescribeRelationshipInputSchema,
    outputSchema: DescribeRelationshipOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
