// engineers_apps/_lib/auth-ui.js
// Global user-display: on every page, check /me and update the top-right
// area with a user menu if authenticated (replaces SIGN IN / SUBSCRIBE buttons).

(function() {
  'use strict';
  if (!window.IecApi) return;

  function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}

  function injectStyles() {
    if (document.getElementById('iec-auth-ui-styles')) return;
    const s = document.createElement('style');
    s.id = 'iec-auth-ui-styles';
    s.textContent = `
.iec-user {
  position: relative;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 6px 12px;
  background: var(--ink);
  color: var(--paper);
  text-decoration: none;
  border: 1px solid var(--ink);
  cursor: pointer;
  font: 700 11px/1 var(--sans, sans-serif);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.iec-user:hover { background: var(--carbon, #2A2823); }
.iec-user .avatar {
  width: 22px; height: 22px;
  background: var(--red);
  color: #fff;
  border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  font: 800 11px/1 var(--sans);
}
.iec-user.admin .avatar { background: var(--red); }
.iec-user .iec-user-name {
  max-width: 140px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  text-transform: none; letter-spacing: 0; font-weight: 600;
}
.iec-user .iec-admin-badge {
  font: 800 9px/1 var(--sans); letter-spacing: 0.14em;
  padding: 2px 5px; background: var(--red); color: #fff;
  margin-left: 4px;
}
.iec-user-menu {
  position: absolute; top: 100%; right: 0; margin-top: 4px;
  background: var(--paper); border: 2px solid var(--ink);
  min-width: 200px;
  display: none; z-index: 100;
  box-shadow: 0 8px 20px rgba(0,0,0,0.18);
}
.iec-user-menu.open { display: block; }
.iec-user-menu a, .iec-user-menu button {
  display: block; width: 100%; padding: 9px 14px;
  font: 600 12px/1.2 var(--sans); letter-spacing: 0.04em;
  color: var(--ink); background: var(--paper);
  text-decoration: none; border: 0; border-bottom: 1px solid var(--line);
  text-align: left; cursor: pointer; text-transform: uppercase;
}
.iec-user-menu a:hover, .iec-user-menu button:hover { background: var(--surface); color: var(--red); }
.iec-user-menu a:last-child, .iec-user-menu button:last-child { border-bottom: 0; }
.iec-user-menu .iec-um-head {
  padding: 10px 14px;
  background: var(--surface);
  border-bottom: 2px solid var(--ink);
  font: 600 11px/1.4 var(--sans);
  color: var(--ink-3);
  letter-spacing: 0.04em;
}
.iec-user-menu .iec-um-head b { color: var(--ink); display: block; }
@media (max-width: 600px) {
  .iec-user .iec-user-name { display: none; }
}
    `;
    document.head.appendChild(s);
  }

  function initials(name, email) {
    const s = (name || email || '').trim();
    if (!s) return '?';
    const parts = s.split(/[\s.@_-]+/).filter(Boolean);
    return (parts[0]?.[0] + (parts[1]?.[0] || '')).toUpperCase();
  }

  function render(session) {
    injectStyles();
    const u = session.user;
    const display = u.name || u.email.split('@')[0];
    const adminBadge = session.isAdmin ? '<span class="iec-admin-badge">ADMIN</span>' : '';
    const menuLinks = [
      ['/account/', 'My account'],
      ['/account/#licenses', 'Licences'],
      session.isAdmin ? ['/admin/', 'Admin panel'] : null,
      session.isAdmin ? ['/content/', 'Manage content'] : null,
    ].filter(Boolean);

    const html = `
      <button class="iec-user${session.isAdmin?' admin':''}" id="iec-user-btn" type="button">
        <span class="avatar">${esc(initials(u.name, u.email))}</span>
        <span class="iec-user-name">${esc(display)}</span>
        ${adminBadge}
      </button>
      <div class="iec-user-menu" id="iec-user-menu">
        <div class="iec-um-head">
          Signed in as<br><b>${esc(u.email)}</b>
        </div>
        ${menuLinks.map(([h, l]) => `<a href="${esc(h)}">${esc(l)}</a>`).join('')}
        <button type="button" id="iec-signout-btn">Sign out</button>
      </div>
    `;

    // Inject into nav-r if exists; else into body top-right
    const nav = document.querySelector('.va-nav-r');
    if (nav) {
      // Remove SIGN IN / SUBSCRIBE
      nav.querySelectorAll('.va-sign, .btn-primary').forEach(el => {
        if (el.textContent.match(/SIGN IN|SUBSCRIBE/i)) el.remove();
      });
      const wrap = document.createElement('div');
      wrap.style.position = 'relative';
      wrap.innerHTML = html;
      nav.appendChild(wrap);
    } else {
      // Fallback: top-right floating
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;top:10px;right:14px;z-index:50';
      wrap.innerHTML = html;
      document.body.appendChild(wrap);
    }

    const btn = document.getElementById('iec-user-btn');
    const menu = document.getElementById('iec-user-menu');
    btn.addEventListener('click', e => {
      e.stopPropagation();
      menu.classList.toggle('open');
    });
    document.addEventListener('click', () => menu.classList.remove('open'));
    document.getElementById('iec-signout-btn').addEventListener('click', async () => {
      await IecApi.signOut().catch(()=>{});
      location.reload();
    });
  }

  // Run on every page
  IecApi.me().then(s => {
    if (s && s.authenticated) {
      window.__iec_session = s;
      render(s);
    }
  }).catch(()=>{});
})();
