// ============================================
// 8CM — Achievements
// ============================================
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { describeWriteError } from "./error-utils.js";
import { subscribeAuth } from "./auth.js";
import { getStudentsSync, loadStudents, onStudents } from "./students.js";
import { logAction } from "./audit.js";
import { playOpen, playClose, playSuccess, playError, playDelete } from "./sound.js";
const $ = (id) => document.getElementById(id);
let cache = [], isCurrentMonitor = false, editingId = null, latestStudents = [];
const listeners = new Set();
const escapeHtml = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
function notify(){ listeners.forEach((cb)=>cb(cache.slice())); }
export function onAchievements(cb){ listeners.add(cb); cb(cache.slice()); return ()=>listeners.delete(cb); }
function studentName(id){ return latestStudents.find((s)=>s.id===id)?.name || id; }
function toggleAboutFields(){
  const f=$("achievementForm"); if(!f)return;
  const isStudent=f.about.value==="student";
  f.studentId.closest(".field").hidden=!isStudent;
  f.aboutLabel.closest(".field").hidden=isStudent;
}
function startListener(){
  const q=query(collection(db,"achievements"),orderBy("date","desc"));
  return onSnapshot(q,(snap)=>{ cache=snap.docs.map((d)=>({id:d.id,...d.data()})); renderPublic(); renderManage(); notify(); },(err)=>{ console.error("Failed to load achievements:",err); const c=$("achievementsList"); if(c)c.innerHTML=`<p class="empty-body">Couldn't load achievements right now.</p>`; });
}
function renderPublic(){
  const c=$("achievementsList"); if(!c)return;
  if(!cache.length){ c.innerHTML=`<div class="empty-state"><p class="empty-title">The board is empty. For now.</p><p class="empty-body">Academic, sport, or competition wins get logged here as they happen.</p></div>`; return; }
  const groups=new Map();
  cache.forEach(a=>{const key=a.studentId||a.aboutLabel||"Class";if(!groups.has(key))groups.set(key,[]);groups.get(key).push(a);});
  c.innerHTML=[...groups.entries()].map(([key,items])=>{
    const label=items[0]?.studentId?studentName(key):(items[0]?.aboutLabel||key);
    return `<article class="achievement-group"><h3 class="achievement-student">${escapeHtml(label)}</h3><ul class="achievement-list">${items.map(a=>`<li class="achievement-item"><span class="task-tag announcement">${escapeHtml(a.category||"General")}</span><div class="achievement-body"><p class="task-subject">${escapeHtml(a.title)}</p>${a.description?`<p class="task-detail">${escapeHtml(a.description)}</p>`:""}${a.date?`<p class="achievement-date">${escapeHtml(a.date)}</p>`:""}</div></li>`).join("")}</ul></article>`;
  }).join("");
}

function populateStudentSelect(){ const select=$("achievementForm")?.studentId; if(!select)return; const current=select.value; select.innerHTML=""; [...latestStudents].sort((a,b)=>a.name.localeCompare(b.name)).forEach(s=>{const o=document.createElement("option");o.value=s.id;o.textContent=`${s.rollNumber}. ${s.name}`;select.appendChild(o);}); if(current)select.value=current; }
function renderManage(){
  const list=$("achievementManageList"); if(!list)return;
  if(!isCurrentMonitor){list.innerHTML=`<p class="task-empty">Only monitors can manage achievements.</p>`;return;}
  if(!cache.length){list.innerHTML=`<p class="task-empty">No achievements yet.</p>`;return;}
  list.innerHTML=""; cache.forEach(a=>{const row=document.createElement("div");row.className="manage-row";row.innerHTML=`<div class="manage-row-body"><p class="task-subject">${escapeHtml(a.title)}</p><p class="task-detail">${escapeHtml(a.studentId ? studentName(a.studentId) : (a.aboutLabel || a.about || "Class"))} · ${escapeHtml(a.category||"General")}${a.date?" · "+escapeHtml(a.date):""}</p></div><div class="task-monitor-actions"><button class="task-icon-btn" data-action="edit" data-id="${escapeHtml(a.id)}">✎</button><button class="task-icon-btn task-icon-btn-danger" data-action="delete" data-id="${escapeHtml(a.id)}">✕</button></div>`;list.appendChild(row);});
  list.querySelectorAll('[data-action="edit"]').forEach(b=>b.addEventListener("click",()=>openForm(cache.find(x=>x.id===b.dataset.id))));
  list.querySelectorAll('[data-action="delete"]').forEach(b=>b.addEventListener("click",()=>handleDelete(b.dataset.id)));
}
function openForm(a){
  const f=$("achievementForm");if(!f)return;
  populateStudentSelect(); editingId=a?.id||null;
  f.about.value=a?.about||"student"; f.aboutLabel.value=a?.aboutLabel||"";
  f.studentId.value=a?.studentId||f.studentId.options[0]?.value||"";
  toggleAboutFields();
  f.title.value=a?.title||"";f.description.value=a?.description||"";f.category.value=a?.category||"General";f.date.value=a?.date||new Date().toISOString().slice(0,10);
  setFormError(null);f.hidden=false;f.querySelector('button[type="submit"]').textContent=a?"Save changes":"Add achievement";playOpen();f.title.focus();
}
function closeForm({silent=false}={}){const f=$("achievementForm");if(!f)return;f.reset();f.hidden=true;editingId=null;setFormError(null);if(!silent)playClose();}
function setFormError(m){const e=$("achievementFormError");if(!e)return;e.hidden=!m;e.textContent=m||"";}
async function handleSubmit(e){e.preventDefault();const f=e.target;const payload={about:f.about.value,aboutLabel:f.aboutLabel.value.trim(),studentId:f.about.value==="student"?f.studentId.value:null,title:f.title.value.trim(),description:f.description.value.trim(),category:f.category.value,date:f.date.value||""};if((f.about.value==="student"&&!payload.studentId)||!payload.title)return;setFormError(null);const b=f.querySelector('button[type="submit"]');const old=b.textContent;b.disabled=true;b.textContent="Saving…";try{if(editingId){await updateDoc(doc(db,"achievements",editingId),payload);await logAction("updated",{resourceType:"achievement",resourceId:editingId,summary:`Updated achievement for ${studentName(payload.studentId)}: ${payload.title}`});}else{const ref=await addDoc(collection(db,"achievements"),{...payload,awardedAt:serverTimestamp()});await logAction("created",{resourceType:"achievement",resourceId:ref.id,summary:`Awarded ${payload.title} to ${studentName(payload.studentId)}`});}playSuccess();closeForm({silent:true});}catch(err){console.error("Save failed:",err);playError();setFormError(describeWriteError(err,"save"));}finally{b.disabled=false;b.textContent=old;}}
async function handleDelete(id){if(!confirm("Delete this achievement?"))return;try{await deleteDoc(doc(db,"achievements",id));await logAction("deleted",{resourceType:"achievement",resourceId:id,summary:"Deleted achievement"});playDelete();}catch(err){console.error("Delete failed:",err);playError();alert(describeWriteError(err,"delete"));}}
export function initAchievements(){const needs=!!$("achievementsList")||!!$("achievementManageList")||!!$("profileOverlay");if(!needs)return;startListener();onStudents((list)=>{latestStudents=list;renderPublic();renderManage();const f=$("achievementForm");if(f&&!f.hidden)populateStudentSelect();});loadStudents().catch(()=>{});latestStudents=getStudentsSync();subscribeAuth(({monitor})=>{isCurrentMonitor=monitor;const b=$("addAchievementBtn");if(b)b.hidden=!monitor;renderManage();});const add=$("addAchievementBtn");if(add)add.addEventListener("click",()=>openForm(null));const f=$("achievementForm");if(f){f.addEventListener("submit",handleSubmit);const aboutSel=f.querySelector('select[name="about"]');if(aboutSel)aboutSel.addEventListener("change",toggleAboutFields);const c=f.querySelector('[data-action="cancel"]');if(c)c.addEventListener("click",()=>closeForm());}}
