import { GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged, signOut, updateProfile } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc, setDoc, collection, query, where, getDocs, serverTimestamp, runTransaction } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getFirebaseAuth, getFirebaseDb } from './firebase-config.js';

export const ADMIN_EMAIL='mohamedishankunnummal@gmail.com';
const provider=new GoogleAuthProvider();
provider.setCustomParameters({prompt:'select_account'});
const ERRORS={
 'auth/email-already-in-use':'That email already has an account. Try signing in instead.',
 'auth/invalid-email':"That doesn't look like a valid email address.",
 'auth/user-not-found':'No account was found with that email.',
 'auth/wrong-password':'Incorrect password. Try again, or reset it below.',
 'auth/invalid-credential':'Incorrect email or password.',
 'auth/weak-password':'Password should be at least 6 characters.',
 'auth/missing-password':'Enter a password.',
 'auth/popup-closed-by-user':'Sign-in was closed before it finished. Try again.',
 'auth/popup-blocked':'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.',
 'auth/cancelled-popup-request':'Sign-in was interrupted. Try again.',
 'auth/network-request-failed':'Network error. Check your connection and try again.',
 'auth/too-many-requests':'Too many attempts. Wait a bit before trying again.',
 'auth/account-exists-with-different-credential':'That email is already linked to another sign-in method. Use the method you originally registered with.',
 'auth/operation-not-allowed':'That sign-in method is not enabled in Firebase Authentication yet.'
};
export function getFriendlyAuthError(error){return ERRORS[error?.code]||'Something went wrong. Try again in a moment.';}
export async function signInGoogle(){return signInWithPopup(await getFirebaseAuth(),provider);}
export async function signInEmail(email,password){return signInWithEmailAndPassword(await getFirebaseAuth(),email,password);}
export async function signUpEmail(email,password,displayName){const cred=await createUserWithEmailAndPassword(await getFirebaseAuth(),email,password);if(displayName)await updateProfile(cred.user,{displayName});return cred;}
export async function resetPassword(email){return sendPasswordResetEmail(await getFirebaseAuth(),email);}
export async function signOutUser(){return signOut(await getFirebaseAuth());}
export async function getProfile(uid){const db=await getFirebaseDb();const snap=await getDoc(doc(db,'users',uid));return snap.exists()?snap.data():null;}
export function computeIsAdmin(user,profile){return !!user&&(((user.email||'').trim().toLowerCase()===ADMIN_EMAIL)||profile?.admin===true);}
export async function ensureProfileDoc(user){if(!user)return null;const db=await getFirebaseDb();const ref=doc(db,'users',user.uid);const snap=await getDoc(ref);const data={email:user.email||'',displayName:user.displayName||'',updatedAt:serverTimestamp()};if(!snap.exists()){data.admin=false;data.createdAt=serverTimestamp();}await setDoc(ref,data,{merge:true});const updated=await getDoc(ref);return updated.exists()?updated.data():null;}
export async function findExistingClaim(studentId){const db=await getFirebaseDb();const q=query(collection(db,'studentClaims'),where('studentId','==',studentId));const snap=await getDocs(q);return snap.empty?null:snap.docs[0].data().uid||null;}
export async function claimStudentIdentity(uid,student){const db=await getFirebaseDb();const claimRef=doc(db,'studentClaims',student.id);const userRef=doc(db,'users',uid);await runTransaction(db,async tx=>{const claim=await tx.get(claimRef);const user=await tx.get(userRef);if(!user.exists()){const e=new Error('Profile not found.');e.code='identity/profile-not-found';throw e;}const p=user.data();if(p.claimedStudentId&&p.claimedStudentId!==student.id){const e=new Error('This account is already linked to another student.');e.code='identity/account-already-claimed';throw e;}if(claim.exists()&&claim.data().uid!==uid){const e=new Error('That student is already claimed.');e.code='identity/already-claimed';throw e;}tx.set(claimRef,{uid,studentId:student.id,studentName:student.name,createdAt:claim.exists()?claim.data().createdAt:serverTimestamp()});tx.set(userRef,{claimedStudentId:student.id,claimedStudentName:student.name,updatedAt:serverTimestamp()},{merge:true});});}
export async function subscribeAuth(callback){callback({loading:true,user:null,profile:null,admin:false});let auth;try{auth=await getFirebaseAuth();}catch(error){console.error('Firebase auth unavailable:',error);callback({loading:false,user:null,profile:null,admin:false,error});return null;}return onAuthStateChanged(auth,async user=>{if(!user){callback({loading:false,user:null,profile:null,admin:false});return;}let profile=null;try{profile=await getProfile(user.uid);if(!profile)profile=await ensureProfileDoc(user);}catch(error){console.error('Profile load failed:',error);}callback({loading:false,user,profile,admin:computeIsAdmin(user,profile)});});}
