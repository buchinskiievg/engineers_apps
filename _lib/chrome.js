// engineers_apps/_lib/chrome.js
// Shared site chrome: nav header + black quick-launch + metallic tab strip.
// Injects into pages that don't already have it (i.e. anywhere except /).
// Active state is derived from window.location.pathname.

(function() {
  'use strict';
  // If header already in DOM (landing has it natively), skip
  if (document.querySelector('header.va-nav.va-nav-xl')) return;

  // Mark active nav based on pathname
  const p = location.pathname;
  const is = {
    landing: p === '/' || p === '',
    content: p.startsWith('/content/'),
    forum:   p.startsWith('/forum/'),
    pricing: false, // anchor on landing
  };
  function on(k) { return is[k] ? ' class="is-on"' : ''; }

  const headerHtml = `
<header class="va-nav va-nav-xl">
  <a href="/" class="logo-nav logo-nav-xl" aria-label="IECCalc.com">
    <span class="logo-nav-mark" style="width:48px;height:48px">
      <svg width="48" height="48" viewBox="0 0 64 64" aria-hidden="true">
        <rect x="1" y="1" width="62" height="62" rx="3" fill="none" stroke="var(--ink)" stroke-width="2"/>
        <line x1="32" y1="32" x2="32" y2="10" stroke="var(--ink)" stroke-width="3.5"/>
        <line x1="32" y1="32" x2="51.05" y2="43" stroke="var(--red)" stroke-width="3.5"/>
        <line x1="32" y1="32" x2="12.95" y2="43" stroke="var(--ink)" stroke-width="3.5"/>
        <circle cx="32" cy="10" r="3" fill="var(--ink)"/>
        <circle cx="51.05" cy="43" r="3" fill="var(--red)"/>
        <circle cx="12.95" cy="43" r="3" fill="var(--ink)"/>
        <circle cx="32" cy="32" r="4" fill="var(--ink)"/>
      </svg>
    </span>
    <span class="logo-nav-stack">
      <span class="logo-nav-word logo-nav-word-xl" style="font-size:26px"><b style="color:var(--ink)">IEC</b><b style="color:var(--red)">CALC</b><span class="logo-nav-tld" style="color:var(--ink-3)">.COM</span></span>
      <span class="logo-nav-tag">&mdash; POWER ENGINEERING TOOLBOX &mdash;</span>
    </span>
  </a>
  <nav>
    <a href="/#tabs"${on('landing')}>TOOLBOX</a>
    <a href="/content/"${on('content')}>CONTENT</a>
    <a href="/forum/"${on('forum')}>FORUM</a>
    <a href="/#pricing">PRICING</a>
  </nav>
  <div class="va-nav-r">
    <a href="/account/?intent=signin" class="va-sign">SIGN IN</a>
    <a href="/account/" class="btn btn-primary btn-sm">SUBSCRIBE</a>
  </div>
</header>
<section class="va-hero-stats va-hero-stats-attached va-quicklaunch" id="quick-launch"></section>
<section class="va-tabstrip">
  <div class="va-tabs" role="tablist">
    <a role="tab" data-tab="free" class="va-tab" href="/#panel-free">
      <span class="va-tab-n tnum">01</span>
      <span class="va-tab-m">
        <span class="va-tab-l">FREE TOOLS</span>
        <span class="va-tab-s">OPEN ACCESS &middot; NO ACCOUNT</span>
      </span>
      <span class="va-tab-arrow"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square" aria-hidden="true"><path d="M4 12 H20 M14 6 L20 12 L14 18"/></svg></span>
    </a>
    <a role="tab" data-tab="pro" class="va-tab" href="/#panel-pro">
      <span class="va-tab-n tnum">02</span>
      <span class="va-tab-m">
        <span class="va-tab-l">PRO TOOLS <span class="tag tag-red">PRO</span></span>
        <span class="va-tab-s">STUDIES &middot; REPORTS &middot; CAD</span>
      </span>
      <span class="va-tab-arrow"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square" aria-hidden="true"><path d="M4 12 H20 M14 6 L20 12 L14 18"/></svg></span>
    </a>
    <a role="tab" data-tab="content" class="va-tab${is.content||is.forum?' is-on':''}" href="${is.forum?'/forum/':'/content/'}">
      <span class="va-tab-n tnum">03</span>
      <span class="va-tab-m">
        <span class="va-tab-l">USEFUL CONTENT</span>
        <span class="va-tab-s">CONTENT &middot; FORUM &middot; STANDARDS</span>
      </span>
      <span class="va-tab-arrow"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square" aria-hidden="true"><path d="M4 12 H20 M14 6 L20 12 L14 18"/></svg></span>
    </a>
  </div>
</section>
  `.trim();

  // Wrap chrome in a div, prepend to body so it's at the very top
  const div = document.createElement('div');
  div.className = 'iec-chrome';
  div.innerHTML = headerHtml;
  document.body.insertBefore(div, document.body.firstChild);

  // Render quick-launch (popular/recent tools)
  function renderQuickLaunch() {
    const root = document.getElementById('quick-launch');
    if (!root) return;
    const ICON = {
      '001': '<path d="M12 2 L6 12 a 6 6 0 1 0 12 0 Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square"/>',
      '002': '<path d="M13 2 L4 14 H11 L9 22 L20 9 H13 L15 2 Z" fill="currentColor"/>',
      '003': '<path d="M12 2 V14 M5 14 H19 M7 17 H17 M9 20 H15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square"/>',
      '004': '<path d="M3 9 q 4.5 -6 9 0 t 9 0 M3 16 q 4.5 -6 9 0 t 9 0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square"/>',
    };
    const SEED = [
      { slug:'001', name:'Voltage Drop' },
      { slug:'002', name:'Short-Circuit' },
      { slug:'003', name:'Grounding' },
      { slug:'004', name:'Cable Ampacity' },
    ];
    // Try to load actual calculators from API; fall back to seed
    function paint(calcs, isUser) {
      const eyebrow = isUser ? 'RECENT TOOLS' : 'POPULAR TOOLS';
      const items = calcs.slice(0, 6).map(c => {
        const ic = ICON[c.slug] || ICON['001'];
        return `<a class="va-ql" href="${c.base_url || ('/' + c.slug + '/')}">
          <span class="icn"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style="color:var(--red)">${ic}</svg></span>
          <span class="lbl">${(c.name||'').toUpperCase()}</span>
          <span class="sub">#${c.slug}</span>
        </a>`;
      }).join('');
      root.innerHTML = `<div class="va-ql-eyebrow">${eyebrow}</div><div class="va-ql-row">${items}</div>`;
    }
    if (window.IecApi) {
      Promise.all([IecApi.calculators().catch(()=>({calculators:SEED})), IecApi.me().catch(()=>({authenticated:false}))])
        .then(([cd, me]) => {
          const cs = (cd.calculators||SEED).filter(c => c.tier !== 'archived');
          paint(cs, !!(me && me.authenticated));
        });
    } else {
      paint(SEED, false);
    }
  }
  renderQuickLaunch();
})();
