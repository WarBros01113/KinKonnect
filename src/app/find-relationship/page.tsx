
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { useAuth } from '@/providers/AuthProvider';
import { getUserProfile, getFamilyMembers } from '@/lib/firebase/firestore';
import type { BasicPerson, FindPathResult, RelationshipPathStep, AiRelationshipPathStep } from '@/types';
import { findRelationshipPath } from '@/lib/relationshipPathfinder';
import { describeRelationship } from '@/ai/flows/describe-relationship-flow'; // Assuming this export
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Users, GitCompareArrows, AlertTriangle, Waypoints } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

function FindRelationshipPageContent() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [allPeople, setAllPeople] = useState<BasicPerson[]>([]);
  const [person1Id, setPerson1Id] = useState<string>('');
  const [person2Id, setPerson2Id] = useState<string>('');

  const [loadingData, setLoadingData] = useState(true);
  const [findingPath, setFindingPath] = useState(false);
  const [describingRelationship, setDescribingRelationship] = useState(false);

  const [pathResult, setPathResult] = useState<FindPathResult | null>(null);
  const [relationshipDescription, setRelationshipDescription] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      if (user) {
        setLoadingData(true);
        try {
          const profile = await getUserProfile(user.uid);
          const family = await getFamilyMembers(user.uid);
          const combinedPeople: BasicPerson[] = [];
          if (profile) combinedPeople.push(profile);
          // Filter out alternate profiles from family members
          combinedPeople.push(...family.filter(fm => !fm.isAlternateProfile));
          
          // Sort by name for dropdown display
          combinedPeople.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          setAllPeople(combinedPeople);

        } catch (err) {
          console.error("Error fetching data for relationship finder:", err);
          toast({ title: "Error", description: "Could not load family data.", variant: "destructive" });
          setError("Could not load family data. Please try again.");
        } finally {
          setLoadingData(false);
        }
      }
    }
    fetchData();
  }, [user, toast]);

  const handleFindRelationship = async () => {
    if (!person1Id || !person2Id) {
      toast({ title: "Selection Missing", description: "Please select both Person 1 and Person 2.", variant: "destructive" });
      return;
    }
    if (person1Id === person2Id) {
      toast({ title: "Same Person Selected", description: "Please select two different people.", variant: "destructive" });
      return;
    }

    setFindingPath(true);
    setDescribingRelationship(false);
    setPathResult(null);
    setRelationshipDescription(null);
    setError(null);

    try {
      const result = findRelationshipPath(person1Id, person2Id, allPeople);
      setPathResult(result);

      if (result.pathFound && result.path.length > 0) {
        setDescribingRelationship(true);
        // Prepare path for AI
        const aiPathInput: AiRelationshipPathStep[] = result.path.map(step => ({
            personName: step.personName,
            connectionToPreviousPerson: step.connectionToPrevious,
        }));
        
        const person1 = allPeople.find(p => p.id === person1Id);
        const person2 = allPeople.find(p => p.id === person2Id);

        if (person1 && person2) {
            const aiResponse = await describeRelationship({
                person1Name: person1.name || 'Person 1',
                person2Name: person2.name || 'Person 2',
                path: aiPathInput,
            });
            setRelationshipDescription(aiResponse.relationshipName + (aiResponse.explanation ? ` (${aiResponse.explanation})` : ''));
        } else {
             setRelationshipDescription("Could not determine names for AI description.");
        }

      } else {
        toast({ title: "No Path Found", description: "No relationship path could be found between the selected members within your tree." });
      }
    } catch (err: any) {
      console.error("Error finding relationship:", err);
      toast({ title: "Error", description: err.message || "An unexpected error occurred.", variant: "destructive" });
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setFindingPath(false);
      setDescribingRelationship(false);
    }
  };

  const sortedPeopleForDropdown = useMemo(() => {
    return allPeople.sort((a, b) => (a.name || 'Unnamed').localeCompare(b.name || 'Unnamed'));
  }, [allPeople]);

  if (loadingData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)] p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading family members...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <Card className="max-w-2xl mx-auto shadow-xl">
        <CardHeader>
          <CardTitle className="text-3xl font-headline flex items-center">
            <GitCompareArrows className="mr-3 h-8 w-8 text-primary" /> Find Relationship
          </CardTitle>
          <CardDescription>
            Select two members from your family tree to discover their relationship.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label htmlFor="person1" className="font-medium">Person 1 (Start)</label>
              <Select value={person1Id} onValueChange={setPerson1Id}>
                <SelectTrigger id="person1"><SelectValue placeholder="Select Person 1" /></SelectTrigger>
                <SelectContent>
                  {sortedPeopleForDropdown.map(p => (
                    <SelectItem key={p.id} value={p.id} disabled={p.id === person2Id}>
                      {p.name || `ID: ${p.id.substring(0,6)}...`} (DOB: {p.dob || 'N/A'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label htmlFor="person2" className="font-medium">Person 2 (Target)</label>
              <Select value={person2Id} onValueChange={setPerson2Id}>
                <SelectTrigger id="person2"><SelectValue placeholder="Select Person 2" /></SelectTrigger>
                <SelectContent>
                  {sortedPeopleForDropdown.map(p => (
                    <SelectItem key={p.id} value={p.id} disabled={p.id === person1Id}>
                      {p.name || `ID: ${p.id.substring(0,6)}...`} (DOB: {p.dob || 'N/A'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleFindRelationship} className="w-full py-3 text-lg" disabled={findingPath || describingRelationship || !person1Id || !person2Id}>
            {(findingPath || describingRelationship) && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
            Find Relationship
          </Button>

          {error && (
            <div className="p-4 bg-destructive/10 border border-destructive text-destructive rounded-md flex items-start">
              <AlertTriangle className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-semibold">Error</h4>
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}

          {pathResult && (
            <div className="mt-6 space-y-4 p-4 border rounded-lg bg-muted/20">
              <h3 className="text-xl font-semibold flex items-center">
                <Waypoints className="mr-2 h-6 w-6 text-accent" />
                Relationship Path
              </h3>
              {pathResult.pathFound && pathResult.path.length > 0 ? (
                <>
                  <ul className="space-y-1 list-inside pl-1">
                    {pathResult.path.map((step, index) => (
                      <li key={index} className="text-sm">
                        <span className="font-semibold text-primary">{step.personName}</span>
                        {index > 0 && <span className="text-muted-foreground ml-1 text-xs">({step.connectionToPrevious})</span>}
                        {index === 0 && <span className="text-muted-foreground ml-1 text-xs">(Starting Point)</span>}
                         <span className="text-muted-foreground/70 text-xs ml-2">[Gen: {step.generationRelativeToStart}]</span>
                      </li>
                    ))}
                  </ul>
                  {pathResult.generationGap !== undefined && (
                    <p className="text-sm font-medium">
                      Generation Gap: {pathResult.generationGap}
                      {pathResult.generationGap === 0 ? " (Same Generation)" : pathResult.generationGap > 0 ? " (Descendant)" : " (Ancestor)"}
                    </p>
                  )}
                  {describingRelationship && (
                     <div className="pt-2 text-center"><Loader2 className="h-6 w-6 animate-spin text-primary inline-block" /> <span className="ml-2">Describing relationship...</span></div>
                  )}
                  {relationshipDescription && !describingRelationship && (
                    <div className="mt-4 p-3 bg-primary/10 border border-primary/50 rounded-md">
                        <p className="text-lg font-semibold text-primary">
                           {allPeople.find(p => p.id === person2Id)?.name || 'Person 2'} is the {relationshipDescription} of {allPeople.find(p => p.id === person1Id)?.name || 'Person 1'}.
                        </p>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">No direct relationship path found within your currently saved family tree data.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function FindRelationshipPage() {
  return (
    <AuthGuard>
      <FindRelationshipPageContent />
    </AuthGuard>
  );
}
