import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const auth = await readFile(new URL("../auth.js", import.meta.url), "utf8");
const authUI = await readFile(new URL("../auth-ui.js", import.meta.url), "utf8");
const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");

test("profile creation timestamp is only written when creating a profile", () => {
  assert.match(auth, /if \(existing\.exists\(\)\)/);
  assert.match(auth, /setDoc\(ref, profileFields, \{ merge: true \}\)/);
  assert.match(auth, /createdAt: serverTimestamp\(\)/);
  const selfChanges = rules.split("function allowedSelfProfileChanges()")[1]?.split("\n    }")[0] || "";
  assert.doesNotMatch(selfChanges, /createdAt/);
});

test("identity reconciliation does not use a local cache as claim authority", () => {
  assert.match(auth, /const found = await findClaimForUid\(uid\)/);
  assert.match(auth, /return \{ status: "error", profile, error: err \}/);
  assert.doesNotMatch(auth, /getCachedClaim|8cm:claimedStudent/);
});

test("claim modal waits for an authoritative identity status", () => {
  assert.match(authUI, /state\.identityStatus === "ready"/);
  assert.match(authUI, /state\.identityStatus === "error"/);
  assert.match(authUI, /settledState\.identityStatus === "error"/);
});

test("profile mirror can be cleared only as a pair and can be repaired from claims", () => {
  assert.match(rules, /request\.resource\.data\.claimedStudentId == null &&\s*request\.resource\.data\.claimedStudentName == null/);
  assert.match(rules, /function claimedIdOnUpdateIsValid\(\)/);
});
