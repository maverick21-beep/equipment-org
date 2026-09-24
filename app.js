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
let returnRequests = [];
let checkoutCount = 1;
let invFilter = 'ALL';
let checkoutFilter = 'all';
let checkoutSearchTerm = '';
let currentEditEquipmentId = null;
let selectedBorrowEquipment = null;
let currentFinishMaintenance = null;
let currentReturnCheckout = null;
let currentAdminReturnRequest = null;
let notifications = [];
let notificationChannel = null;

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

let noticeTimer = null;

function showNotice(message, type = 'info'){
  const notice = document.getElementById('appNotice');
  if(!notice) return;
  clearTimeout(noticeTimer);
  notice.textContent = message;
  notice.className = `app-notice show ${type}`;
  noticeTimer = setTimeout(() => {
    notice.classList.remove('show');
  }, 5000);
}

function formatNotificationTime(value){
  const date = new Date(value);
  if(Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], { dateStyle:'medium', timeStyle:'short' });
}

function renderNotifications(){
  const list = document.getElementById('notificationList');
  const count = document.getElementById('notificationCount');
  if(!list || !count) return;

  const unread = notifications.filter(item => !item.read_at).length;
  count.textContent = unread > 99 ? '99+' : String(unread);
  count.hidden = unread === 0;

  if(!notifications.length){
    list.innerHTML = '<div class="notification-empty">No notifications yet.</div>';
    return;
  }

  list.innerHTML = notifications.map(item => `
    <div class="notification-item ${item.read_at ? '' : 'unread'}" data-notification-id="${item.id}">
      <div class="notification-title">${item.title}</div>
      <div class="notification-message">${item.message}</div>
      <div class="notification-time">${formatNotificationTime(item.created_at)}</div>
    </div>`).join('');
}

async function loadNotifications(){
  if(!currentUser) return;
  const { data, error } = await supabaseClient
    .from('notifications')
    .select('*')
    .eq('recipient_id', currentUser.id)
    .order('created_at', { ascending:false })
    .limit(50);
  if(error){ console.error('Notifications could not be loaded:', error); return; }
  notifications = data || [];
  renderNotifications();
}

function stopNotificationUpdates(){
  if(notificationChannel){
    supabaseClient.removeChannel(notificationChannel);
    notificationChannel = null;
  }
  notifications = [];
  renderNotifications();
}

async function startNotificationUpdates(){
  await loadNotifications();
  if(notificationChannel || !currentUser) return;
  notificationChannel = supabaseClient
    .channel(`notifications:${currentUser.id}`)
    .on('postgres_changes', {
      event:'INSERT', schema:'public', table:'notifications',
      filter:`recipient_id=eq.${currentUser.id}`
    }, payload => {
      notifications = [payload.new, ...notifications.filter(item => item.id !== payload.new.id)].slice(0, 50);
      renderNotifications();
      showNotice(payload.new.title, 'info');
    })
    .subscribe(status => {
      if(status === 'CHANNEL_ERROR') console.error('Notification realtime subscription failed.');
    });
}

document.getElementById('notificationButton')?.addEventListener('click', event => {
  event.stopPropagation();
  const panel = document.getElementById('notificationPanel');
  const button = event.currentTarget;
  const open = panel?.classList.toggle('hidden') === false;
  button.setAttribute('aria-expanded', String(open));
  panel?.setAttribute('aria-hidden', String(!open));
});

document.getElementById('notificationList')?.addEventListener('click', async event => {
  const item = event.target.closest('[data-notification-id]');
  if(!item) return;
  const notification = notifications.find(entry => entry.id === item.dataset.notificationId);
  if(!notification || notification.read_at) return;
  const { error } = await supabaseClient.from('notifications').update({ read_at:new Date().toISOString() }).eq('id', notification.id);
  if(error){ console.error(error); return; }
  notification.read_at = new Date().toISOString();
  renderNotifications();
});

document.getElementById('markAllNotifications')?.addEventListener('click', async () => {
  const unreadIds = notifications.filter(item => !item.read_at).map(item => item.id);
  if(!unreadIds.length || !currentUser) return;
  const { error } = await supabaseClient.from('notifications').update({ read_at:new Date().toISOString() }).in('id', unreadIds);
  if(error){ console.error(error); return; }
  notifications.forEach(item => { if(!item.read_at) item.read_at = new Date().toISOString(); });
  renderNotifications();
});

document.addEventListener('click', event => {
  if(event.target.closest('.notification-wrap')) return;
  const panel = document.getElementById('notificationPanel');
  const button = document.getElementById('notificationButton');
  if(panel && !panel.classList.contains('hidden')){
    panel.classList.add('hidden');
    panel.setAttribute('aria-hidden', 'true');
    button?.setAttribute('aria-expanded', 'false');
  }
});

function setButtonProcessing(button, processingText){
  if(!button) return () => {};
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = processingText;
  return () => {
    button.disabled = false;
    button.textContent = originalText;
  };
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
    await startNotificationUpdates();
  } else {
    stopNotificationUpdates();
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
    loadReturnRequests(),
    loadMaintenance(),
    loadProcurement()
  ]);
  renderCategories();
  renderDashCheckouts();
  renderInventory();
  renderBorrowRequests();
  renderReturnRequests();
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
    maintenanceQty: e.maintenance_qty || 0,
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
    .select('*, equipment:equipment(name, sku), request_item:borrow_request_items(request:borrow_requests(purpose, organization_name)), returnRequests:return_requests(id, status, quantity, requested_at, rejection_reason)')
    .order('checked_out_at', { ascending: false });
  data = data || [];
  const today = new Date();
  today.setHours(0,0,0,0);
  checkouts = data.map((c, idx) => {
    const requestItem = Array.isArray(c.request_item) ? c.request_item[0] : c.request_item;
    const request = Array.isArray(requestItem?.request) ? requestItem.request[0] : requestItem?.request;
    const checkoutReturnRequests = Array.isArray(c.returnRequests) ? c.returnRequests : c.returnRequests ? [c.returnRequests] : [];
    const returnRequest = checkoutReturnRequests.sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at))[0];
    const due = new Date(c.due_date); due.setHours(0,0,0,0);
    const overdue = c.status === 'checked_out' && due < today;
    return {
      id: c.id,
      ref: `C${String(idx+1).padStart(3,'0')}`,
      name: c.equipment?.name || 'Unknown item',
      athlete: c.user_name,
      team: c.user_team || '',
      organizationName: request?.organization_name || c.user_team || '—',
      purpose: request?.purpose || '—',
      out: (c.checked_out_at || '').slice(0,10),
      due: c.due_date,
      qty: c.qty,
      overdue,
      returned: c.status === 'returned',
      returnRequestId: returnRequest?.id || null,
      returnStatus: returnRequest?.status || null,
      returnQuantity: returnRequest?.quantity || 0,
      returnReason: returnRequest?.rejection_reason || ''
    };
  });
  checkoutCount = checkouts.length;
}

async function loadReturnRequests(){
  if(currentProfile?.role !== 'admin'){
    returnRequests = [];
    return;
  }

  const { data, error } = await supabaseClient
    .from('return_requests')
    .select(`*, checkout:checkouts(id, equipment_id, user_id, user_name, qty, checked_out_at, due_date, status, equipment:equipment(name, sku)), profile:profiles!return_requests_user_id_fkey(full_name, email)`)
    .eq('status', 'pending')
    .order('requested_at', { ascending: false });

  if(error){
    console.error(error);
    returnRequests = [];
    return;
  }

  returnRequests = (data || []).map(request => ({
    id: request.id,
    checkoutId: request.checkout_id,
    borrower: request.profile?.full_name || request.profile?.email || request.checkout?.user_name || 'Unknown user',
    email: request.profile?.email || '',
    equipmentName: request.checkout?.equipment?.name || 'Unknown item',
    ref: request.checkout?.equipment?.sku || '—',
    quantity: request.quantity,
    checkoutQuantity: request.checkout?.qty || 0,
    checkedOutAt: request.checkout?.checked_out_at || '',
    dueDate: request.checkout?.due_date || '—',
    requestedAt: request.requested_at,
    status: request.status,
    rejectionReason: request.rejection_reason || ''
  }));
}

async function loadBorrowRequests(){
  const isAdmin = currentProfile?.role === 'admin';
  // disambiguate profiles relationship: borrow_requests has two fkeys to profiles
  // use the user_id foreign key relationship for the requester's profile
  let query = supabaseClient
    .from('borrow_requests')
    .select(`*, items:borrow_request_items(*, equipment:equipment(id, name, available_qty, total_qty)), profile:profiles!borrow_requests_user_id_fkey(id, full_name, email)`) 
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
  console.debug('loadBorrowRequests:', { isAdmin, count: borrowRequests.length, samples: borrowRequests.slice(0,3) });
}

async function loadMaintenance(){
  if(currentProfile?.role !== 'admin'){ maintenanceData = []; return; }
  const [{ data: taskData }, { data: equipmentData }] = await Promise.all([
    supabaseClient
    .from('maintenance')
    .select('*, equipment:equipment(id, name, sku, available_qty, total_qty, maintenance_qty, status)')
    .order('scheduled_date'),
    supabaseClient
      .from('equipment')
      .select('id, name, sku, available_qty, total_qty, maintenance_qty, status')
      .eq('status', 'maintenance')
  ]);

  const data = taskData || [];
  const rows = data.map(m => ({
    id: m.id,
    equipmentId: m.equipment_id,
    ref: m.equipment?.sku || '—',
    name: m.equipment?.name || 'Unknown',
    type: m.type,
    priority: m.priority,
    sched: m.scheduled_date,
    tech: m.technician,
    reason: m.notes || 'No maintenance details provided.',
    quantity: m.equipment?.maintenance_qty || 0,
    equipmentStatus: m.equipment?.status,
    done: m.status === 'completed' && m.equipment?.status !== 'maintenance'
  }));
  const knownEquipmentIds = new Set(rows.map(row => row.equipmentId));
  const syntheticRows = (equipmentData || [])
    .filter(item => !knownEquipmentIds.has(item.id))
    .map(item => ({
      id: null,
      equipmentId: item.id,
      ref: item.sku,
      name: item.name,
      type: 'Repair',
      priority: 'high',
      sched: null,
      tech: 'Unassigned',
      reason: 'Equipment is marked as under maintenance.',
      quantity: item.maintenance_qty || 0,
      equipmentStatus: item.status,
      done: false
    }));

  maintenanceData = [...rows, ...syntheticRows];
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
          '<button type="button" class="inventory-edit-btn" data-action="request-borrow" data-id="'+i.id+'" '+(i.have <= 0 || i.rawStatus === 'deactivated' ? 'disabled' : '')+'>Borrow</button>'}
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

  console.debug('renderBorrowRequests:', { isAdmin, visible: visibleRequests.length, recent: visibleRequests.slice(0,3) });
  if(!visibleRequests.length){
    const emptyMessage = isAdmin
      ? 'No equipment reservations waiting for approval.'
      : 'You have no equipment requests yet. Choose Borrow on an item to submit one.';
    body.innerHTML = `<tr><td colspan="9" class="dim">${emptyMessage}</td></tr>`;
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
        <td>${req.organizationName}</td>
        <td>${itemText}</td>
        <td>${req.items.reduce((sum, item) => sum + Number(item.qty || 0), 0)}</td>
        <td class="mono dim">${firstItem.borrowDate || '—'}</td>
        <td class="mono dim">${firstItem.dueDate || '—'}</td>
        <td>
          <div class="strong">${req.purpose}</div>
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
        await approveBorrowRequest(requestId, btn);
      } else {
        await rejectBorrowRequest(requestId, btn);
      }
    });
  });
}

function renderReturnRequests(){
  const panel = document.getElementById('returnVerificationPanel');
  const body = document.getElementById('returnRequestsBody');
  if(!panel || !body) return;

  if(currentProfile?.role !== 'admin' || !returnRequests.length){
    panel.style.display = 'none';
    return;
  }

  panel.style.display = '';
  body.innerHTML = returnRequests.map(request => `
    <tr>
      <td class="mono">${request.ref}</td>
      <td class="strong">${request.equipmentName}</td>
      <td>${request.borrower}</td>
      <td class="strong">${request.quantity}</td>
      <td class="mono dim">${(request.checkedOutAt || '').slice(0,10)}</td>
      <td class="mono dim">${request.dueDate}</td>
      <td class="mono dim">${(request.requestedAt || '').slice(0,10)}</td>
      <td><button type="button" class="btn btn-orange" data-return-review-id="${request.id}">Review Return</button></td>
    </tr>`).join('');

  body.querySelectorAll('[data-return-review-id]').forEach(button => {
    button.addEventListener('click', () => openAdminReturnModal(button.dataset.returnReviewId));
  });
}

async function approveBorrowRequest(requestId, button){
  const request = borrowRequests.find(r => r.id === requestId);
  console.debug('approveBorrowRequest start', { requestId, found: !!request, request });
  if(!request) return;
  const restoreButton = setButtonProcessing(button, 'APPROVING...');

  for(const item of request.items){
    const { data: equipment, error: equipmentError } = await supabaseClient
      .from('equipment')
      .select('status, available_qty')
      .eq('id', item.equipmentId)
      .single();

    if(equipmentError || !equipment){
      console.error(equipmentError);
      restoreButton();
      showNotice('Approval failed. The equipment could not be verified.', 'error');
      return;
    }

    if(equipment.status === 'maintenance'){
      restoreButton();
      showNotice('Approval failed. This equipment is currently under maintenance.', 'error');
      return;
    }

    if(equipment.status === 'deactivated'){
      restoreButton();
      showNotice('Approval failed. This equipment is no longer available.', 'error');
      return;
    }
  }

  const { data: requestProfile } = await supabaseClient
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', request.userId)
    .maybeSingle();

  const borrowerName = requestProfile?.full_name || requestProfile?.email || request.borrower;

      // Create checkout records (stock is already deducted during request)
      for(const item of request.items){
        const { error: checkoutError } = await supabaseClient.from('checkouts').insert({
          request_item_id: item.id,
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
          restoreButton();
          showNotice('Approval failed. The checkout record was not created.', 'error');
          return;
        }
      }

      const { error: updateRequestError } = await supabaseClient
    .from('borrow_requests')
    .update({ status: 'approved', reviewed_by: currentUser.id, reviewed_at: new Date().toISOString() })
    .eq('id', requestId);

  if(updateRequestError){
    console.error(updateRequestError);
    restoreButton();
    showNotice('Approval failed. The reservation status was not updated.', 'error');
    return;
  }

  await loadAllData();
  showNotice('Borrow request approved successfully.', 'success');
}

async function rejectBorrowRequest(requestId, button){
  const request = borrowRequests.find(r => r.id === requestId);
  if(!request) return;
  const restoreButton = setButtonProcessing(button, 'REJECTING...');

  const { error } = await supabaseClient
    .from('borrow_requests')
    .update({ status: 'rejected', reviewed_by: currentUser.id, reviewed_at: new Date().toISOString() })
    .eq('id', requestId);

  if(error){
    console.error(error);
    restoreButton();
    showNotice('Rejection failed. The reservation was not changed.', 'error');
    return;
  }

  // Restore the reserved stock
  for (const item of request.items) {
    const { error: restoreError } = await supabaseClient.rpc('increment_equipment_qty', { 
      equipment_uuid: item.equipmentId, 
      qty_increment: item.qty 
    });
    if(restoreError){
      console.error(restoreError);
      restoreButton();
      showNotice('The request was rejected, but stock restoration failed.', 'error');
      return;
    }
  }

  await loadAllData();
  showNotice('Borrow request rejected successfully.', 'success');
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

    const searchText = `${c.athlete} ${c.name} ${c.team} ${c.organizationName} ${c.purpose} ${c.ref}`.toLowerCase();
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
  if(!filtered.length){ body.innerHTML = '<tr><td colspan="9" class="dim">No matching checkouts found.</td></tr>'; return; }

  const isAdmin = currentProfile?.role === 'admin';
  body.innerHTML = filtered.map(c=>`
    <tr class="${c.returned?'done-row':''}">
      <td class="mono">${c.ref}</td>
      <td class="strong">${c.name}</td>
      <td>${c.athlete}</td>
      <td class="dim">${c.organizationName}</td>
      <td>${c.purpose}</td>
      <td class="mono dim">${c.out}</td>
      <td class="mono ${c.overdue && !c.returned?'due-warn':'dim'}">${c.overdue && !c.returned?'⚠ ':''}${c.due}</td>
      <td class="strong">${c.qty}</td>
      <td>${c.returned ? '<span class="pill returned">✓ Returned</span>' :
        (isAdmin ? `<button class="btn btn-orange" data-id="${c.id}" data-qty="${c.qty}">Mark Returned</button>` :
          (c.returnStatus === 'pending'
            ? '<span class="pill maintenance">Return Pending</span>'
            : `<button class="btn btn-orange" data-return-checkout-id="${c.id}">${c.returnStatus === 'rejected' ? 'Return Again' : 'Return'}</button>`))}</td>
    </tr>`).join('');

  document.querySelectorAll('#coBody button[data-id]').forEach(b=>{
    b.addEventListener('click', (ev)=>markReturned(b.dataset.id, Number(b.dataset.qty), ev));
  });
  document.querySelectorAll('#coBody button[data-return-checkout-id]').forEach(b=>{
    b.addEventListener('click', () => openReturnModal(b.dataset.returnCheckoutId));
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
  const restoreButton = setButtonProcessing(btn, 'RETURNING...');

  const { data: co, error: checkoutLookupError } = await supabaseClient.from('checkouts').select('equipment_id').eq('id', checkoutId).single();
  if(checkoutLookupError || !co){
    console.error(checkoutLookupError);
    restoreButton();
    showNotice('Return failed. The checkout could not be found.', 'error');
    return;
  }

  const { error: returnError } = await supabaseClient.from('checkouts').update({
    status: 'returned',
    returned_at: new Date().toISOString(),
    returned_by: currentProfile.id
  }).eq('id', checkoutId);

  if(returnError){
    console.error(returnError);
    restoreButton();
    showNotice('Return failed. No changes were saved.', 'error');
    return;
  }

  if(co.equipment_id){
    const { error: stockError } = await supabaseClient.rpc('increment_equipment_qty', { equipment_uuid: co.equipment_id, qty_increment: qty });
    if(stockError){
      console.error(stockError);
      showNotice('The checkout was marked returned, but stock could not be restored.', 'error');
      await loadAllData();
      return;
    }
  }

  await loadAllData();
  showNotice('Equipment returned successfully.', 'success');
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
          <div class="maint-type">${m.ref} · ${m.type}</div>
        </div>
        <span class="badge-priority ${m.priority}">${m.priority.toUpperCase()}</span>
      </div>
      <div class="maint-meta">${m.quantity > 0 ? `Quantity under maintenance <span class="sched-date">${m.quantity}</span>` : m.reason}</div>
      <div class="maint-bottom">
        <div class="maint-meta">Placed <span class="sched-date">${m.sched || '—'}</span><span class="tech-label">Technician ${m.tech}</span></div>
        ${m.done ? '<span class="done-check">✓ DONE</span>' :
          (isAdmin && m.quantity > 0 ? `<button class="btn btn-green" data-maintenance-action="finish" data-id="${m.id}" data-idx="${idx}">Finish</button>` :
            (isAdmin && m.id ? `<button class="btn btn-green" data-id="${m.id}" data-idx="${idx}">Mark Complete</button>` : ''))}
      </div>
    </div>`).join('');

  document.querySelectorAll('#maintGrid button[data-maintenance-action="finish"]').forEach(b=>{
    b.addEventListener('click', ()=>openFinishMaintenanceModal(+b.dataset.idx));
  });
  document.querySelectorAll('#maintGrid button[data-id]').forEach(b=>{
    if(b.dataset.maintenanceAction !== 'finish'){
      b.addEventListener('click', (ev)=>markMaintenanceDone(b.dataset.id, +b.dataset.idx, ev));
    }
  });
}

async function markMaintenanceDone(maintId, idx, ev){
  const btn = ev?.target;
  const restoreButton = setButtonProcessing(btn, 'SAVING...');
  const { error } = await supabaseClient.from('maintenance').update({
    status: 'completed',
    completed_at: new Date().toISOString()
  }).eq('id', maintId);

  if(error){
    console.error(error);
    restoreButton();
    showNotice('Maintenance update failed. No changes were saved.', 'error');
    return;
  }

  await loadAllData();
  showNotice('Maintenance marked complete successfully.', 'success');
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

  if(e.target.matches('[data-close-maintenance="true"]') || e.target.id === 'closeFinishMaintenanceModal' || e.target.id === 'cancelFinishMaintenanceModal'){
    closeFinishMaintenanceModal();
  }

  if(e.target.matches('[data-close-return="true"]') || e.target.id === 'closeReturnModal' || e.target.id === 'cancelReturnModal'){
    closeReturnModal();
  }

  if(e.target.matches('[data-close-admin-return="true"]') || e.target.id === 'closeAdminReturnModal'){
    closeAdminReturnModal();
  }
});

function openBorrowModal(equipmentId){
  const item = inventory.find(i => i.id === equipmentId);
  if(!item) return;

  if(item.rawStatus === 'deactivated' || item.have <= 0){
    showNotice(item.rawStatus === 'maintenance' && item.have <= 0
      ? 'This equipment is currently under maintenance and cannot be borrowed.'
      : 'This equipment is not currently available for borrowing.', 'warning');
    return;
  }

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

function openReturnModal(checkoutId){
  const checkout = checkouts.find(item => item.id === checkoutId);
  if(!checkout || checkout.returned || checkout.returnStatus === 'pending') return;

  currentReturnCheckout = checkout;
  document.getElementById('returnEquipmentName').value = checkout.name;
  document.getElementById('returnReference').value = checkout.ref;
  document.getElementById('returnCheckedOutQuantity').value = checkout.qty;
  document.getElementById('returnQuantity').value = checkout.qty;
  document.getElementById('returnQuantity').max = checkout.qty;
  document.getElementById('returnReceivedBy').value = checkout.athlete;
  document.getElementById('returnCheckedOutAt').value = checkout.out;
  document.getElementById('returnDueDate').value = checkout.due;

  const modal = document.getElementById('returnModal');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeReturnModal(){
  const modal = document.getElementById('returnModal');
  if(modal){
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }
  currentReturnCheckout = null;
  document.getElementById('returnForm')?.reset();
  const submit = document.querySelector('#returnForm button[type="submit"]');
  if(submit){ submit.disabled = false; submit.textContent = 'Request Return'; }
}

document.getElementById('returnForm').addEventListener('submit', async event => {
  event.preventDefault();
  if(!currentReturnCheckout) return;

  const quantity = Number(document.getElementById('returnQuantity').value);
  if(!Number.isInteger(quantity) || quantity < 1 || quantity > currentReturnCheckout.qty){
    showNotice(`Return quantity must be between 1 and ${currentReturnCheckout.qty}.`, 'error');
    return;
  }

  const submit = event.currentTarget.querySelector('button[type="submit"]');
  const restoreButton = setButtonProcessing(submit, 'PROCESSING...');
  const { error } = await supabaseClient.rpc('request_equipment_return', {
    checkout_uuid: currentReturnCheckout.id,
    quantity_requested: quantity
  });

  if(error){
    console.error(error);
    restoreButton();
    showNotice(/pending/i.test(error.message || '')
      ? 'A return request is already pending for this checkout.'
      : 'Return request could not be submitted. Please try again.', 'error');
    return;
  }

  closeReturnModal();
  await loadAllData();
  showNotice('Return request submitted successfully. Please wait for admin verification.', 'success');
});

function openAdminReturnModal(returnRequestId){
  const request = returnRequests.find(item => item.id === returnRequestId);
  if(!request) return;

  currentAdminReturnRequest = request;
  document.getElementById('adminReturnEquipmentName').value = request.equipmentName;
  document.getElementById('adminReturnReference').value = request.ref;
  document.getElementById('adminReturnBorrower').value = request.borrower;
  document.getElementById('adminReturnQuantity').value = request.quantity;
  document.getElementById('adminReturnCheckoutQuantity').value = request.checkoutQuantity;
  document.getElementById('adminReturnCheckedOutAt').value = request.checkedOutAt.slice(0,10);
  document.getElementById('adminReturnDueDate').value = request.dueDate;
  document.getElementById('adminReturnRequestedAt').value = request.requestedAt.slice(0,10);
  document.getElementById('adminReturnReason').value = '';

  const modal = document.getElementById('adminReturnModal');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeAdminReturnModal(){
  const modal = document.getElementById('adminReturnModal');
  if(modal){
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }
  currentAdminReturnRequest = null;
  document.getElementById('adminReturnForm')?.reset();
  const confirmButton = document.querySelector('#adminReturnForm button[type="submit"]');
  const rejectButton = document.getElementById('rejectReturnButton');
  if(confirmButton){ confirmButton.disabled = false; confirmButton.textContent = 'Confirm Return'; }
  if(rejectButton){ rejectButton.disabled = false; rejectButton.textContent = 'Reject Return'; }
}

async function reviewReturn(decision, button){
  if(!currentAdminReturnRequest) return;

  const confirmButton = document.querySelector('#adminReturnForm button[type="submit"]');
  const rejectButton = document.getElementById('rejectReturnButton');
  const restoreButton = setButtonProcessing(button, decision === 'approved' ? 'PROCESSING...' : 'PROCESSING...');
  const otherButton = button === confirmButton ? rejectButton : confirmButton;
  if(otherButton) otherButton.disabled = true;

  const { error } = await supabaseClient.rpc('review_equipment_return', {
    return_request_uuid: currentAdminReturnRequest.id,
    decision,
    rejection_reason_value: document.getElementById('adminReturnReason').value.trim() || null
  });

  if(error){
    console.error(error);
    restoreButton();
    if(otherButton) otherButton.disabled = false;
    showNotice(decision === 'approved'
      ? 'Return confirmation failed. No changes were made.'
      : 'Return request could not be processed.', 'error');
    return;
  }

  closeAdminReturnModal();
  await loadAllData();
  showNotice(decision === 'approved'
    ? 'Return confirmed successfully. The equipment has been returned to inventory.'
    : 'Return request rejected successfully.', 'success');
}

document.getElementById('adminReturnForm').addEventListener('submit', async event => {
  event.preventDefault();
  await reviewReturn('approved', event.submitter);
});

document.getElementById('rejectReturnButton').addEventListener('click', async event => {
  await reviewReturn('rejected', event.currentTarget);
});

function updateFinishMaintenanceValidation(){
  const readyInput = document.getElementById('finishMaintenanceReady');
  const needsInput = document.getElementById('finishMaintenanceNeeds');
  const message = document.getElementById('finishMaintenanceValidation');
  const submit = document.getElementById('finishMaintenanceSubmit');
  if(!readyInput || !needsInput || !message || !submit) return false;

  const maintenanceQuantity = currentFinishMaintenance?.quantity || 0;
  const ready = Number(readyInput.value);
  const needs = Number(needsInput.value);
  const validValues = Number.isInteger(ready) && Number.isInteger(needs) && ready >= 0 && needs >= 0;
  const validTotal = validValues && ready + needs === maintenanceQuantity;
  const accounted = validValues ? ready + needs : 0;

  message.textContent = validTotal
    ? `Total accounted for: ${accounted} / ${maintenanceQuantity} — Ready to complete maintenance.`
    : `Total accounted for: ${accounted} / ${maintenanceQuantity}. Ready to Use + Needs Maintenance must equal ${maintenanceQuantity}.`;
  message.style.color = validTotal ? 'var(--green)' : 'var(--red)';
  submit.disabled = !validTotal;
  return validTotal;
}

function openFinishMaintenanceModal(index){
  const record = maintenanceData[index];
  if(!record || !record.id || record.quantity <= 0) return;

  currentFinishMaintenance = record;
  document.getElementById('finishMaintenanceEquipment').value = record.name;
  document.getElementById('finishMaintenanceReference').value = record.ref;
  document.getElementById('finishMaintenanceQuantity').value = record.quantity;
  document.getElementById('finishMaintenanceStatus').value = 'Maintenance';
  document.getElementById('finishMaintenanceReason').value = record.reason;
  document.getElementById('finishMaintenanceReady').value = '';
  document.getElementById('finishMaintenanceNeeds').value = '';
  updateFinishMaintenanceValidation();

  const modal = document.getElementById('finishMaintenanceModal');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeFinishMaintenanceModal(){
  const modal = document.getElementById('finishMaintenanceModal');
  if(modal){
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }
  currentFinishMaintenance = null;
  document.getElementById('finishMaintenanceForm')?.reset();
  const submit = document.getElementById('finishMaintenanceSubmit');
  if(submit){ submit.disabled = true; submit.textContent = 'Finish Maintenance'; }
}

document.getElementById('finishMaintenanceReady').addEventListener('input', updateFinishMaintenanceValidation);
document.getElementById('finishMaintenanceNeeds').addEventListener('input', updateFinishMaintenanceValidation);

document.getElementById('finishMaintenanceForm').addEventListener('submit', async event => {
  event.preventDefault();
  if(!currentFinishMaintenance || !updateFinishMaintenanceValidation()) return;

  const ready = Number(document.getElementById('finishMaintenanceReady').value);
  const needs = Number(document.getElementById('finishMaintenanceNeeds').value);
  const submit = document.getElementById('finishMaintenanceSubmit');
  submit.disabled = true;
  submit.textContent = 'SAVING...';

  const { error } = await supabaseClient.rpc('finish_equipment_maintenance', {
    maintenance_uuid: currentFinishMaintenance.id,
    ready_quantity: ready,
    needs_maintenance_quantity: needs
  });

  if(error){
    console.error(error);
    submit.disabled = false;
    submit.textContent = 'Finish Maintenance';
    showNotice('Maintenance update failed. No changes were saved.', 'error');
    return;
  }

  closeFinishMaintenanceModal();
  await loadAllData();
  showNotice(needs > 0
    ? `Maintenance updated. ${ready} items are now available and ${needs} items remain under maintenance.`
    : `Maintenance completed successfully. All ${ready} items are now available.`, 'success');
});

document.getElementById('borrowForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if(!selectedBorrowEquipment){ return; }

  const form = event.currentTarget;
  const qty = Number(form.borrowQty.value);
  const startDate = form.borrowStartDate.value;
  const endDate = form.borrowEndDate.value;
  const purpose = form.borrowPurpose.value.trim();
  const organizationName = form.borrowOrganization.value.trim();
  const submit = form.querySelector('button[type="submit"]');

  if(!qty || qty < 1){
    showNotice('Please enter a valid quantity.', 'error');
    return;
  }

  if(qty > selectedBorrowEquipment.have){
    showNotice(`Only ${selectedBorrowEquipment.have} item(s) are available for ${selectedBorrowEquipment.name}.`, 'error');
    return;
  }

  if(!purpose || !organizationName){
    showNotice('Please complete the purpose and organization details.', 'error');
    return;
  }

  if(endDate < startDate){
    showNotice('End date must be after the start date.', 'error');
    return;
  }

  const restoreSubmit = setButtonProcessing(submit, 'SUBMITTING...');

  const { error: reserveError } = await supabaseClient.rpc('reserve_equipment_qty', {
    equipment_uuid: selectedBorrowEquipment.id,
    qty_requested: qty
  });

  if(reserveError){
    console.error('Reserve stock failed:', reserveError);
    restoreSubmit();
    const message = /maintenance/i.test(reserveError.message || '')
      ? 'Checkout failed. This equipment is currently under maintenance.'
      : /insufficient stock/i.test(reserveError.message || '')
        ? 'Checkout failed. The requested quantity is no longer available.'
        : 'Checkout failed. The equipment may no longer be available.';
    showNotice(message, 'error');
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
    await supabaseClient.rpc('increment_equipment_qty', {
      equipment_uuid: selectedBorrowEquipment.id,
      qty_increment: qty
    });

    const msg = requestError.message || 'Failed to submit the borrow request.';
    const missingTable = /does not exist|relation .*borrow_requests|column .*organization_name/i.test(msg);
    restoreSubmit();
    showNotice(
      missingTable
        ? 'Borrow request storage is not ready in Supabase yet. Please run the project SQL migration so the borrow_requests table and organization_name column exist before submitting requests.'
        : 'Request submission failed. No changes were saved.',
      'error'
    );
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

    await supabaseClient.rpc('increment_equipment_qty', {
      equipment_uuid: selectedBorrowEquipment.id,
      qty_increment: qty
    });

    await supabaseClient.from('borrow_requests').delete().eq('id', requestData.id);

    restoreSubmit();
    showNotice('Request submission failed. No changes were saved.', 'error');
    return;
  }

  closeBorrowModal();
  await loadAllData();
  showNotice('Request submitted successfully.', 'success');
});

document.getElementById('adminEditForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if(!currentEditEquipmentId) return;

  const form = event.currentTarget;
  const item = inventory.find(i => i.id === currentEditEquipmentId);
  const availableQty = Number(form.availableStock.value);
  const totalQty = Number(form.totalStock.value);
  const submit = form.querySelector('button[type="submit"]');

  if(!item) return;

  if(totalQty < availableQty){
    showNotice('Total stock cannot be less than available stock.', 'error');
    return;
  }

  if(item.rawStatus === 'maintenance' && item.maintenanceQty > 0 && form.status.value !== 'maintenance'){
    showNotice('Finish the maintenance inspection before changing this equipment status.', 'warning');
    return;
  }

  const restoreSubmit = setButtonProcessing(submit, 'SAVING...');

  const basePayload = {
    name: form.equipmentName.value.trim(),
    category_id: form.equipmentCategory.value,
    total_qty: totalQty,
    condition: form.condition.value,
    location: form.location.value.trim()
  };

  if(form.status.value === 'maintenance' && item.rawStatus !== 'maintenance'){
    const { error: prepareError } = await supabaseClient
      .from('equipment')
      .update(basePayload)
      .eq('id', currentEditEquipmentId);

    if(prepareError){
      console.error(prepareError);
      restoreSubmit();
      showNotice('Equipment update failed. No changes were saved.', 'error');
      return;
    }

    const { error: maintenanceError } = await supabaseClient.rpc('start_equipment_maintenance', {
      equipment_uuid: currentEditEquipmentId,
      maintenance_reason: 'Equipment placed in maintenance from Inventory.'
    });

    if(maintenanceError){
      console.error(maintenanceError);
      restoreSubmit();
      showNotice('Maintenance update failed. No changes were saved.', 'error');
      return;
    }

    closeEquipmentModal();
    await loadAllData();
    showNotice('Equipment status changed to Maintenance successfully.', 'success');
    return;
  }

  const payload = form.status.value === 'maintenance'
    ? { ...basePayload, status: 'maintenance' }
    : { ...basePayload, available_qty: availableQty, status: form.status.value };

  const { error } = await supabaseClient.from('equipment').update(payload).eq('id', currentEditEquipmentId);
  if(error){
    console.error(error);
    restoreSubmit();
    showNotice('Equipment update failed. No changes were saved.', 'error');
    return;
  }

  closeEquipmentModal();
  await loadAllData();
  showNotice('Equipment updated successfully.', 'success');
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
    await startNotificationUpdates();
  } else {
    showAuthScreen();
  }
})();