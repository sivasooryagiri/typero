import { byId, api, go } from './common.js';

const msg = byId('authMsg');
const setMsg = (t) => { msg.textContent = t; };

byId('loginBtn').addEventListener('click', async () => {
  try {
    await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: byId('loginUser').value, password: byId('loginPass').value }),
    });
    setMsg('Logged in. Redirecting...');
    setTimeout(() => { go('/'); }, 500);
  } catch (e) {
    setMsg(e.message);
  }
});

byId('regBtn').addEventListener('click', async () => {
  try {
    await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: byId('regUser').value, password: byId('regPass').value }),
    });
    setMsg('Account created. Redirecting...');
    setTimeout(() => { go('/'); }, 500);
  } catch (e) {
    setMsg(e.message);
  }
});
