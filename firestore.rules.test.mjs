import { readFile } from 'node:fs/promises';
import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';

const projectId = 'demo-collective-minds';
let env;
const monitor = { uid: 'monitor-1', email: 'mohamedishankunnummal@gmail.com' };
const studentA = { id: 'student-a', name: 'Student A', active: true };
const studentB = { id: 'student-b', name: 'Student B', active: true };
const inactiveStudent = { id: 'student-inactive', name: 'Inactive Student', active: false };

before(async () => {
  const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'students', studentA.id), studentA),
      setDoc(doc(db, 'students', studentB.id), studentB),
      setDoc(doc(db, 'students', inactiveStudent.id), inactiveStudent),
      setDoc(doc(db, 'assignments', 'hw-1'), { title: 'Test homework' }),
      setDoc(doc(db, 'users', 'existing-user'), { displayName: 'Existing user' }),
      setDoc(doc(db, 'claims', studentB.id), {
        uid: 'other-user', studentName: studentB.name, claimedAt: new Date(),
      }),
      setDoc(doc(db, 'assignmentStatus', 'other-user_hw-1'), {
        uid: 'other-user', assignmentId: 'hw-1', status: 'pending', updatedAt: new Date(),
      }),
      setDoc(doc(db, 'notifications', 'notice-for-other'), {
        uid: 'other-user', read: false,
      }),
    ]);
  });
});

after(async () => {
  if (env) await env.cleanup();
});

function dbFor(uid, email) {
  const token = email ? { email } : {};
  return env.authenticatedContext(uid, token).firestore();
}

async function seedClaim(uid, student = studentA) {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'claims', student.id), {
      uid, studentName: student.name, claimedAt: new Date(),
    });
  });
}

test('public roster reads work, but ordinary users cannot modify the roster', async () => {
  const db = dbFor('student-1', 'student1@example.com');
  await assertSucceeds(getDocs(collection(db, 'students')));
  await assertFails(setDoc(doc(db, 'students', 'fake-student'), { name: 'Fake Student' }));
});

test('a student cannot grant themselves monitor access through a monitor document', async () => {
  const db = dbFor('student-1', 'student1@example.com');
  await assertFails(setDoc(doc(db, 'monitors', 'student-1'), { role: 'monitor' }));
  await assertFails(setDoc(doc(db, 'announcements', 'fake'), { title: 'Unauthorized' }));
});

test('self-profile creation and harmless profile updates are allowed', async () => {
  const db = dbFor('student-1', 'student1@example.com');
  await assertSucceeds(setDoc(doc(db, 'users', 'student-1'), {
    email: 'student1@example.com', displayName: 'Student One', createdAt: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(doc(db, 'users', 'student-1'), { theme: 'dark' }));
});

test('a user cannot read or modify another user profile', async () => {
  const db = dbFor('student-1', 'student1@example.com');
  await assertFails(getDoc(doc(db, 'users', 'existing-user')));
  await assertFails(updateDoc(doc(db, 'users', 'existing-user'), { displayName: 'Hijacked' }));
});

test('profile creation timestamp cannot be rewritten after account creation', async () => {
  const db = dbFor('student-1', 'student1@example.com');
  await assertSucceeds(setDoc(doc(db, 'users', 'student-1'), {
    email: 'student1@example.com', displayName: 'Student One', createdAt: new Date(1000),
  }));
  await assertFails(updateDoc(doc(db, 'users', 'student-1'), { createdAt: new Date(2000) }));
});

test('a stale claim mirror can be reconciled to the authoritative claim', async () => {
  await seedClaim('student-1', studentA);
  const db = dbFor('student-1', 'student1@example.com');
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', 'student-1'), {
      displayName: 'Student One', claimedStudentId: studentB.id,
      claimedStudentName: studentB.name, createdAt: new Date(),
    });
  });
  await assertSucceeds(updateDoc(doc(db, 'users', 'student-1'), {
    claimedStudentId: studentA.id, claimedStudentName: studentA.name,
  }));
});

test('a stale claim mirror can be cleared only when both fields are cleared together', async () => {
  const db = dbFor('student-1', 'student1@example.com');
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', 'student-1'), {
      displayName: 'Student One', claimedStudentId: studentA.id,
      claimedStudentName: studentA.name, createdAt: new Date(),
    });
  });
  await assertFails(updateDoc(doc(db, 'users', 'student-1'), { claimedStudentId: null }));
  await assertSucceeds(updateDoc(doc(db, 'users', 'student-1'), {
    claimedStudentId: null, claimedStudentName: null,
  }));
});

test('self-profile cannot escalate privileges with a monitor flag', async () => {
  const db = dbFor('student-1', 'student1@example.com');
  await setDoc(doc(db, 'users', 'student-1'), { displayName: 'Student One' });
  await assertFails(updateDoc(doc(db, 'users', 'student-1'), { monitor: true }));
});

test('a claim must use an existing active roster entry and its exact name', async () => {
  const db = dbFor('student-1', 'student1@example.com');
  await assertFails(setDoc(doc(db, 'claims', 'made-up-id'), {
    uid: 'student-1', studentName: 'Made Up Person', claimedAt: serverTimestamp(),
  }));
  await assertFails(setDoc(doc(db, 'claims', studentA.id), {
    uid: 'student-1', studentName: 'Wrong Name', claimedAt: serverTimestamp(),
  }));
  await assertFails(setDoc(doc(db, 'claims', inactiveStudent.id), {
    uid: 'student-1', studentName: inactiveStudent.name, claimedAt: serverTimestamp(),
  }));
  await assertSucceeds(setDoc(doc(db, 'claims', studentA.id), {
    uid: 'student-1', studentName: studentA.name, claimedAt: serverTimestamp(),
  }));
});

test('a claimed identity cannot be taken over by a second account', async () => {
  const db = dbFor('student-1', 'student1@example.com');
  await assertFails(setDoc(doc(db, 'claims', studentB.id), {
    uid: 'student-1', studentName: studentB.name, claimedAt: serverTimestamp(),
  }));
});

test('a profile claim mirror must match the signed-in user claim', async () => {
  const db = dbFor('student-1', 'student1@example.com');
  await assertSucceeds(setDoc(doc(db, 'claims', studentA.id), {
    uid: 'student-1', studentName: studentA.name, claimedAt: serverTimestamp(),
  }));
  await assertSucceeds(setDoc(doc(db, 'users', 'student-1'), {
    displayName: 'Student One', claimedStudentId: studentA.id,
    claimedStudentName: studentA.name, createdAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(doc(db, 'users', 'student-1'), {
    claimedStudentId: studentB.id, claimedStudentName: studentB.name,
  }));
});

test('claim owner can refresh their own claim but cannot transfer ownership', async () => {
  await seedClaim('student-1', studentA);
  const ownerDb = dbFor('student-1', 'student1@example.com');
  await assertSucceeds(updateDoc(doc(ownerDb, 'claims', studentA.id), {
    studentName: studentA.name, claimedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(doc(ownerDb, 'claims', studentA.id), { uid: 'attacker' }));
});

test('an existing monitor can grant a role through a UID document or email invite', async () => {
  const monitorDb = dbFor(monitor.uid, monitor.email);
  await assertSucceeds(setDoc(doc(monitorDb, 'monitors', 'dynamic-monitor'), { grantedBy: monitor.uid }));
  const dynamicDb = dbFor('dynamic-monitor', 'dynamic@example.com');
  await assertSucceeds(setDoc(doc(dynamicDb, 'notices', 'dynamic-monitor-notice'), { title: 'Allowed' }));

  await assertSucceeds(setDoc(doc(monitorDb, 'monitorInvites', 'invitee@gmail.com'), {
    email: 'invitee@gmail.com', invitedByUid: monitor.uid,
  }));
  const inviteeDb = dbFor('invitee-user', 'invitee@gmail.com');
  await assertSucceeds(setDoc(doc(inviteeDb, 'notices', 'invitee-notice'), { title: 'Allowed' }));
});

test('monitor invites cannot be edited by students or by changing the invite target', async () => {
  const monitorDb = dbFor(monitor.uid, monitor.email);
  await assertSucceeds(setDoc(doc(monitorDb, 'monitorInvites', 'invitee@gmail.com'), {
    email: 'invitee@gmail.com',
  }));
  const studentDb = dbFor('student-1', 'student1@example.com');
  await assertFails(updateDoc(doc(studentDb, 'monitorInvites', 'invitee@gmail.com'), {
    email: 'attacker@gmail.com',
  }));
  await assertFails(setDoc(doc(studentDb, 'monitorInvites', 'attacker@gmail.com'), {
    email: 'attacker@gmail.com',
  }));
});

test('only a monitor can write class notices', async () => {
  const studentDb = dbFor('student-1', 'student1@example.com');
  const monitorDb = dbFor(monitor.uid, monitor.email);
  await assertFails(setDoc(doc(studentDb, 'notices', 'student-notice'), { title: 'Nope' }));
  await assertSucceeds(setDoc(doc(monitorDb, 'notices', 'monitor-notice'), { title: 'Allowed' }));
});

test('assignment status is scoped to the authenticated student', async () => {
  const db = dbFor('student-1', 'student1@example.com');
  await assertSucceeds(setDoc(doc(db, 'assignmentStatus', 'student-1_hw-1'), {
    uid: 'student-1', assignmentId: 'hw-1', status: 'completed', updatedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(doc(db, 'assignmentStatus', 'other-user_hw-1'), { status: 'completed' }));
  await assertFails(setDoc(doc(db, 'assignmentStatus', 'other-user_hw-1'), {
    uid: 'other-user', assignmentId: 'hw-1', status: 'completed', updatedAt: serverTimestamp(),
  }));
});

test('notifications are private to the recipient and students cannot forge them', async () => {
  const db = dbFor('student-1', 'student1@example.com');
  await assertFails(getDoc(doc(db, 'notifications', 'notice-for-other')));
  await assertFails(setDoc(doc(db, 'notifications', 'fake'), { uid: 'student-1', read: false }));
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'notifications', 'notice-for-self'), {
      uid: 'student-1', read: false,
    });
  });
  await assertSucceeds(getDoc(doc(db, 'notifications', 'notice-for-self')));
  await assertSucceeds(updateDoc(doc(db, 'notifications', 'notice-for-self'), { read: true }));
  await assertFails(updateDoc(doc(db, 'notifications', 'notice-for-self'), { uid: 'other-user' }));
});

test('activity logs are append-only for monitors', async () => {
  const db = dbFor(monitor.uid, monitor.email);
  await assertSucceeds(setDoc(doc(db, 'activityLogs', 'log-1'), { action: 'test' }));
  await assertFails(updateDoc(doc(db, 'activityLogs', 'log-1'), { action: 'rewritten' }));
  await assertFails(deleteDoc(doc(db, 'activityLogs', 'log-1')));
});

test('monitor email matching is case-insensitive', async () => {
  const db = dbFor('monitor-uppercase', 'MOHAMEDISHANKUNNUMMAL@GMAIL.COM');
  await assertSucceeds(setDoc(doc(db, 'notices', 'case-test'), { title: 'Allowed' }));
});
