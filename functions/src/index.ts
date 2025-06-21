
'use server';

import {onCall, HttpsError} from "firebase-functions/v2/https";
import type { CallableRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { normalizePerson, areTreesSimilar, type ILogger } from "./utils";
import type {Profile, FamilyMember, ComparablePerson, MatchedTreeResult, MatchedIndividualPair, MatchedMemberInfo } from "./types";


if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();


function formatPersonDetails(person: ComparablePerson): string {
    const details: string[] = [];
    if (person.originalData.dob && person.originalData.dob !== "N/A") details.push(`DOB: ${new Date(person.originalData.dob).toLocaleDateString()}`);
    else if (person.originalData.dob === "N/A") details.push("DOB: N/A");

    details.push(person.originalData.isDeceased ? "Deceased" : "Alive");

    if (person.originalData.bornPlace) details.push(`Born: ${person.originalData.bornPlace}`); else details.push("Born: N/A");
    if (person.originalData.currentPlace) details.push(`Lives: ${person.originalData.currentPlace}`);
    if (person.originalData.religion) details.push(person.originalData.religion.charAt(0).toUpperCase() + person.originalData.religion.slice(1));
    if (person.originalData.caste) details.push(person.originalData.caste.charAt(0).toUpperCase() + person.originalData.caste.slice(1));

    const relationshipDisplay = person.relationshipToOwner || (!("userId" in person.originalData) ? "Self" : "N/A");


    if (relationshipDisplay !== "Self") {
        details.push(`Role: ${relationshipDisplay}`);
    }
    return details.join(", ");
}

function sanitizeComparablePersonToMatchedMemberInfo(cp: ComparablePerson): MatchedMemberInfo {
  const od = cp.originalData;
  return {
    id: cp.id,
    name: od.name || 'Unnamed', 
    aliasName: od.aliasName || null, 
    dob: od.dob,
    gender: od.gender,
    relationshipToTheirOwner: cp.relationshipToOwner,
    isDeceased: cp.isDeceased,
    bornPlace: od.bornPlace,
    currentPlace: od.currentPlace,
    religion: od.religion,
    caste: od.caste,
  };
}


export const findSimilarFamilyTrees = onCall(async (request: CallableRequest) => {
  if (!request.auth) {
    logger.warn("Unauthenticated call to findSimilarFamilyTrees", {
      origin: request.rawRequest.headers.origin,
      ip: request.rawRequest.ip,
    });
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }
  const callerUid = request.auth.uid;
  logger.info(`[Discovery] Function called by UID: ${callerUid}`, {structuredData: true});

  try {
    const callerProfileDoc = await db.collection("users").doc(callerUid).get();
    if (!callerProfileDoc.exists) {
      logger.warn(`[Discovery] Caller's profile not found. UID: ${callerUid}`);
      throw new HttpsError("not-found", "Caller's profile not found. Please complete your profile.");
    }
    const callerProfileData = callerProfileDoc.data() as Omit<Profile, "id">;
    const callerProfile = {id: callerProfileDoc.id, ...callerProfileData } as Profile;

    logger.info(`[Discovery] Caller ${callerUid} profile 'isPublic' value: ${callerProfile.isPublic} (type: ${typeof callerProfile.isPublic})`);
    if (callerProfile.isPublic === false) {
        logger.info(`[Discovery] Caller ${callerUid} is in Private Mode. Aborting scan.`);
        return { matches: [] };
    }

    const konnectionsSnapshot = await db.collection("users").doc(callerUid).collection("konnections").get();
    const alreadyKonnectedUserIds = new Set(konnectionsSnapshot.docs.map(doc => doc.id));
    logger.info(`[Discovery] Caller ${callerUid} has ${alreadyKonnectedUserIds.size} existing konnections. These users will be excluded.`);


    const callerPrimaryReligion = (callerProfile.religion || "").trim().toLowerCase();
    const callerPrimaryCaste = (callerProfile.caste || "").trim().toLowerCase();
    const applyReligionCastePrefilter = !!(callerPrimaryReligion && callerPrimaryCaste);

    logger.info(`[Discovery] Caller Profile (UID: ${callerUid}): Religion='${callerPrimaryReligion || "N/A"}', Caste='${callerPrimaryCaste || "N/A"}'.`);
    logger.info(`[Discovery] Religion/Caste Pre-filtering will be ${applyReligionCastePrefilter ? "ACTIVE" : "SKIPPED (caller's profile missing religion or caste, or both)"}.`);


    const callerFamilyMembersSnapshot = await db.collection("users").doc(callerUid).collection("familyMembers").get();
    const callerFamilyMembers = callerFamilyMembersSnapshot.docs.map((doc) => ({id: doc.id, ...doc.data()} as FamilyMember));
    const myRawTree: (Profile | FamilyMember)[] = [callerProfile, ...callerFamilyMembers];

    if (myRawTree.every((p) => !p.name)) {
        logger.info(`[Discovery] Caller's tree (UID: ${callerUid}) has no named individuals for comparison. Returning 0 matches.`);
        return {matches: []};
    }
    const myComparableTree: ComparablePerson[] = myRawTree.map((p) => normalizePerson(p, logger as unknown as ILogger));

    if (myComparableTree.length === 0) {
      logger.info(`[Discovery] Caller's comparable tree (UID: ${callerUid}) is empty. No comparison to make. Returning 0 matches.`);
      return {matches: []};
    }
    logger.info(`[Discovery] Caller's comparable tree (UID: ${callerUid}) has ${myComparableTree.length} members for comparison.`);
    myComparableTree.forEach(p => logger.debug(`  Caller Tree Member (First Name: ${p.name}, Alias: ${p.aliasName || 'N/A'}), DOB: ${p.dob}, Born: ${p.birthPlace}, Caste: ${p.caste}, Religion: ${p.religion}, Deceased: ${p.isDeceased}, Role: ${p.relationshipToOwner}`));


    const allUsersSnapshot = await db.collection("users").get();
    const otherUserIds = allUsersSnapshot.docs
      .map((doc) => doc.id)
      .filter((id) => id !== callerUid && !alreadyKonnectedUserIds.has(id)); 

    logger.info(`[Discovery] Found ${otherUserIds.length} other user(s) to potentially compare with (after excluding self & konnections, before other pre-filtering).`);
    const matches: MatchedTreeResult[] = [];
    let preFilteredOutCount = 0;
    let usersConsideredAfterPreFilter = 0;
    let privateUsersSkippedCount = 0;

    for (const otherUserId of otherUserIds) {
      logger.info(`[DiscoveryLoop] Processing potential comparison with other user: ${otherUserId}.`);
      const otherUserProfileDoc = await db.collection("users").doc(otherUserId).get();
      if (!otherUserProfileDoc.exists) {
        logger.warn(`[DiscoveryLoop] Profile not found for other user ID (skipped evaluation): ${otherUserId}.`);
        continue;
      }
      const otherUserProfileData = otherUserProfileDoc.data() as Omit<Profile, "id">;
      const otherUserProfile = {id: otherUserProfileDoc.id, ...otherUserProfileData} as Profile;

      logger.info(`[DiscoveryLoop] Evaluating user ${otherUserId} for discovery. Profile 'isPublic' value: ${otherUserProfile.isPublic} (type: ${typeof otherUserProfile.isPublic})`);
      if (otherUserProfile.isPublic === false) { 
        privateUsersSkippedCount++;
        logger.info(`[DiscoveryLoop] SKIPPED user ${otherUserId} because their profile is private (isPublic is explicitly false).`);
        continue;
      } else {
        logger.info(`[DiscoveryLoop] User ${otherUserId} is NOT strictly private (isPublic value is '${otherUserProfile.isPublic}', type: '${typeof otherUserProfile.isPublic}'). Proceeding with evaluation for matching.`);
      }


      if (applyReligionCastePrefilter) {
        const otherUserReligion = (otherUserProfile.religion || "").trim().toLowerCase();
        const otherUserCaste = (otherUserProfile.caste || "").trim().toLowerCase();

        if (otherUserReligion !== callerPrimaryReligion || otherUserCaste !== callerPrimaryCaste) {
          preFilteredOutCount++;
          logger.info(`[DiscoveryLoop] SKIPPED user ${otherUserId} due to pre-filter mismatch. Caller (R:'${callerPrimaryReligion}', C:'${callerPrimaryCaste}') vs Other (R:'${otherUserReligion || "N/A"}', C:'${otherUserCaste || "N/A"}').`);
          continue;
        }
        logger.info(`[DiscoveryLoop] User ${otherUserId} PASSED pre-filter (Religion & Caste match with caller). Proceeding to full tree comparison.`);
      } else {
         logger.info(`[DiscoveryLoop] Pre-filtering by religion/caste SKIPPED for user ${otherUserId} because caller's profile lacks religion/caste (or both). Proceeding to full tree comparison.`);
      }

      usersConsideredAfterPreFilter++;

      const otherFamilyMembersSnapshot = await db.collection("users").doc(otherUserId).collection("familyMembers").get();
      const otherFamilyMembers = otherFamilyMembersSnapshot.docs.map((doc) => ({id: doc.id, ...doc.data()} as FamilyMember));
      const otherRawTree: (Profile | FamilyMember)[] = [otherUserProfile, ...otherFamilyMembers];

      if (otherRawTree.every((p) => !p.name)) {
        logger.info(`[DiscoveryLoop] Other user ${otherUserId}'s tree has no named individuals. Skipping full comparison.`);
        continue;
      }
      const otherComparableTree: ComparablePerson[] = otherRawTree.map((p) => normalizePerson(p, logger as unknown as ILogger));

      if (otherComparableTree.length === 0) {
        logger.info(`[DiscoveryLoop] Other user ${otherUserId}'s comparable tree is empty. Skipping full comparison.`);
        continue;
      }
      logger.info(`[DiscoveryLoop] Comparing caller's tree (${myComparableTree.length} members) with ${otherUserId}'s tree (${otherComparableTree.length} members).`);
      otherComparableTree.forEach(p => logger.debug(`  Other User (${otherUserId}) Tree Member (First Name: ${p.name}, Alias: ${p.aliasName || 'N/A'}), DOB: ${p.dob}, Born: ${p.birthPlace}, Caste: ${p.caste}, Religion: ${p.religion}, Deceased: ${p.isDeceased}, Role: ${p.relationshipToOwner}`));


      const {isSimilar, score, contributingPairs} = areTreesSimilar(myComparableTree, otherComparableTree, logger as unknown as ILogger);

      logger.info(`[DiscoveryLoop] Result of areTreesSimilar for ${otherUserId}: isSimilar=${isSimilar}, score=${score.toFixed(1)}, contributingPairs=${contributingPairs.length}.`);

      if (isSimilar) {
        logger.info(`[DiscoveryLoop] MATCH FOUND with user ${otherUserId}, score: ${score.toFixed(1)}. Number of contributing pairs: ${contributingPairs.length}.`);

        const detailedPairs: MatchedIndividualPair[] = contributingPairs.map(pair => ({
            person1Id: pair.person1.id,
            person1Name: pair.person1.originalData.name || "Unnamed", 
            person1Details: formatPersonDetails(pair.person1),
            person2Id: pair.person2.id,
            person2Name: pair.person2.originalData.name || "Unnamed", 
            person2Details: formatPersonDetails(pair.person2),
            pairScore: pair.pairScore,
            matchReasons: pair.reasons,
        }));

        const myMatchedPersonsList: MatchedMemberInfo[] = contributingPairs.map(pair => sanitizeComparablePersonToMatchedMemberInfo(pair.person1));
        const otherMatchedPersonsList: MatchedMemberInfo[] = contributingPairs.map(pair => sanitizeComparablePersonToMatchedMemberInfo(pair.person2));

        matches.push({
          matchedUserId: otherUserId,
          matchedUserName: otherUserProfile.name || otherUserProfile.email || "Unnamed User",
          score: parseFloat(score.toFixed(1)),
          totalMembersInTree: otherFamilyMembers.length + 1,
          detailedContributingPairs: detailedPairs,
          myMatchedPersons: myMatchedPersonsList,
          otherMatchedPersons: otherMatchedPersonsList,
        });
      }
    }

    logger.info(`[Discovery] Scan complete for UID: ${callerUid}. Konnections excluded: ${alreadyKonnectedUserIds.size}. Pre-filtered out (R/C): ${preFilteredOutCount}. Private users skipped: ${privateUsersSkippedCount}. Users considered after pre-filter: ${usersConsideredAfterPreFilter}. Total matches found: ${matches.length}.`);
    if (matches.length === 0) {
        logger.info(`[Discovery] No matches found after processing all users for UID: ${callerUid}.`);
    } else {
        matches.forEach(match => {
            logger.info(`  [Final Match Details to be returned] Matched with ${match.matchedUserName} (ID: ${match.matchedUserId}), Score: ${match.score}, Pairs: ${match.detailedContributingPairs.length}, MyPersons: ${match.myMatchedPersons.length}, OtherPersons: ${match.otherMatchedPersons.length}`);
        });
    }
    return {matches};
  } catch (error: any) {
    logger.error("[Discovery] CRITICAL error in findSimilarFamilyTrees Cloud Function:", {
      userId: callerUid,
      errorMessage: error.message,
      errorStack: error.stack,
      errorCode: error.code,
      errorDetails: error.details,
      fullErrorObject: JSON.stringify(error, Object.getOwnPropertyNames(error)),
    });
    if (error instanceof HttpsError) {
      throw error;
    }
    const originalMessage = typeof error.message === "string" ? error.message : "Details in function logs.";

    if (error.code === "DEADLINE_EXCEEDED" || (typeof error.message === "string" && error.message.toLowerCase().includes("deadline exceeded"))){
         throw new HttpsError("deadline-exceeded", "The search took too long and timed out. This can happen if there are many users or very large family trees. Please try again later or contact support if the issue persists.");
    }
    throw new HttpsError("internal", `An internal error occurred. ${originalMessage} Please check server logs (Firebase Functions) for more details. Reference UID: ${callerUid}.`);
  }
});

export const logUserAge = onCall(async (request: CallableRequest) => {
  if (!request.auth) {
    logger.warn("Unauthenticated call to logUserAge");
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }
  const userProfileDoc = await db.collection("users").doc(request.auth.uid).get();
  if (!userProfileDoc.exists) {
    throw new HttpsError("not-found", "User profile not found.");
  }
  const userProfile = userProfileDoc.data() as Profile;
  if (userProfile.dob) {
    const { calculateAge: calcAgeUtil } = require("./utils");
    const age = calcAgeUtil(userProfile.dob, logger as unknown as ILogger);
    logger.info(`User ${request.auth.uid} age: ${age}`);
    return {age};
  }
  return {age: null};
});
