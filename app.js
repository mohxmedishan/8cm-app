import { auth, db } from "./firebase-config.js";
import {
  GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged,
  signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, addDoc, getDocs, query, orderBy, limit, onSnapshot,
  doc, getDoc, setDoc, runTransaction, serverTimestamp, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const students = [
["Abhay Sriram Kolluru","winter","22","Hindi"],["Abhinav Biju","autumn","4","French"],["Adithya Sunil Kumar","spring","61","French"],["Advitya","autumn","16","Hindi"],["Ashwin Verma","summer","57","Hindi"],["Dhruvlal Kalathingal","autumn","OT","Hindi"],["Garvit Bhola","spring","26","Hindi"],["Ihsan Sajidh Karappamveettil","spring","52","Malayalam"],["Khush Bimal Thakkar","autumn","17","French"],["Mohamed Ishan Kunnummal","spring","OT","Malayalam"],["Mohammed Akhsar","spring","7","Hindi"],["Mohammed Ali Al Jabri","winter","OT","French"],["Mohammed Isam Hussain","winter","37","French"],["Muhammad Ibrahim","autumn","17","French"],["Muhammed Mishal Ali Kuzhiyanchery","spring","58","French"],["Naresh Nair Narayanan","spring","OT","Malayalam"],["Parthiv Suresh Babu","autumn","17","Malayalam"],["Pranav Rakesh Nair","winter","3","Malayalam"],["Pranav Sathyam","autumn","26","French"],["Rushdi Nasar","autumn","OT","French"],["Saathvik Chooranath Sajithkumar","spring","64","Malayalam"],["Sarvesh Prabhu","summer","17","Hindi"],["Sayed Ahmed Faizaan Hirdh","winter","63","French"],["Shahbaz Shamsudeen","winter","OT","Malayalam"],["Suhail Saidu Mohammed","summer","18","Malayalam"],["Tazeem Mahfuz Mohamed Ismail","winter","4","French"],["Vaibhav Vibin","autumn","26","French"],["Zayan Sayed Munaffer","autumn","3","French"],["Zayan Shafil Riyas Raymarakkar Puthanpurayil","winter","39","Malayalam"],["Zishan Mohammed Karathel","autumn","7","Malayalam"]
].map(([name,house,bus,language],i)=>({id:name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""),name,house,bus,language,roll:i+1}));

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const initials = name => name.split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase();
const houseName = h => h[0].toUpperCase()+h.slice(1);
let currentUser=null, currentProfile=null, isMonitor=false, currentHouse="all", unsubChat=null, composeType="task";

function escapeHtml(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function formatDate(d){return new Intl.DateTimeFormat("en-AE",{weekday:"long",month:"long",day:"numeric"}).format(d)}
function friendlyError(e){return ({
"auth/invalid-credential":"That email or password isn't correct.","auth/wrong-password":"That password isn't correct.",
"auth/user-not-found":"No account exists with that email.","auth/email-already-in-use":"That email already has an account.",
"auth/weak-password":"Use at least 6 characters.","auth/popup-blocked":"Your browser blocked the Google popup.",
"auth/popup-closed-by-user":"The sign-in window was closed.","auth/unauthorized-domain":"This site isn't authorized in Firebase yet."
}[e?.code] || e?.message || "Something went wrong.")}

function renderStudents(){
  const q=$("#studentSearch").value.trim().toLowerCase();
  const list=students.filter(s=>(currentHouse==="all"||s.house===currentHouse)&&(!q||`${s.name} ${s.house} ${s.language} ${s.bus}`.toLowerCase().includes(q)));
  $("#studentGrid").innerHTML=list.map(s=>`<article class="student-card"><div class="student-top"><div class="student-avatar">${initials(s.name)}</div><span class="house-dot">${houseName(s.house)}</span></div><h3>${escapeHtml(s.name)}</h3><p>Roll ${s.roll} · ${s.language}</p><div class="student-meta"><span>Bus ${escapeHtml(s.bus)}</span><span>8CM</span></div></article>`).join("");
}
function renderIdentity(){
  const q=$("#identitySearch").value.trim().toLowerCase();
  const list=students.filter(s=>s.name.toLowerCase().includes(q));
  $("#identityList").innerHTML=list.map(s=>`<button class="identity-item" data-id="${s.id}"><div class="student-avatar">${initials(s.name)}</div><div><b>${escapeHtml(s.name)}</b><small>${houseName(s.house)} · Bus ${escapeHtml(s.bus)}</small></div></button>`).join("");
  $$(".identity-item").forEach(b=>b.onclick=()=>claimStudent(b.dataset.id));
}
function updateAccount(){
  if(!currentUser){$("#accountLabel").textContent="Sign in";$("#accountAvatar").textContent="?";return}
  const name=currentProfile?.claimedStudentName||currentUser.displayName||currentUser.email?.split("@")[0]||"Student";
  $("#accountLabel").textContent=name.split(" ")[0];
  $("#accountAvatar").textContent=initials(name);
  $("#chatStatus").textContent=isMonitor?"Monitor · live":"Signed in · live";
  $("#chatInput").disabled=false;$("#chatForm button").disabled=false;
  $$(".monitor-only").forEach(x=>x.hidden=!isMonitor);
}
async function getProfile(uid){const s=await getDoc(doc(db,"users",uid));return s.exists()?s.data():null}
async function monitorCheck(user){
  if(user.email==="mohamedishankunnummal@gmail.com")return true;
  try{return (await getDoc(doc(db,"monitors",user.uid))).exists()}catch{return false}
}
async function claimStudent(id){
  const student=students.find(s=>s.id===id); if(!student||!currentUser)return;
  $("#identityError").textContent="";
  try{
    await runTransaction(db,async tx=>{
      const claimRef=doc(db,"claims",student.id), userRef=doc(db,"users",currentUser.uid);
      const snap=await tx.get(claimRef);
      if(snap.exists()&&snap.data().uid!==currentUser.uid){throw new Error("That profile is already claimed.");}
      tx.set(claimRef,{uid:currentUser.uid,studentName:student.name,claimedAt:serverTimestamp()});
      tx.set(userRef,{email:currentUser.email||"",claimedStudentId:student.id,claimedStudentName:student.name,updatedAt:serverTimestamp()},{merge:true});
    });
    await updateProfile(currentUser,{displayName:student.name}).catch(()=>{});
    currentProfile=await getProfile(currentUser.uid);
    $("#identityModal").close();updateAccount();loadToday();
  }catch(e){$("#identityError").textContent=friendlyError(e)}
}
async function authReady(user){
  currentUser=user;
  if(!user){currentProfile=null;isMonitor=false;updateAccount();if(unsubChat){unsubChat();unsubChat=null}return}
  currentProfile=await getProfile(user.uid);isMonitor=await monitorCheck(user);updateAccount();
  if(!currentProfile?.claimedStudentId){renderIdentity();$("#identityModal").showModal()} else loadChat();
  loadToday();
}
async function loadToday(){
  $("#dateLabel").textContent=formatDate(new Date());
  const taskSnap=await getDocs(query(collection(db,"tasks"),orderBy("dueDate","asc"),limit(8))).catch(()=>null);
  const tasks=taskSnap?[...taskSnap.docs].map(d=>({id:d.id,...d.data()})): [];
  $("#taskList").innerHTML=tasks.length?tasks.map(t=>`<div class="list-row"><div class="list-icon">${escapeHtml((t.subject||"HW").slice(0,2).toUpperCase())}</div><div class="list-main"><b>${escapeHtml(t.title||"Homework")}</b><small>${escapeHtml(t.description||t.subject||"Class task")}</small></div><span class="list-date">${escapeHtml(t.dueDate||"Today")}</span></div>`).join(""):`<div class="empty-state"><div><strong>Nothing due yet.</strong>Looks suspiciously peaceful.</div></div>`;
  const annSnap=await getDocs(query(collection(db,"announcements"),orderBy("createdAt","desc"),limit(6))).catch(()=>null);
  const anns=annSnap?[...annSnap.docs].map(d=>d.data()):[];
  $("#announcementList").innerHTML=anns.length?anns.map(a=>`<div class="list-row"><div class="list-icon">!</div><div class="list-main"><b>${escapeHtml(a.title||"Announcement")}</b><small>${escapeHtml(a.content||"")}</small></div><span class="list-date">${a.priority==="important"?"IMPORTANT":""}</span></div>`).join(""):`<div class="empty-state"><div><strong>No announcements.</strong>The notice board is taking a break.</div></div>`;
}
function loadChat(){
  if(unsubChat)unsubChat();
  const qy=query(collection(db,"messages"),orderBy("createdAt","desc"),limit(60));
  unsubChat=onSnapshot(qy,snap=>{
    const msgs=[...snap.docs].reverse();
    $("#messages").innerHTML=msgs.length?msgs.map(m=>{const me=m.uid===currentUser?.uid;return `<div class="message ${me?"me":""}"><div class="message-avatar">${initials(m.name||"CM")}</div><div class="bubble"><b>${escapeHtml(m.name||"Student")}</b><p>${escapeHtml(m.text||"")}</p><time>${m.createdAt?.toDate?m.createdAt.toDate().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):"now"}</time></div></div>`}).join(""):`<div class="empty-chat"><span>CM.</span><b>The room is quiet.</b><small>Be the first to say something.</small></div>`;
    $("#messages").scrollTop=$("#messages").scrollHeight;
  },()=>{$("#chatStatus").textContent="Chat unavailable"});  
}
async function sendMessage(){
  const input=$("#chatInput"),text=input.value.trim();if(!text||!currentUser)return;
  input.value="";
  const name=currentProfile?.claimedStudentName||currentUser.displayName||"Student";
  await addDoc(collection(db,"messages"),{uid:currentUser.uid,name,text,createdAt:serverTimestamp()}).catch(()=>{input.value=text});
}
async function openAuth(){if(currentUser){$("#profileName").textContent=currentProfile?.claimedStudentName||currentUser.displayName||"Student";$("#profileDetails").textContent=`${currentUser.email||""}${isMonitor?" · Monitor":""}`;$("#profileAvatar").textContent=initials($("#profileName").textContent);$("#profileModal").showModal()}else $("#authModal").showModal()}
async function doGoogle(){try{await signInWithPopup(auth,new GoogleAuthProvider())}catch(e){$("#authError").textContent=friendlyError(e)}}
$("#accountBtn").onclick=openAuth;$("#googleBtn").onclick=doGoogle;
$("#emailForm").onsubmit=async e=>{e.preventDefault();$("#authError").textContent="";try{await signInWithEmailAndPassword(auth,$("#email").value,$("#password").value);$("#authModal").close()}catch(err){$("#authError").textContent=friendlyError(err)}};
$("#signupBtn").onclick=async()=>{try{await createUserWithEmailAndPassword(auth,$("#email").value,$("#password").value);$("#authModal").close()}catch(e){$("#authError").textContent=friendlyError(e)}};
$("#resetBtn").onclick=async()=>{const email=$("#email").value.trim();if(!email){$("#authError").textContent="Enter your email first.";return}try{await sendPasswordResetEmail(auth,email);$("#authError").textContent="Password reset email sent."}catch(e){$("#authError").textContent=friendlyError(e)}};
$("#logoutBtn").onclick=()=>signOut(auth);$("#switchStudentBtn").onclick=()=>{$("#profileModal").close();renderIdentity();$("#identityModal").showModal()};
$("#chatForm").onsubmit=e=>{e.preventDefault();sendMessage()};$("#studentSearch").oninput=renderStudents;$("#identitySearch").oninput=renderIdentity;
$$(".filter").forEach(b=>b.onclick=()=>{$$(".filter").forEach(x=>x.classList.remove("active"));b.classList.add("active");currentHouse=b.dataset.house;renderStudents()});
$("#themeBtn").onclick=()=>{const next=document.documentElement.dataset.theme==="dark"?"light":"dark";document.documentElement.dataset.theme=next;localStorage.setItem("cm-theme",next)};
document.documentElement.dataset.theme=localStorage.getItem("cm-theme")||"dark";
$("#menuBtn").onclick=()=>{$("#mobileMenu").style.display=$("#mobileMenu").style.display==="block"?"none":"block"};$$(".mobile-menu a").forEach(a=>a.onclick=()=>$("#mobileMenu").style.display="none");
$$("[data-close]").forEach(b=>b.onclick=()=>b.closest("dialog").close());
$("#addTaskBtn").onclick=()=>{composeType="task";$("#composeTitle").textContent="Add homework";$("#composeForm").querySelector('[name="subject"]').required=true;$("#composeForm").querySelector('[name="dueDate"]').required=true;$("#composeModal").showModal()};
$("#addAnnouncementBtn").onclick=()=>{composeType="announcement";$("#composeTitle").textContent="Post announcement";$("#composeForm").querySelector('[name="subject"]').required=false;$("#composeForm").querySelector('[name="dueDate"]').required=false;$("#composeModal").showModal()};
$("#composeForm").onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);$("#composeError").textContent="";try{if(composeType==="task")await addDoc(collection(db,"tasks"),{title:fd.get("title"),subject:fd.get("subject"),dueDate:fd.get("dueDate"),description:fd.get("description"),createdAt:serverTimestamp(),createdBy:currentUser.uid});else await addDoc(collection(db,"announcements"),{title:fd.get("title"),content:fd.get("description")||fd.get("subject"),priority:"normal",createdAt:serverTimestamp(),createdBy:currentUser.uid});e.target.reset();$("#composeModal").close();loadToday()}catch(err){$("#composeError").textContent=friendlyError(err)}};
window.addEventListener("scroll",()=>{const h=document.documentElement;$("#progress").style.width=`${h.scrollTop/(h.scrollHeight-h.clientHeight)*100}%`});
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)e.target.classList.add("visible")}),{threshold:.1});$$(".reveal").forEach(e=>io.observe(e));
renderStudents();loadToday();onAuthStateChanged(auth,authReady);
