import { students } from './students.js';

const $ = (id) => document.getElementById(id);
const grid = $('studentGrid');
const resultCount = $('resultCount');
let filters = new Set();
let search = '';

function renderStudents(list) {
  if (!grid || !resultCount) return;
  grid.replaceChildren();
  grid.classList.toggle('empty', list.length === 0);
  list.forEach((s, i) => {
    const card = document.createElement('div');
    card.className = 'student-card';
    card.style.animationDelay = `${Math.min(i, 12) * 0.02}s`;
    const top = document.createElement('div'); top.className = 'student-top';
    const dot = document.createElement('span'); dot.className = `house-dot ${s.house}`;
    const name = document.createElement('span'); name.className = 'student-name'; name.textContent = s.name;
    top.append(dot, name);
    const meta = document.createElement('div'); meta.className = 'student-meta';
    const house = document.createElement('span'); house.textContent = s.house[0].toUpperCase() + s.house.slice(1);
    const transport = document.createElement('span'); transport.textContent = s.transport === 'OT' ? 'Own transport' : `Bus ${s.transport}`;
    meta.append(house, transport); card.append(top, meta); grid.appendChild(card);
  });
  resultCount.textContent = `${list.length} student${list.length === 1 ? '' : 's'}`;
}
function applyFilters() {
  let list = students.filter(s => [...filters].every(f => f.startsWith('house:') ? s.house === f.slice(6) : f.startsWith('transport:') ? s.transport === f.slice(10) : true));
  const q = search.trim().toLowerCase();
  if (q) list = list.filter(s => s.name.toLowerCase().includes(q));
  renderStudents(list);
}
function syncPills() {
  document.querySelectorAll('.pill').forEach(p => {
    const f = p.dataset.filter;
    p.classList.toggle('active', f === 'all' ? filters.size === 0 : filters.has(f));
    const c = {'house:winter':'var(--house-winter)','house:autumn':'var(--house-autumn)','house:spring':'var(--house-spring)','house:summer':'var(--house-summer)'}[f];
    if (c) p.style.setProperty('--pill-house-color', c);
  });
}
function toggleFilter(f) {
  if (f === 'all') filters.clear();
  else if (f.startsWith('house:')) {
    ['house:winter','house:autumn','house:spring','house:summer'].forEach(x => filters.delete(x));
    if (!filters.has(f)) filters.add(f);
  } else filters.has(f) ? filters.delete(f) : filters.add(f);
  syncPills(); applyFilters();
}
function jumpHouse(h) {
  filters.clear(); filters.add(`house:${h}`); syncPills(); applyFilters();
  $('students')?.scrollIntoView({behavior:'smooth',block:'start'});
}
renderStudents(students); syncPills();
document.querySelectorAll('.pill').forEach(p => p.addEventListener('click', () => toggleFilter(p.dataset.filter)));
$('searchInput')?.addEventListener('input', e => { search=e.target.value; applyFilters(); });
document.querySelectorAll('.house-card,.bar-row').forEach(el => {
  const run=()=>jumpHouse(el.dataset.house); el.addEventListener('click',run);
  el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();run();}});
});

const resources=[
 {name:'Google Classroom',description:'Assignments, materials, and class-wide posts.',url:'https://classroom.google.com'},
 {name:'Digital Campus (DC)',description:'School portal for grades, attendance, and notices.',url:'http://lms.adiswathba.com/my/'}
];
const rg=$('resourceGrid');
if(rg) resources.forEach(r=>{const a=document.createElement('a');a.className='resource-card';a.href=r.url;a.target='_blank';a.rel='noopener noreferrer';const h=document.createElement('h3');h.textContent=r.name;const p=document.createElement('p');p.textContent=r.description;const n=document.createElement('span');n.className='resource-note';n.textContent='Open →';a.append(h,p,n);rg.appendChild(a);});

const nav=$('nav'), burger=$('burger'), navLinks=$('navLinks');
window.addEventListener('scroll',()=>nav?.classList.toggle('scrolled',scrollY>8),{passive:true});
function closeMenu(){burger?.classList.remove('open');burger?.setAttribute('aria-expanded','false');navLinks?.classList.remove('open');}
burger?.addEventListener('click',e=>{e.stopPropagation();const open=!navLinks.classList.contains('open');burger.classList.toggle('open',open);burger.setAttribute('aria-expanded',String(open));navLinks.classList.toggle('open',open);});
navLinks?.querySelectorAll('a.nav-link').forEach(a=>a.addEventListener('click',closeMenu));
function dropdown(id){const t=$(id);const item=t?.closest('.nav-item');if(!t||!item)return;t.addEventListener('click',e=>{e.stopPropagation();document.querySelectorAll('.nav-item.has-dropdown.open').forEach(o=>{if(o!==item){o.classList.remove('open');o.querySelector('.nav-dropdown-trigger')?.setAttribute('aria-expanded','false');}});const open=item.classList.toggle('open');t.setAttribute('aria-expanded',String(open));});item.querySelectorAll('.dropdown a').forEach(a=>a.addEventListener('click',()=>{item.classList.remove('open');t.setAttribute('aria-expanded','false');closeMenu();}));}
dropdown('homeTrigger'); dropdown('moreTrigger');
document.addEventListener('click',e=>document.querySelectorAll('.nav-item.has-dropdown.open').forEach(item=>{if(!item.contains(e.target)){item.classList.remove('open');item.querySelector('.nav-dropdown-trigger')?.setAttribute('aria-expanded','false');}}));
window.addEventListener('keydown',e=>{if(e.key==='Escape'){document.querySelectorAll('.nav-item.has-dropdown.open').forEach(item=>{item.classList.remove('open');item.querySelector('.nav-dropdown-trigger')?.setAttribute('aria-expanded','false');});closeMenu();}});

function animateBars(){document.querySelectorAll('.bar-fill').forEach(bar=>{const v=Number(bar.dataset.value),m=Number(bar.dataset.max);bar.style.width=Number.isFinite(v)&&Number.isFinite(m)&&m>0?`${Math.min(100,v/m*100)}%`:'0%';});}
function countUp(el){const target=Number(el.dataset.count);if(!Number.isFinite(target))return;const start=performance.now(),duration=900;function tick(now){const p=Math.min((now-start)/duration,1);el.textContent=String(Math.round((1-Math.pow(1-p,3))*target));if(p<1)requestAnimationFrame(tick);}requestAnimationFrame(tick);}
function startStats(){const els=document.querySelectorAll('.stat-number[data-count]');if(!('IntersectionObserver'in window)){els.forEach(countUp);return;}const o=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){countUp(e.target);o.unobserve(e.target);}}),{threshold:.5});els.forEach(e=>o.observe(e));}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{animateBars();startStats();},{once:true});else{animateBars();startStats();}

const splash=$('splash');
function hideSplash(){if(!splash)return;splash.classList.add('hide');window.setTimeout(()=>splash.remove(),500);}
window.setTimeout(hideSplash,1800);
window.addEventListener('load',()=>window.setTimeout(hideSplash,50),{once:true});

(async()=>{try{const [{initAuthUI},{initTasks}]=await Promise.all([import('./auth-ui.js'),import('./tasks.js')]);initAuthUI();initTasks();}catch(error){console.error('Optional Firebase features failed:',error);const slot=$('authSlot');if(slot){slot.innerHTML='<button class="btn btn-primary btn-small" id="signInTriggerBtn" type="button">Sign in</button>';$("signInTriggerBtn")?.addEventListener('click',()=>{$('authOverlay').hidden=false;document.body.classList.add('modal-open');});}if($('taskList'))$('taskList').innerHTML='<p class="task-empty">Live tasks are temporarily unavailable.</p>';}})();
