// engineers_apps/_lib/calc-nav.js
// Inject left sidebar on calculator pages (001-004): two tabs — Projects + Calculators.
// Must run AFTER chrome.js (header) but before the calc's own scripts start touching DOM.

(function() {
  'use strict';
  if (document.querySelector('aside.va-sidebar.calc-nav')) return;

  function inject() {
    // Find the calc's main container — usually .container (warm gray bg page)
    // Strategy: take all body children EXCEPT the chrome wrapper (.iec-chrome) and
    // any scripts/templates; wrap them in va-app-main, with sidebar before them.
    const body = document.body;
    const chrome = body.querySelector('.iec-chrome');

    // Build the wrapper: <div class="va-app calc-app">
    //   <aside class="va-sidebar calc-nav">...</aside>
    //   <div class="va-app-main">...content...</div>
    // </div>
    const app = document.createElement('div');
    app.className = 'va-app calc-app';

    const aside = document.createElement('aside');
    aside.className = 'va-sidebar calc-nav';
    aside.innerHTML = `
      <div class="va-sb-head" style="padding:0;background:var(--paper)">
        <div class="cn-tabs" role="tablist">
          <button class="cn-tab is-on" data-cn="projects" role="tab">PROJECTS</button>
          <button class="cn-tab" data-cn="calcs" role="tab">CALCULATORS</button>
        </div>
      </div>
      <div class="va-sb-body cn-body" id="cn-body">
        <div style="padding:14px 16px;color:var(--ink-3);font:500 12px/1.4 var(--sans)">Loading&hellip;</div>
      </div>
      <div class="va-sb-foot"><span class="eyebrow">USE TREE TO SWITCH BETWEEN TOOLS</span></div>
    `;

    const main = document.createElement('div');
    main.className = 'va-app-main';

    // Move all non-chrome, non-script body children into main
    const toMove = [];
    for (const node of Array.from(body.children)) {
      if (node === chrome) continue;
      if (node.tagName === 'SCRIPT') continue;
      if (node === app) continue;
      toMove.push(node);
    }
    toMove.forEach(n => main.appendChild(n));

    app.appendChild(aside);
    app.appendChild(main);

    // Insert app right after chrome (or at start of body)
    if (chrome) chrome.after(app); else body.insertBefore(app, body.firstChild);

    injectStyles();
    bindTabs();
    loadTab(localStorage.getItem('iec_calc_nav_tab') || 'projects');
  }

  function injectStyles() {
    if (document.getElementById('iec-calc-nav-styles')) return;
    const s = document.createElement('style');
    s.id = 'iec-calc-nav-styles';
    s.textContent = `
      .va-sidebar.calc-nav { border-right: 2px solid var(--ink, #2E2B25); background: var(--surface, #F4F1EA); }
      .va-sidebar.calc-nav .cn-tabs {
        display: grid; grid-template-columns: 1fr 1fr;
        border-bottom: 2px solid var(--ink, #2E2B25);
      }
      .va-sidebar.calc-nav .cn-tab {
        font: 800 11px/1 var(--sans, sans-serif);
        letter-spacing: 0.14em;
        padding: 12px 6px;
        background: var(--paper, #ECE9E2);
        color: var(--ink-3, #7A7367);
        border: 0; border-right: 1px solid var(--line, #BAB3A4);
        cursor: pointer;
      }
      .va-sidebar.calc-nav .cn-tab:last-child { border-right: 0; }
      .va-sidebar.calc-nav .cn-tab.is-on {
        background: var(--ink, #2E2B25);
        color: var(--paper, #ECE9E2);
      }
      .va-sidebar.calc-nav .cn-tab.is-on .badge { background: var(--red, #DC1A25); }
      .cn-body { padding: 0; }
      .cn-list { list-style: none; margin: 0; padding: 0; }
      .cn-item {
        display: grid; grid-template-columns: 28px 1fr auto;
        gap: 8px; align-items: center;
        padding: 10px 14px;
        text-decoration: none; color: var(--ink, #2E2B25);
        border-bottom: 1px solid var(--line-soft, #D6D1C5);
        font: 600 12.5px/1.2 var(--sans, sans-serif);
        transition: background .1s;
      }
      .cn-item:hover { background: var(--paper, #ECE9E2); }
      .cn-item.is-on {
        background: var(--ink, #2E2B25);
        color: var(--paper, #ECE9E2);
      }
      .cn-item .num {
        font: 900 12px/1 var(--display, Archivo);
        color: var(--red, #DC1A25);
      }
      .cn-item.is-on .num { color: var(--red, #DC1A25); }
      .cn-item .name {
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        text-transform: uppercase; letter-spacing: 0.04em;
      }
      .cn-item .tag {
        font: 800 9px/1 var(--sans, sans-serif);
        letter-spacing: 0.14em;
        padding: 3px 6px;
        background: var(--red, #DC1A25); color: #fff;
      }
      .cn-item.is-on .tag { background: var(--paper, #ECE9E2); color: var(--red, #DC1A25); }
      .cn-empty {
        padding: 18px 16px;
        text-align: center;
        color: var(--ink-3, #7A7367);
        font: 500 12px/1.5 var(--sans, sans-serif);
      }
      .cn-empty .btn { margin-top: 10px; display: inline-block; }
      .cn-projects-add {
        padding: 12px 14px; border-bottom: 1px solid var(--line, #BAB3A4);
        background: var(--paper, #ECE9E2);
      }
      .cn-projects-add button {
        width: 100%; padding: 8px 12px;
        background: var(--red, #DC1A25); color: #fff;
        border: 0; cursor: pointer;
        font: 800 11px/1 var(--sans, sans-serif);
        letter-spacing: 0.12em; text-transform: uppercase;
      }
      .cn-projects-add button:hover { background: #A30E18; }
      @media (max-width: 900px) {
        .va-app.calc-app { grid-template-columns: 1fr; }
        .va-sidebar.calc-nav { border-right: 0; border-bottom: 2px solid var(--ink); max-height: 280px; }
      }
    `;
    document.head.appendChild(s);
  }

  function bindTabs() {
    document.querySelectorAll('.va-sidebar.calc-nav .cn-tab').forEach(t => {
      t.addEventListener('click', () => {
        document.querySelectorAll('.va-sidebar.calc-nav .cn-tab').forEach(x => x.classList.remove('is-on'));
        t.classList.add('is-on');
        const tab = t.dataset.cn;
        localStorage.setItem('iec_calc_nav_tab', tab);
        loadTab(tab);
      });
    });
  }

  function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}

  async function loadTab(tab) {
    // Sync the active tab UI marker
    document.querySelectorAll('.va-sidebar.calc-nav .cn-tab').forEach(t => {
      t.classList.toggle('is-on', t.dataset.cn === tab);
    });
    const body = document.getElementById('cn-body');
    if (tab === 'projects') return renderProjects(body);
    if (tab === 'calcs')    return renderCalcs(body);
  }

  async function renderProjects(root) {
    let me = null;
    try { me = window.IecApi ? await IecApi.me() : null; } catch (e) {}
    if (!me || !me.authenticated) {
      root.innerHTML = `<div class="cn-empty">
        Sign in to manage your projects, installations and connections.
        <br><a class="btn btn-primary" href="/account/?intent=signin" style="margin-top:10px">SIGN IN</a>
      </div>`;
      return;
    }
    // Demo tree (replaced when backend project CRUD lands)
    const DEMO = [
      { id:'p1', name:'DEMO SUBSTATION 110/20 kV' },
      { id:'p2', name:'CABLE ROUTE — CITY CENTRE' },
    ];
    root.innerHTML = `
      <div class="cn-projects-add">
        <button id="cn-new-project">+ NEW PROJECT</button>
      </div>
      <ul class="cn-list">
        ${DEMO.map(p => `<li><a class="cn-item" href="javascript:void(0)" data-pid="${esc(p.id)}">
          <span class="num">P</span>
          <span class="name">${esc(p.name)}</span>
        </a></li>`).join('')}
      </ul>
    `;
    document.getElementById('cn-new-project').addEventListener('click', () => {
      const n = prompt('Project name:');
      if (n) alert('Stub: would create "' + n + '". Backend API pending.');
    });
  }

  async function renderCalcs(root) {
    const curSlug = (location.pathname.match(/\/(\d{3})\//) || [])[1] || null;
    let calcs = [];
    try {
      if (window.IecApi) { const d = await IecApi.calculators(); calcs = d.calculators || []; }
    } catch (e) {}
    if (!calcs.length) {
      // Fallback hardcoded list
      calcs = [
        { slug:'001', name:'Voltage Drop',           visibility:'pro', base_url:'/001/' },
        { slug:'002', name:'Short-Circuit',          visibility:'pro', base_url:'/002/' },
        { slug:'003', name:'Substation Grounding',   visibility:'pro', base_url:'/003/' },
        { slug:'004', name:'Cable Ampacity',         visibility:'pro', base_url:'/004/' },
      ];
    }
    root.innerHTML = `<ul class="cn-list">${calcs.map(c => {
      const isCur = c.slug === curSlug;
      const vis = c.visibility || c.category || 'pro';
      const tag = vis === 'both' ? '<span class="tag" style="background:#1a3a6a">BOTH</span>'
                 : vis === 'pro' ? '<span class="tag">PRO</span>' : '';
      return `<li><a class="cn-item${isCur?' is-on':''}" href="${esc(c.base_url || ('/'+c.slug+'/'))}">
        <span class="num">#${esc(c.slug)}</span>
        <span class="name">${esc(c.name)}</span>
        ${tag}
      </a></li>`;
    }).join('')}</ul>`;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();
})();
