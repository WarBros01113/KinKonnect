
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { BasicPerson } from "@/types";
import { Timestamp } from 'firebase/firestore';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function calculateAge(dob: string | Date | undefined | null): number | null {
  if (dob === "N/A" || !dob) {
    return null;
  }
  try {
    const birthDate = new Date(dob);
    if (isNaN(birthDate.getTime())) {
      console.warn(`Invalid DOB format encountered in calculateAge: ${dob}`);
      return null;
    }
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDifference = today.getMonth() - birthDate.getMonth();
    if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age < 0 ? 0 : age;
  } catch (error: any) {
    console.error(`Error calculating age for DOB: ${dob}`, {errorMessage: error.message});
    return null;
  }
}

// Helper to convert file to data URI
export const fileToDataUri = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * Sorts an array of BasicPerson objects.
 * The sorting order is:
 * 1. Date of Birth (dob): Eldest first (earlier date). "N/A" or invalid dates are treated as "youngest" or least prioritized for DOB.
 * 2. Sibling Order Index (siblingOrderIndex): Smaller index means older/earlier. Undefined index is treated as "last".
 * 3. Creation Timestamp (createdAt): Earlier timestamp means older/created earlier. Null timestamp is treated as "last".
 * 4. Name (alphabetical): Tie-breaker.
 * @param people Array of people to sort.
 * @param ascending If true, sorts "older" to "younger" (earlier index, earlier date, earlier timestamp).
 *                  If false, sorts "younger" to "older".
 * @returns A new sorted array.
 */
export function sortPeopleByAge<T extends BasicPerson>(people: T[], ascending: boolean = true): T[] {
  return [...people].sort((a, b) => {
    const factor = ascending ? 1 : -1;

    // --- 1. Compare by Date of Birth (dob) ---
    const dateA = a.dob && a.dob !== "N/A" ? new Date(a.dob) : null;
    const dateB = b.dob && b.dob !== "N/A" ? new Date(b.dob) : null;
    const isValidDateA = dateA && !isNaN(dateA.getTime());
    const isValidDateB = dateB && !isNaN(dateB.getTime());

    if (isValidDateA && isValidDateB) {
      const dobComparison = dateA.getTime() - dateB.getTime(); // Earliest date first
      if (dobComparison !== 0) return dobComparison * factor;
    } else if (isValidDateA) { // A has valid DOB, B does not. A comes first.
      return -1 * factor;
    } else if (isValidDateB) { // B has valid DOB, A does not. B comes first.
      return 1 * factor;
    }
    // If DOB is inconclusive, proceed to Sibling Order Index.

    // --- 2. Compare by Sibling Order Index (siblingOrderIndex) ---
    const orderA = a.siblingOrderIndex;
    const orderB = b.siblingOrderIndex;
    const hasOrderA = typeof orderA === 'number';
    const hasOrderB = typeof orderB === 'number';

    if (hasOrderA && hasOrderB) {
      const orderComparison = orderA - orderB; // Smaller index first
      if (orderComparison !== 0) return orderComparison * factor;
    } else if (hasOrderA) { // A has index, B does not. A comes first.
      return -1 * factor;
    } else if (hasOrderB) { // B has index, A does not. B comes first.
      return 1 * factor;
    }
    // If siblingOrderIndex is inconclusive, proceed to createdAt.

    // --- 3. Compare by Creation Timestamp (createdAt) ---
    let tsA_ms: number | null = null;
    if (a.createdAt) {
        if (a.createdAt instanceof Timestamp) tsA_ms = a.createdAt.toMillis();
        // @ts-ignore 
        else if (typeof (a.createdAt as any).toDate === 'function') tsA_ms = (a.createdAt as any).toDate().getTime();
        // @ts-ignore 
        else if (typeof (a.createdAt as any).seconds === 'number') tsA_ms = new Timestamp((a.createdAt as any).seconds, (a.createdAt as any).nanoseconds || 0).toMillis();
    }

    let tsB_ms: number | null = null;
    if (b.createdAt) {
        if (b.createdAt instanceof Timestamp) tsB_ms = b.createdAt.toMillis();
        // @ts-ignore
        else if (typeof (b.createdAt as any).toDate === 'function') tsB_ms = (b.createdAt as any).toDate().getTime();
        // @ts-ignore
        else if (typeof (b.createdAt as any).seconds === 'number') tsB_ms = new Timestamp((b.createdAt as any).seconds, (b.createdAt as any).nanoseconds || 0).toMillis();
    }
    
    const hasTsA = tsA_ms !== null;
    const hasTsB = tsB_ms !== null;

    if (hasTsA && hasTsB) {
      const tsComparison = tsA_ms! - tsB_ms!; // Earliest timestamp first
      if (tsComparison !== 0) return tsComparison * factor;
    } else if (hasTsA) { // A has timestamp, B does not. A comes first.
      return -1 * factor;
    } else if (hasTsB) { // B has timestamp, A does not. B comes first.
      return 1 * factor;
    }
    // If createdAt is inconclusive, proceed to name.

    // --- 4. Compare by Name (alphabetical) as a final tie-breaker ---
    const nameA = a.name?.toLowerCase() || '';
    const nameB = b.name?.toLowerCase() || '';
    return nameA.localeCompare(nameB);
  });
}

export function getOrdinal(n: number): string {
  if (n <= 0) return String(n); // Or handle as an error/special case
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
