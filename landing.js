const SUPABASE_URL = 'https://ttmimlqclhjijhhgtrat.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmF0ZSIsInJlZiI6InR0bWltbHFjbGhqaWpoaGd0cmF0IiwiaWF0IjoxNzkwMDc0NDE2LCJleHAiOjIxMDU2NTA0MTZ9.oxeTNFYRwWEB0lHWDMEgi89HlLckci4kki8tO62ZW5o';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const appPath = 'geartrack.html';

const modal = document.getElementById('authModal');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const loginMessage = document.getElementById('loginMessage');
const signupMessage = document.getElementById('signupMessage');

function setMessage(element, message, type = '') {
  element.textContent = message;
  element.className = `landing-message ${type}`;
}

function setAuthTab(mode) {
  document.querySelectorAll('[data-auth-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.authTab === mode);
  });
  loginForm.hidden = mode !== 'login';
  signupForm.hidden = mode !== 'signup';
  document.getElementById('authTitle').textContent = mode === 'login' ? 'Welcome back' : 'Create your account';
  setMessage(loginMessage, '');
  setMessage(signupMessage, '');
}

function openAuth(mode) {
  modal.hidden = false;
  setAuthTab(mode);
  modal.querySelector('input:not([type="hidden"])')?.focus();
  document.body.classList.add('modal-open');
}

function closeAuth() {
  modal.hidden = true;
  document.body.classList.remove('modal-open');
}

function redirectToApp() {
  window.location.replace(appPath);
}

document.querySelectorAll('[data-auth-mode]').forEach(button => {
  button.addEventListener('click', () => openAuth(button.dataset.authMode));
});
document.querySelectorAll('[data-auth-tab]').forEach(button => {
  button.addEventListener('click', () => setAuthTab(button.dataset.authTab));
});
document.querySelectorAll('[data-close-auth]').forEach(element => {
  element.addEventListener('click', closeAuth);
});
document.addEventListener('keydown', event => {
  if(event.key === 'Escape' && !modal.hidden) closeAuth();
});

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const submit = loginForm.querySelector('button[type="submit"]');
  const formData = new FormData(loginForm);
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');

  submit.disabled = true;
  submit.textContent = 'Signing in...';
  setMessage(loginMessage, '');
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if(error){
    setMessage(loginMessage, error.message || 'Unable to sign in.', 'error');
    submit.disabled = false;
    submit.textContent = 'Log in';
    return;
  }
  setMessage(loginMessage, 'Signed in. Opening GearTrack...', 'success');
  redirectToApp();
});

signupForm.addEventListener('submit', async event => {
  event.preventDefault();
  const submit = signupForm.querySelector('button[type="submit"]');
  const formData = new FormData(signupForm);
  const fullName = String(formData.get('fullName') || '').trim();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');

  submit.disabled = true;
  submit.textContent = 'Creating account...';
  setMessage(signupMessage, '');
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } }
  });

  if(error){
    setMessage(signupMessage, error.message || 'Unable to create the account.', 'error');
    submit.disabled = false;
    submit.textContent = 'Create account';
    return;
  }

  if(data.session){
    setMessage(signupMessage, 'Account created. Opening GearTrack...', 'success');
    redirectToApp();
    return;
  }

  setMessage(signupMessage, 'Account created. Check your email to confirm it, then log in.', 'success');
  submit.disabled = false;
  submit.textContent = 'Create account';
  setAuthTab('login');
});

(async function checkExistingSession(){
  const { data: { session } } = await supabaseClient.auth.getSession();
  if(session?.user) redirectToApp();
})();
