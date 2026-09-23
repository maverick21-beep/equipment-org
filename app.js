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
let borrowRequests = [];
let checkoutCount = 1;
let invFilter = 'ALL';
let checkoutFilter = 'all';
let checkoutSearchTerm = '';
let currentEditEquipmentId = null;
let selectedBorrowEquipment = null;

// =====================================================
// AUTH FUNCTIONS
// =====================================================
let authMode = 'login';

function showAuthError(msg){
  const el = document.getElementById('authError');
  if(!el) return;
  el.textContent = msg;
  el.classList.add('show');
}

function clearAuthError(){
  const el = document.getElementById('authError');
  if(el) el.classList.remove('show');
}

function resetAuthButton(){
  const btn = document.getElementById('authBtn');
  if(!btn) return;
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
  if(el) el.addEventListener('keydown', e=>{
    if(e.key === 'Enter') document.getElementById('authBtn').click();
  });
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
  const loadingView = document.getElementById('loadingView');
  const appShell = document.getElementById('appShell');
  const authView = document.getElementById('authView');
  if(loadingView) loadingView.classList.remove('active');
  if(appShell) appShell.style.display = 'none';
  if(authView) authView.classList.add('active');
}

function showAppShell(){
  const loadingView = document.getElementById('loadingView');
  const authView = document.getElementById('authView');
  const appShell = document.getElementById('appShell');
  if(loadingView) loadingView.classList.remove('active');
  if(authView) authView.classList.remove('active');
  if(appShell) appShell.style.display = 'block';

  const tag = document.getElementById('roleTag');
  if(tag){
    tag.textContent = (currentProfile?.role || 'user').toUpperCase();
    tag.style.color = currentProfile?.role === 'admin' ? 'var(--orange)' : 'var(--text-dim)';
  }

  const name = currentProfile?.full_name || currentUser?.email || 'U';
  const initials = name.split(/\s+/).map(s=>s[0]).join('').slice(0,2).toUpperCase();
  const avatar = document.getElementById('userAvatar');
  if(avatar) avatar.textContent = initials;

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
    loadBorrowRequests(),
    loadMaintenance(),
    loadProcurement()
  ]);
  renderCategories();
  renderDashCheckouts();
  renderInventory();
  renderBorrowRequests();
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
    .select('*, category:equipment_categories(name, id)')
    .order('sku');

  data = data || [];
  inventory = data.map(e => ({
    id: e.id,
    sku: e.sku,
    name: e.name,
    cat: e.category?.name || 'Uncategorized',
    categoryId: e.category_id || e.category?.id || null,
    have: e.available_qty,
    total: e.total_qty,
    cond: e.condition,
    loc: e.location,
    rawStatus: e.status,
    status: mapEquipStatus(e.status, e.available_qty, e.total_qty)
  }));

  categories = equipmentCategories.map(c => {
    const items = inventory.filter(i => i.cat === c.name);
    return { name: c.name, have: items.reduce((s,i)=>s+i.have,0), total: items.reduce((s,i)=>s+i.total,0) };
  }).filter(c => c.total > 0);

  const filtersDiv = document.getElementById('invFilters');
  if(filtersDiv){
    filtersDiv.innerHTML = `<button class="chip active" data-cat="ALL">ALL</button>` +
      categories.map(c=>`<button class="chip" data-cat="${c.name}">${c.name.toUpperCase()}</button>`).join('');
    attachInventoryFilters();
  }
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

async function loadBorrowRequests(){
  const isAdmin = currentProfile?.role === 'admin';
  let query = supabaseClient
    .from('borrow_requests')
    .select('*, items:borrow_request_items(*, equipment:equipment(id, name, available_qty, total_qty)), profile:profiles(id, full_name, email)')
    .order('created_at', { ascending: false });

  if(!isAdmin){
    query = query.eq('user_id', currentUser.id);
  }

  const { data, error } = await query;

  if(error){ console.error(error); borrowRequests = []; return; }

  borrowRequests = (data || []).map(req => ({
    id: req.id,
    userId: req.user_id,
    borrower: req.profile?.full_name || req.profile?.email || 'Unknown user',
    email: req.profile?.email || '',
    organizationName: req.organization_name || 'General use',
    status: req.status,
    purpose: req.purpose || 'No purpose provided',
    createdAt: req.created_at,
    items: (req.items || []).map(item => ({
      id: item.id,
      equipmentId: item.equipment_id,
      equipmentName: item.equipment?.name || 'Equipment',
      qty: item.qty,
      borrowDate: item.borrow_date,
      dueDate: item.expected_return_date,
      availableQty: item.equipment?.available_qty ?? 0,
      totalQty: item.equipment?.total_qty ?? 0
    }))
  }));
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
  const poCount = document.getElementById('poCount');
  if(poCount) poCount.textContent = data.filter(p => p.status !== 'received' && p.status !== 'cancelled').length;
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
const tabsEl = document.getElementById('tabs');
if(tabsEl){
  tabsEl.addEventListener('click', e=>{
    const btn = e.target.closest('button[data-view]');
    if(!btn) return;
    document.querySelectorAll('nav.tabs button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    const target = document.getElementById('view-'+btn.dataset.view);
    if(target) target.classList.add('active');
  });
}

// =====================================================
// RENDERERS
// =====================================================
function condClass(c){ return c.toLowerCase(); }
function statusClass(s){ return s.toLowerCase().replace(' ',''); }

function renderCategories(){
  const el = document.getElementById('catRows');
  if(!el) return;
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
  if(!el) return;
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
  const overdueFoot = document.getElementById('dashOverdueFoot');
  if(overdueFoot) overdueFoot.textContent = overdueCount + ' overdue';

  const pending = maintenanceData.filter(m=>!m.done).length;
  if(statCards[3]) statCards[3].textContent = pending;

  const overduePill = document.getElementById('overduePill');
  if(overduePill) overduePill.textContent = overdueCount + ' OVERDUE';

  const availPct = totalEquip ? Math.round((availEquip/totalEquip)*100) : 0;
  const availFoot = document.querySelectorAll('.stat-card .stat-foot');
  if(availFoot[1]) availFoot[1].textContent = availPct + '% of inventory';
}

function renderInventory(){
  const rows = invFilter==='ALL' ? inventory : inventory.filter(i=>i.cat===invFilter);
  const sub = document.getElementById('invSub');
  if(sub) sub.textContent = `${inventory.length} items · Loaded from Supabase`;

  const body = document.getElementById('invBody');
  if(!body) return;
  if(!rows.length){ body.innerHTML = '<tr><td colspan="7" class="dim">No items found.</td></tr>'; return; }

  const isAdmin = currentProfile?.role === 'admin';
  body.innerHTML = rows.map(i=>`
    <tr>
      <td class="mono">${i.sku}</td>
      <td class="strong">${i.name}</td>
      <td class="dim">${i.cat}</td>
      <td><strong>${i.have}</strong><span class="dim">/${i.total}</span></td>
      <td><span class="cond ${condClass(i.cond)}">${i.cond}</span></td>
      <td class="dim">${i.loc}</td>
      <td><span class="pill ${statusClass(i.status)}">${i.status}</span></td>
      <td>
        ${isAdmin ?
          '<button type="button" class="inventory-edit-btn" data-action="edit-equipment" data-id="'+i.id+'">Edit</button>' :
          '<button type="button" class="inventory-edit-btn" data-action="request-borrow" data-id="'+i.id+'" '+(i.have <= 0 ? 'disabled' : '')+'>Borrow</button>'}
      </td>
    </tr>`).join('');
}

function attachInventoryFilters(){
  const filterBar = document.getElementById('invFilters');
  if(!filterBar) return;
  filterBar.addEventListener('click', e=>{
    const chip = e.target.closest('.chip');
    if(!chip) return;
    document.querySelectorAll('#invFilters .chip').forEach(c=>c.classList.remove('active'));
    chip.classList.add('active');
    invFilter = chip.dataset.cat;
    renderInventory();
  });
}

function renderBorrowRequests(){
  const body = document.getElementById('borrowRequestsBody');
  if(!body) return;

  const isAdmin = currentProfile?.role === 'admin';
  const visibleRequests = isAdmin
    ? borrowRequests.filter(r => r.status === 'pending')
    : borrowRequests;

  if(!visibleRequests.length){
    const emptyMessage = isAdmin
      ? 'No equipment reservations waiting for approval.'
      : 'You have no equipment requests yet. Choose Borrow on an item to submit one.';
    body.innerHTML = `<tr><td colspan="8" class="dim">${emptyMessage}</td></tr>`;
    return;
  }

  body.innerHTML = visibleRequests.map(req => {
    const firstItem = req.items[0] || {};
    const itemText = req.items.map(item => `${item.equipmentName} (${item.qty})`).join(', ');
    const statusClass = req.status === 'approved' ? 'available' : req.status === 'rejected' ? 'maintenance' : 'maintenance';

    return `
      <tr>
        <td>
          <div class="strong">${req.borrower}</div>
          <div class="mono dim">${req.email || req.organizationName}</div>
        </td>
        <td>${itemText}</td>
        <td>${req.items.reduce((sum, item) => sum + Number(item.qty || 0), 0)}</td>
        <td class="mono dim">${firstItem.borrowDate || '—'}</td>
        <td class="mono dim">${firstItem.dueDate || '—'}</td>
        <td>
          <div class="strong">${req.purpose}</div>
          <div class="mono dim">${req.organizationName}</div>
        </td>
        <td><span class="pill ${statusClass}">${req.status}</span></td>
        <td>
          ${isAdmin ? `
            <div class="inventory-status-cell">
              <button type="button" class="btn btn-green" data-request-action="approve" data-request-id="${req.id}">Approve</button>
              <button type="button" class="btn btn-secondary" data-request-action="reject" data-request-id="${req.id}">Reject</button>
            </div>` : '<span class="dim">—</span>'}
        </td>
      </tr>`;
  }).join('');

  document.querySelectorAll('[data-request-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const requestId = btn.getAttribute('data-request-id');
      const action = btn.getAttribute('data-request-action');
      if(action === 'approve') {
        await approveBorrowRequest(requestId);
      } else {
        await rejectBorrowRequest(requestId);
      }
    });
  });
}

async function approveBorrowRequest(requestId){
  const request = borrowRequests.find(r => r.id === requestId);
  if(!request) return;

  const itemResults = [];
  for(const item of request.items){
    const { data: equipmentData } = await supabaseClient
      .from('equipment')
      .select('*')
      .eq('id', item.equipmentId)
      .single();

    if(!equipmentData){
      alert(`Equipment not found for ${item.equipmentName}.`);
      return;
    }

    if(item.qty > equipmentData.available_qty){
      alert(`Not enough inventory for ${item.equipmentName}. Requested ${item.qty}, available ${equipmentData.available_qty}.`);
      return;
    }

    itemResults.push({
      equipmentId: item.equipmentId,
      name: item.equipmentName,
      qty: item.qty,
      dueDate: item.dueDate,
      itemId: item.id
    });
  }

  const { data: requestProfile } = await supabaseClient
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', request.userId)
    .maybeSingle();

  const borrowerName = requestProfile?.full_name || requestProfile?.email || request.borrower;

  for(const item of itemResults){
    const { data: equipmentData, error: equipmentError } = await supabaseClient
      .from('equipment')
      .select('available_qty')
      .eq('id', item.equipmentId)
      .single();

    if(equipmentError || !equipmentData){
      console.error(equipmentError);
      alert('Failed to load equipment stock before approval.');
      return;
    }

    const { error: checkoutError } = await supabaseClient.from('checkouts').insert({
      equipment_id: item.equipmentId,
      user_id: request.userId,
      user_name: borrowerName,
      user_team: null,
      qty: item.qty,
      checked_out_at: new Date().toISOString(),
      due_date: item.dueDate || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      status: 'checked_out',
      processed_by: currentUser.id
    });

    if(checkoutError){
      console.error(checkoutError);
      alert('Failed to create checkout record.');
      return;
    }

    const newAvailableQty = Math.max(0, Number(equipmentData.available_qty) - Number(item.qty));
    const { error: stockError } = await supabaseClient
      .from('equipment')
      .update({
        available_qty: newAvailableQty,
        updated_at: new Date().toISOString()
      })
      .eq('id', item.equipmentId);

    if(stockError){
      console.error(stockError);
      alert('Checkout approved but inventory update failed.');
      return;
    }
  }

  const { error: updateRequestError } = await supabaseClient
    .from('borrow_requests')
    .update({ status: 'approved', reviewed_by: currentUser.id, reviewed_at: new Date().toISOString() })
    .eq('id', requestId);

  if(updateRequestError){
    console.error(updateRequestError);
    alert('Approval saved, but the reservation status could not be updated.');
    return;
  }

  await loadAllData();
}

async function rejectBorrowRequest(requestId){
  const { error } = await supabaseClient
    .from('borrow_requests')
    .update({ status: 'rejected', reviewed_by: currentUser.id, reviewed_at: new Date().toISOString() })
    .eq('id', requestId);

  if(error){
    console.error(error);
    alert('Failed to reject reservation.');
    return;
  }

  await loadAllData();
}

function getFilteredCheckouts(){
  const searchValue = checkoutSearchTerm.trim().toLowerCase();
  return checkouts.filter(c => {
    let matchesFilter = true;

    if(checkoutFilter === 'active') {
      matchesFilter = !c.returned;
    } else if(checkoutFilter === 'overdue') {
      matchesFilter = !c.returned && c.overdue;
    } else if(checkoutFilter === 'returned') {
      matchesFilter = c.returned;
    }

    if(!searchValue) return matchesFilter;

    const searchText = `${c.athlete} ${c.name} ${c.team} ${c.ref}`.toLowerCase();
    return matchesFilter && searchText.includes(searchValue);
  });
}

function renderCheckouts(){
  const activeCount = checkouts.filter(c=>!c.returned).length;
  const overdueCount = checkouts.filter(c=>!c.returned && c.overdue).length;
  const filtered = getFilteredCheckouts();
  const sub = document.getElementById('coSub');
  if(sub) sub.textContent = `${filtered.length} shown · ${overdueCount} overdue`;
  const alertBox = document.getElementById('coAlert');
  if(alertBox) alertBox.style.display = overdueCount>0 ? 'flex' : 'none';
  const alertText = document.getElementById('coAlertText');
  if(alertText) alertText.textContent = `${overdueCount} checkout${overdueCount===1?'':'s'} past due date`;

  const body = document.getElementById('coBody');
  if(!body) return;
  if(!filtered.length){ body.innerHTML = '<tr><td colspan="8" class="dim">No matching checkouts found.</td></tr>'; return; }

  const isAdmin = currentProfile?.role === 'admin';
  body.innerHTML = filtered.map(c=>`
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

const checkoutFilterSelect = document.getElementById('checkoutFilter');
if(checkoutFilterSelect){
  checkoutFilterSelect.addEventListener('change', e => {
    checkoutFilter = e.target.value;
    renderCheckouts();
  });
}

const checkoutSearchInput = document.getElementById('checkoutSearch');
if(checkoutSearchInput){
  checkoutSearchInput.addEventListener('input', e => {
    checkoutSearchTerm = e.target.value;
    renderCheckouts();
  });
}

async function markReturned(checkoutId, qty, ev){
  const btn = ev?.target;
  if(btn){ btn.disabled = true; btn.textContent = 'RETURNING...'; }

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
  const maintSub = document.getElementById('maintSub');
  if(maintSub) maintSub.textContent = `${pending} pending · ${done} completed`;

  const grid = document.getElementById('maintGrid');
  if(!grid) return;
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
  if(btn){ btn.disabled = true; btn.textContent = 'SAVING...'; }
  await supabaseClient.from('maintenance').update({
    status: 'completed',
    completed_at: new Date().toISOString()
  }).eq('id', maintId);
  await loadAllData();
}

function renderProcurement(){
  const grid = document.getElementById('poGrid');
  if(!grid) return;

  if(currentProfile?.role !== 'admin'){
    grid.innerHTML = '<div class="panel"><div class="dim">Procurement view is admin-only.</div></div>';
    const pendingPOs = purchaseOrders.filter(p=>p.stage !== 'Received' && p.stage !== 'Cancelled');
    const total = purchaseOrders.reduce((s,p)=>s+parseFloat(String(p.cost).replace(/[^\d.]/g,''))||0, 0);
    const procSub = document.getElementById('procSub');
    if(procSub) procSub.textContent = `${pendingPOs.length} pending orders · ${total.toLocaleString()} total`;
    return;
  }

  if(!purchaseOrders.length){ grid.innerHTML = '<div class="dim">No purchase orders.</div>'; return; }
  const pendingPOs = purchaseOrders.filter(p=>p.stage !== 'Received' && p.stage !== 'Cancelled');
  const total = purchaseOrders.reduce((s,p)=>s+parseFloat(String(p.cost).replace(/[^\d.]/g,''))||0, 0);
  const procSub = document.getElementById('procSub');
  if(procSub) procSub.textContent = `${pendingPOs.length} pending orders · ${total.toLocaleString()} total`;

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

// =====================================================
// ADMIN INVENTORY EDIT MODAL
// =====================================================
function openEquipmentModal(equipmentId){
  const item = inventory.find(i => i.id === equipmentId);
  if(!item) return;

  currentEditEquipmentId = equipmentId;
  const categorySelect = document.getElementById('editEquipmentCategory');
  categorySelect.innerHTML = equipmentCategories.map(cat =>
    `<option value="${cat.id}" ${cat.name === item.cat ? 'selected' : ''}>${cat.name}</option>`
  ).join('');

  document.getElementById('editEquipmentName').value = item.name;
  document.getElementById('editEquipmentAvailable').value = item.have;
  document.getElementById('editEquipmentTotal').value = item.total;
  document.getElementById('editEquipmentCondition').value = item.cond;
  document.getElementById('editEquipmentLocation').value = item.loc;
  document.getElementById('editEquipmentStatus').value = item.rawStatus || 'available';

  document.getElementById('adminEditModal').classList.remove('hidden');
  document.getElementById('adminEditModal').setAttribute('aria-hidden', 'false');
}

function closeEquipmentModal(){
  document.getElementById('adminEditModal').classList.add('hidden');
  document.getElementById('adminEditModal').setAttribute('aria-hidden', 'true');
  currentEditEquipmentId = null;
}

document.addEventListener('click', e => {
  const editTrigger = e.target.closest('[data-action="edit-equipment"]');
  if(editTrigger){
    openEquipmentModal(editTrigger.dataset.id);
    return;
  }

  const borrowTrigger = e.target.closest('[data-action="request-borrow"]');
  if(borrowTrigger){
    openBorrowModal(borrowTrigger.dataset.id);
    return;
  }

  if(e.target.matches('[data-close="true"]') || e.target.id === 'closeEditModal' || e.target.id === 'cancelEditModal'){
    closeEquipmentModal();
  }

  if(e.target.matches('[data-close-borrow="true"]') || e.target.id === 'closeBorrowModal' || e.target.id === 'cancelBorrowModal'){
    closeBorrowModal();
  }
});

function openBorrowModal(equipmentId){
  const item = inventory.find(i => i.id === equipmentId);
  if(!item) return;

  selectedBorrowEquipment = item;
  const form = document.getElementById('borrowForm');
  const today = new Date().toISOString().slice(0, 10);
  const maxDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  document.getElementById('borrowEquipmentName').value = `${item.name} (${item.have} available)`;
  document.getElementById('borrowQty').value = '1';
  document.getElementById('borrowQty').max = String(item.have);
  document.getElementById('borrowOrganization').value = '';
  document.getElementById('borrowPurpose').value = '';
  document.getElementById('borrowStartDate').value = today;
  document.getElementById('borrowEndDate').value = maxDate;

  if(form) form.reset();
  document.getElementById('borrowEquipmentName').value = `${item.name} (${item.have} available)`;
  document.getElementById('borrowQty').value = '1';
  document.getElementById('borrowQty').max = String(item.have);
  document.getElementById('borrowStartDate').value = today;
  document.getElementById('borrowEndDate').value = maxDate;

  document.getElementById('borrowModal').classList.remove('hidden');
  document.getElementById('borrowModal').setAttribute('aria-hidden', 'false');
}

function closeBorrowModal(){
  const modal = document.getElementById('borrowModal');
  if(modal){
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }
  selectedBorrowEquipment = null;
  document.getElementById('borrowForm')?.reset();
}

document.getElementById('borrowForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if(!selectedBorrowEquipment){ return; }

  const form = event.currentTarget;
  const qty = Number(form.borrowQty.value);
  const startDate = form.borrowStartDate.value;
  const endDate = form.borrowEndDate.value;
  const purpose = form.borrowPurpose.value.trim();
  const organizationName = form.borrowOrganization.value.trim();

  if(!qty || qty < 1){
    alert('Please enter a valid quantity.');
    return;
  }

  if(qty > selectedBorrowEquipment.have){
    alert(`Only ${selectedBorrowEquipment.have} item(s) are available for ${selectedBorrowEquipment.name}.`);
    return;
  }

  if(!purpose || !organizationName){
    alert('Please complete the purpose and organization details.');
    return;
  }

  if(endDate < startDate){
    alert('End date must be after the start date.');
    return;
  }

  const { data: requestData, error: requestError } = await supabaseClient
    .from('borrow_requests')
    .insert({
      user_id: currentUser.id,
      purpose,
      organization_name: organizationName,
      status: 'pending'
    })
    .select()
    .single();

  if(requestError){
    console.error(requestError);
    alert(requestError.message || 'Failed to submit the borrow request.');
    return;
  }

  const { error: itemError } = await supabaseClient.from('borrow_request_items').insert({
    request_id: requestData.id,
    equipment_id: selectedBorrowEquipment.id,
    qty,
    borrow_date: startDate,
    expected_return_date: endDate
  });

  if(itemError){
    console.error(itemError);
    alert(itemError.message || 'Failed to add equipment details to the borrow request.');
    return;
  }

  closeBorrowModal();
  await loadAllData();
});

document.getElementById('adminEditForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if(!currentEditEquipmentId) return;

  const form = event.currentTarget;
  const availableQty = Number(form.availableStock.value);
  const totalQty = Number(form.totalStock.value);

  if(totalQty < availableQty){
    alert('Total stock cannot be less than available stock.');
    return;
  }

  const payload = {
    name: form.equipmentName.value.trim(),
    category_id: form.equipmentCategory.value,
    available_qty: availableQty,
    total_qty: totalQty,
    condition: form.condition.value,
    location: form.location.value.trim(),
    status: form.status.value
  };

  const { error } = await supabaseClient.from('equipment').update(payload).eq('id', currentEditEquipmentId);
  if(error){
    console.error(error);
    alert(error.message || 'Failed to update equipment.');
    return;
  }

  closeEquipmentModal();
  await loadAllData();
});

// =====================================================
// INIT
// =====================================================
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
