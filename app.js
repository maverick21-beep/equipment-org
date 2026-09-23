// =====================================================
// SUPABASE CONFIGURATION
// =====================================================
const SUPABASE_URL = 'https://ttmimlqclhjijhhgtrat.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0bWltbHFjbGhqaWpoaGd0cmF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNzQ0MTYsImV4cCI6MjEwNTY1MDQxNn0.oxeTNFYRwWEB0lHWDMEgi89HlLckci4kki8tO62ZW5o';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =====================================================
// APP STATE
// =====================================================
let currentUser = null;
let currentProfile = null;
let inventory = [];
let equipmentCategories = [];
let categories = [];
let checkouts = [];
let maintenanceData = [];
let purchaseOrders = [];
let checkoutCount = 1;

// =====================================================
// AUTH FUNCTIONS
// =====================================================
let authMode = 'login';

function showAuthError(msg){
  const el = document.getElementById('authError');
  el.textContent = msg;
  el.classList.add('show');
}
function clearAuthError(){ document.getElementById('authError').classList.remove('show'); }
function resetAuthButton(){
  const btn = document.getElementById('authBtn');
  btn.disabled = false;
  btn.textContent = authMode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT';
}

document.getElementById('authToggle').addEventListener('click', ()=>{
  authMode = authMode === 'login' ? 'signup' : 'login';
  document.getElementById('authTitle').textContent = authMode === 'login' ? 'Sign In' : 'Create Account';
  document.getElementById('authBtn').textContent = authMode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT';
  document.getElementById('authToggleLabel').textContent = authMode === 'login' ? "Don't have an account?" : 'Already have an account?';
  document.getElementById('authToggle').textContent = authMode === 'login' ? 'Sign up' : 'Sign in';
  document.getElementById('fullNameField').style.display = authMode === 'signup' ? 'block' : 'none';
  resetAuthButton();
  clearAuthError();
});

document.getElementById('authBtn').addEventListener('click', async ()=>{
  clearAuthError();
  const email = document.getElementById('loginEmail').value.trim().replace(/\s+/g,'').toLowerCase();
  const password = document.getElementById('loginPassword').value;
  if(!email || !password){ showAuthError('Please enter email and password'); return; }

  const btn = document.getElementById('authBtn');
  btn.disabled = true; btn.textContent = authMode === 'login' ? 'SIGNING IN...' : 'CREATING ACCOUNT...';

  try {
    let res;
    if(authMode === 'login'){
      res = await supabaseClient.auth.signInWithPassword({ email, password });
    } else {
      const fullName = document.getElementById('fullName').value.trim() || email.split('@')[0];
      res = await supabaseClient.auth.signUp({
        email, password,
        options: { data: { full_name: fullName } }
      });
      if(res.data.user && !res.error && res.data.session === null){
        resetAuthButton();
        showAuthError('Check your email for a confirmation link, then sign in.');
        return;
      }
    }
    if(res.error) throw res.error;
  } catch(err){
    resetAuthButton();
    showAuthError(err.message || 'Authentication failed');
  }
});

['loginEmail','loginPassword','fullName'].forEach(id=>{
  const el = document.getElementById(id);
  if(el) el.addEventListener('keydown', e=>{ if(e.key === 'Enter') document.getElementById('authBtn').click(); });
});

document.getElementById('logoutBtn').addEventListener('click', async ()=>{
  resetAuthButton();
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('fullName').value = '';
  await supabaseClient.auth.signOut();
});

supabaseClient.auth.onAuthStateChange(async (event, session) => {
  if(session && session.user){
    currentUser = session.user;
    await loadCurrentProfile();
    showAppShell();
    await loadAllData();
  } else {
    currentUser = null; currentProfile = null;
    showAuthScreen();
  }
});

async function loadCurrentProfile(){
  for(let i=0; i<3; i++){
    const { data } = await supabaseClient.from('profiles').select('*').eq('id', currentUser.id).single();
    if(data){ currentProfile = data; return; }
    await new Promise(r => setTimeout(r, 500));
  }
  currentProfile = { id: currentUser.id, email: currentUser.email, full_name: currentUser.email, role: 'user' };
}

function showAuthScreen(){
  resetAuthButton();
  document.getElementById('loadingView').classList.remove('active');
  document.getElementById('appShell').style.display = 'none';
  document.getElementById('authView').classList.add('active');
}

function showAppShell(){
  document.getElementById('loadingView').classList.remove('active');
  document.getElementById('authView').classList.remove('active');
  document.getElementById('appShell').style.display = 'block';

  const tag = document.getElementById('roleTag');
  tag.textContent = (currentProfile?.role || 'user').toUpperCase();
  tag.style.color = currentProfile?.role === 'admin' ? 'var(--orange)' : 'var(--text-dim)';

  const name = currentProfile?.full_name || currentUser.email || 'U';
  const initials = name.split(/\s+/).map(s=>s[0]).join('').slice(0,2).toUpperCase();
  document.getElementById('userAvatar').textContent = initials;

  const adminTabs = ['maintenance','procurement'];
  document.querySelectorAll('nav.tabs button[data-view]').forEach(b=>{
    if(adminTabs.includes(b.dataset.view) && currentProfile?.role !== 'admin'){
      b.style.display = 'none';
    } else {
      b.style.display = '';
    }
  });
}

// =====================================================
// DATA LOADING FROM SUPABASE
// =====================================================
async function loadAllData(){
  await Promise.all([
    loadCategories(),
    loadInventory(),
    loadCheckouts(),
    loadMaintenance(),
    loadProcurement()
  ]);
  renderCategories();
  renderDashCheckouts();
  renderInventory();
  renderCheckouts();
  renderMaintenance();
  renderProcurement();
  updateDashStats();
}

async function loadCategories(){
  const { data } = await supabaseClient.from('equipment_categories').select('*').order('name');
  equipmentCategories = data || [];
}

async function loadInventory(){
  let { data } = await supabaseClient
    .from('equipment')
    .select('*, category:equipment_categories(name)')
    .order('sku');
  data = data || [];
  inventory = data.map(e => ({
    id: e.id,
    sku: e.sku,
    name: e.name,
    cat: e.category?.name || 'Uncategorized',
    have: e.available_qty,
    total: e.total_qty,
    cond: e.condition,
    loc: e.location,
    status: mapEquipStatus(e.status, e.available_qty, e.total_qty)
  }));
  categories = equipmentCategories.map(c => {
    const items = inventory.filter(i => i.cat === c.name);
    return { name: c.name, have: items.reduce((s,i)=>s+i.have,0), total: items.reduce((s,i)=>s+i.total,0) };
  }).filter(c => c.total > 0);
  const filtersDiv = document.getElementById('invFilters');
  filtersDiv.innerHTML = `<button class="chip active" data-cat="ALL">ALL</button>` +
    categories.map(c=>`<button class="chip" data-cat="${c.name}">${c.name.toUpperCase()}</button>`).join('');
  attachInventoryFilters();
}

function mapEquipStatus(status, have, total){
  if(status === 'maintenance') return 'Maintenance';
  if(status === 'deactivated') return 'Deactivated';
  if(have <= 0 && total > 0) return 'Checked Out';
  return 'Available';
}

async function loadCheckouts(){
  let { data } = await supabaseClient
    .from('checkouts')
    .select('*, equipment:equipment(name, sku)')
    .order('checked_out_at', { ascending: false });
  data = data || [];
  const today = new Date();
  today.setHours(0,0,0,0);
  checkouts = data.map((c, idx) => {
    const due = new Date(c.due_date); due.setHours(0,0,0,0);
    const overdue = c.status === 'checked_out' && due < today;
    return {
      id: c.id,
      ref: `C${String(idx+1).padStart(3,'0')}`,
      name: c.equipment?.name || 'Unknown item',
      athlete: c.user_name,
      team: c.user_team || '',
      out: (c.checked_out_at || '').slice(0,10),
      due: c.due_date,
      qty: c.qty,
      overdue,
      returned: c.status === 'returned'
    };
  });
  checkoutCount = checkouts.length;
}

async function loadMaintenance(){
  if(currentProfile?.role !== 'admin'){ maintenanceData = []; return; }
  let { data } = await supabaseClient
    .from('maintenance')
    .select('*, equipment:equipment(name)')
    .order('scheduled_date');
  data = data || [];
  maintenanceData = data.map(m => ({
    id: m.id,
    name: m.equipment?.name || 'Unknown',
    type: m.type,
    priority: m.priority,
    sched: m.scheduled_date,
    tech: m.technician,
    done: m.status === 'completed'
  }));
}

async function loadProcurement(){
  if(currentProfile?.role !== 'admin'){ purchaseOrders = []; return; }
  let { data } = await supabaseClient
    .from('purchase_orders')
    .select('*')
    .order('order_date', { ascending: false });
  data = data || [];
  purchaseOrders = data.map(p => {
    const total = Number(p.total_cost || p.qty * p.unit_cost).toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0});
    return {
      id: p.po_number,
      name: p.equipment_description || `Order ${p.po_number} × ${p.qty}`,
      sub: `Ordered ${p.order_date}`,
      cost: total,
      stage: mapPoStatus(p.status)
    };
  });
  document.getElementById('poCount').textContent = data.filter(p => p.status !== 'received' && p.status !== 'cancelled').length;
}

function mapPoStatus(s){
  const map = {
    pending_approval: 'Pending Approval',
    approved: 'Approved',
    ordered: 'Ordered',
    shipped: 'Shipped',
    received: 'Received',
    cancelled: 'Cancelled'
  };
  return map[s] || s;
}

// =====================================================
// Tab switching
// =====================================================
document.getElementById('tabs').addEventListener('click', e=>{
  const btn = e.target.closest('button[data-view]');
  if(!btn) return;
  document.querySelectorAll('nav.tabs button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+btn.dataset.view).classList.add('active');
});

// =====================================================
// RENDERERS
// =====================================================
function condClass(c){ return c.toLowerCase(); }
function statusClass(s){ return s.toLowerCase().replace(' ',''); }

function renderCategories(){
  const el = document.getElementById('catRows');
  if(!categories.length){ el.innerHTML = '<div class="dim">No categories yet.</div>'; return; }
  el.innerHTML = categories.map(c=>{
    const pct = c.total === 0 ? 0 : Math.round((c.have/c.total)*100);
    return `<div class="cat-row">
      <div class="cat-row-top"><span class="cat-name">${c.name}</span><span class="cat-num">${c.have}/${c.total} available</span></div>
      <div class="bar-track"><div class="bar-fill ${pct<70?'low':''}" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
}

function renderDashCheckouts(){
  const active = checkouts.filter(c=>!c.returned).slice(0, 5);
  const el = document.getElementById('dashCheckoutList');
  if(!active.length){ el.innerHTML = '<div class="dim">No active checkouts.</div>'; return; }
  el.innerHTML = active.map(c=>`
    <div class="checkout-item">
      <div>
        <div class="co-name">${c.name}</div>
        <div class="co-meta">${c.athlete}${c.team?' · '+c.team:''}</div>
      </div>
      <div class="co-right">
        <div class="co-due ${c.overdue?'warn':''}">${c.overdue?'⚠ ':''}Due ${c.due}</div>
        <div class="co-qty">qty ${c.qty}</div>
      </div>
    </div>`).join('');
}

function updateDashStats(){
  const totalEquip = inventory.reduce((s,i)=>s+i.total, 0);
  const availEquip = inventory.reduce((s,i)=>s+i.have, 0);
  const statCards = document.querySelectorAll('.stat-card .stat-value');
  if(statCards[0]) statCards[0].textContent = totalEquip;
  if(statCards[1]) statCards[1].textContent = availEquip;

  const activeCount = checkouts.filter(c=>!c.returned).length;
  const overdueCount = checkouts.filter(c=>!c.returned && c.overdue).length;
  if(statCards[2]) statCards[2].textContent = activeCount;
  document.getElementById('dashOverdueFoot').textContent = overdueCount + ' overdue';

  const pending = maintenanceData.filter(m=>!m.done).length;
  if(statCards[3]) statCards[3].textContent = pending;

  document.getElementById('overduePill').textContent = overdueCount + ' OVERDUE';
  const availPct = totalEquip ? Math.round((availEquip/totalEquip)*100) : 0;
  const availFoot = document.querySelectorAll('.stat-card .stat-foot');
  if(availFoot[1]) availFoot[1].textContent = availPct + '% of inventory';
}

let invFilter = 'ALL';
function renderInventory(){
  const rows = invFilter==='ALL' ? inventory : inventory.filter(i=>i.cat===invFilter);
  document.getElementById('invSub').textContent = `${inventory.length} items · Loaded from Supabase`;
  const body = document.getElementById('invBody');
  if(!rows.length){ body.innerHTML = '<tr><td colspan="7" class="dim">No items found.</td></tr>'; return; }
  body.innerHTML = rows.map(i=>`
    <tr>
      <td class="mono">${i.sku}</td>
      <td class="strong">${i.name}</td>
      <td class="dim">${i.cat}</td>
      <td><strong>${i.have}</strong><span class="dim">/${i.total}</span></td>
      <td><span class="cond ${condClass(i.cond)}">${i.cond}</span></td>
      <td class="dim">${i.loc}</td>
      <td><span class="pill ${statusClass(i.status)}">${i.status}</span></td>
    </tr>`).join('');
}

function attachInventoryFilters(){
  document.getElementById('invFilters').addEventListener('click', e=>{
    const chip = e.target.closest('.chip');
    if(!chip) return;
    document.querySelectorAll('#invFilters .chip').forEach(c=>c.classList.remove('active'));
    chip.classList.add('active');
    invFilter = chip.dataset.cat;
    renderInventory();
  });
}

function renderCheckouts(){
  const activeCount = checkouts.filter(c=>!c.returned).length;
  const overdueCount = checkouts.filter(c=>!c.returned && c.overdue).length;
  document.getElementById('coSub').textContent = `${activeCount} active · ${overdueCount} overdue`;
  document.getElementById('coAlert').style.display = overdueCount>0 ? 'flex' : 'none';
  document.getElementById('coAlertText').textContent = `${overdueCount} checkout${overdueCount===1?'':'s'} past due date`;

  const body = document.getElementById('coBody');
  if(!checkouts.length){ body.innerHTML = '<tr><td colspan="8" class="dim">No checkouts yet.</td></tr>'; return; }

  const isAdmin = currentProfile?.role === 'admin';
  body.innerHTML = checkouts.map((c,idx)=>`
    <tr class="${c.returned?'done-row':''}">
      <td class="mono">${c.ref}</td>
      <td class="strong">${c.name}</td>
      <td>${c.athlete}</td>
      <td class="dim">${c.team||'-'}</td>
      <td class="mono dim">${c.out}</td>
      <td class="mono ${c.overdue && !c.returned?'due-warn':'dim'}">${c.overdue && !c.returned?'⚠ ':''}${c.due}</td>
      <td class="strong">${c.qty}</td>
      <td>${c.returned ? '<span class="pill returned">✓ Returned</span>' :
        (isAdmin ? `<button class="btn btn-orange" data-id="${c.id}" data-qty="${c.qty}">Mark Returned</button>` :
        `<span class="pill checkedout">Out</span>`)}</td>
    </tr>`).join('');

  document.querySelectorAll('#coBody button[data-id]').forEach(b=>{
    b.addEventListener('click', (ev)=>markReturned(b.dataset.id, Number(b.dataset.qty), ev));
  });
}

async function markReturned(checkoutId, qty, ev){
  const btn = ev?.target;
  if(btn) btn.disabled = true; btn.textContent = 'RETURNING...';

  const { data: co } = await supabaseClient.from('checkouts').select('equipment_id').eq('id', checkoutId).single();
  if(!co){ alert('Could not find checkout'); return; }

  await supabaseClient.from('checkouts').update({
    status: 'returned',
    returned_at: new Date().toISOString(),
    returned_by: currentProfile.id
  }).eq('id', checkoutId);

  if(co.equipment_id){
    await supabaseClient.rpc('increment_equipment_qty', { equipment_uuid: co.equipment_id, qty_increment: qty });
  }

  await loadAllData();
}

function renderMaintenance(){
  const pending = maintenanceData.filter(m=>!m.done).length;
  const done = maintenanceData.filter(m=>m.done).length;
  document.getElementById('maintSub').textContent = `${pending} pending · ${done} completed`;
  const grid = document.getElementById('maintGrid');
  if(currentProfile?.role !== 'admin'){
    grid.innerHTML = '<div class="panel"><div class="dim">Maintenance view is admin-only.</div></div>';
    return;
  }
  if(!maintenanceData.length){ grid.innerHTML = '<div class="dim">No maintenance tasks.</div>'; return; }
  const colorMap = {high:'var(--red)', medium:'var(--yellow)', low:'var(--blue)'};
  const isAdmin = currentProfile?.role === 'admin';
  grid.innerHTML = maintenanceData.map((m,idx)=>`
    <div class="maint-card ${m.done?'done':''}" style="--maint-color:${colorMap[m.priority]}">
      <div class="maint-top">
        <div>
          <div class="maint-name">${m.name}</div>
          <div class="maint-type">${m.type}</div>
        </div>
        <span class="badge-priority ${m.priority}">${m.priority.toUpperCase()}</span>
      </div>
      <div class="maint-bottom">
        <div class="maint-meta">Scheduled <span class="sched-date">${m.sched}</span><span class="tech-label">Technician ${m.tech}</span></div>
        ${m.done ? '<span class="done-check">✓ DONE</span>' :
          (isAdmin ? `<button class="btn btn-green" data-id="${m.id}" data-idx="${idx}">Mark Complete</button>` : '')}
      </div>
    </div>`).join('');

  document.querySelectorAll('#maintGrid button[data-id]').forEach(b=>{
    b.addEventListener('click', (ev)=>markMaintenanceDone(b.dataset.id, +b.dataset.idx, ev));
  });
}

async function markMaintenanceDone(maintId, idx, ev){
  const btn = ev?.target;
  if(btn) btn.disabled = true; btn.textContent = 'SAVING...';
  await supabaseClient.from('maintenance').update({
    status: 'completed',
    completed_at: new Date().toISOString()
  }).eq('id', maintId);
  await loadAllData();
}

function renderProcurement(){
  const grid = document.getElementById('poGrid');
  if(currentProfile?.role !== 'admin'){
    grid.innerHTML = '<div class="panel"><div class="dim">Procurement view is admin-only.</div></div>';
    const pendingPOs = purchaseOrders.filter(p=>p.stage !== 'Received' && p.stage !== 'Cancelled');
    const total = purchaseOrders.reduce((s,p)=>s+parseFloat(String(p.cost).replace(/[^\d.]/g,''))||0, 0);
    document.getElementById('procSub').textContent = `${pendingPOs.length} pending orders · ${total.toLocaleString()} total`;
    return;
  }
  if(!purchaseOrders.length){ grid.innerHTML = '<div class="dim">No purchase orders.</div>'; return; }
  const pendingPOs = purchaseOrders.filter(p=>p.stage !== 'Received' && p.stage !== 'Cancelled');
  const total = purchaseOrders.reduce((s,p)=>s+parseFloat(String(p.cost).replace(/[^\d.]/g,''))||0, 0);
  document.getElementById('procSub').textContent = `${pendingPOs.length} pending orders · ${total.toLocaleString()} total`;
  grid.innerHTML = purchaseOrders.map(p=>`
    <div class="po-card">
      <div class="po-left">
        <div class="po-id">${p.id}</div>
        <div>
          <div class="po-name">${p.name}</div>
          <div class="po-sub">${p.sub}</div>
        </div>
      </div>
      <div class="po-right">
        <span class="pill maintenance">${p.stage}</span>
        <div class="po-cost">${p.cost}</div>
      </div>
    </div>`).join('');
}

(async function init(){
  const { data: { session } } = await supabaseClient.auth.getSession();
  if(session && session.user){
    currentUser = session.user;
    await loadCurrentProfile();
    showAppShell();
    await loadAllData();
  } else {
    showAuthScreen();
  }
})();
