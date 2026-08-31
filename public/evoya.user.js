// ==UserScript==
// @name         UniScan Evoya Mobile
// @namespace    uniscan.evoya
// @version      1.4.0
// @description  UniScan للغربلة: واجهة هاتف محسنة + Evoya SPA + ماسح كامل الشاشة + دعم Android/iPhone.
// @match        https://iraq-central-moh-nbs.evoya.revvitycloud.com/*
// @run-at       document-idle
// @noframes
// @inject-into  content
// @updateURL    https://uniscan-evoya.workmail97x.workers.dev/evoya.meta.js
// @downloadURL  https://uniscan-evoya.workmail97x.workers.dev/evoya.user.js
// @homepageURL  https://uniscan-evoya.workmail97x.workers.dev
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  if (window.__UNISCAN_EVOYA_140__) return;
  window.__UNISCAN_EVOYA_140__ = true;

  const CONFIG = {
    contactSelector: '#dxContact',
    barcodeSelector: '#kitNumber',
    contactName: 'الانبار',
    optionWaitMs: 3500,
    duplicateLockMs: 5000,
    stableReadsRequired: 2,
    scanFormats: ['code_128','code_39','ean_13','ean_8','itf','codabar','upc_a','upc_e'],
    html5Src: 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js'
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => String(s || '')
    .replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه')
    .replace(/[\u064B-\u065F\u0670]/g,'').replace(/\s+/g,' ').trim().toLowerCase();

  let activated = false;
  let scanMode = true;
  let postScanLock = false;
  let busy = false;
  let refreshTimer = 0;
  let lastCode = '', lastAt = 0;
  let lastUserGesture = 0, softGuardUntil = 0;

  let overlay = null, stream = null, html5 = null, raf = 0;
  let scanning = false, stable = '', stableCount = 0, html5Promise = null;

  const targetPage = () => !!document.querySelector(CONFIG.contactSelector) && !!document.querySelector(CONFIG.barcodeSelector);
  const mobile = () => matchMedia('(max-width: 900px)').matches;

  function scanStep() {
    const b = document.querySelector(CONFIG.barcodeSelector);
    if (postScanLock && b && !String(b.value || '').trim()) postScanLock = false;
    return targetPage() && !postScanLock;
  }

  function ensureViewport() {
    let m = document.querySelector('meta[name="viewport"]');
    if (!m) {
      m = document.createElement('meta');
      m.name = 'viewport';
      document.head.appendChild(m);
    }
    m.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
  }

  function addStyle() {
    if (document.getElementById('uniscan-style')) return;
    const s = document.createElement('style');
    s.id = 'uniscan-style';
    s.textContent = `
#uniscan-mobile-tools,#uniscan-scan-btn,#uniscan-ready,#uniscan-toast,#uniscan-overlay{
  font-family:system-ui,-apple-system,"Segoe UI",Arial,sans-serif!important
}
body.uniscan-target-active{overflow-x:hidden!important;padding-bottom:100px!important}

#uniscan-mobile-tools{
  position:fixed!important;top:9px!important;left:9px!important;z-index:2147483644!important;
  display:flex!important;gap:5px!important;direction:rtl!important
}
#uniscan-mobile-tools[hidden]{display:none!important}
#uniscan-mobile-tools button{
  width:42px!important;height:42px!important;min-width:42px!important;min-height:42px!important;
  border:0!important;border-radius:13px!important;padding:0!important;background:#111827f0!important;color:#fff!important;
  font:800 17px/1 system-ui,-apple-system,"Segoe UI",Arial,sans-serif!important;
  box-shadow:0 6px 18px #0000002b!important
}
#uniscan-scan-btn{
  position:fixed!important;left:14px!important;right:14px!important;bottom:max(14px,env(safe-area-inset-bottom))!important;
  z-index:2147483645!important;min-height:64px!important;border:0!important;border-radius:20px!important;
  padding:14px 18px!important;background:#111827!important;color:#fff!important;
  font:800 19px/1.15 system-ui,-apple-system,"Segoe UI",Arial,sans-serif!important;
  box-shadow:0 10px 30px #00000042!important;direction:rtl!important;touch-action:manipulation!important
}
#uniscan-scan-btn[hidden],#uniscan-ready[hidden],#uniscan-toast[hidden]{display:none!important}
#uniscan-ready{
  position:fixed!important;left:50%!important;bottom:86px!important;transform:translateX(-50%)!important;
  z-index:2147483644!important;padding:7px 12px!important;border-radius:999px!important;
  background:#111827eb!important;color:#fff!important;font:700 13px/1 system-ui,-apple-system,"Segoe UI",Arial,sans-serif!important;
  direction:rtl!important;white-space:nowrap!important;pointer-events:none!important
}
#uniscan-toast{
  position:fixed!important;left:50%!important;bottom:154px!important;transform:translateX(-50%)!important;
  z-index:2147483647!important;max-width:min(90vw,430px)!important;padding:12px 16px!important;
  border-radius:14px!important;background:#111827f5!important;color:#fff!important;
  font:700 15px/1.45 system-ui,-apple-system,"Segoe UI",Arial,sans-serif!important;
  direction:rtl!important;text-align:center!important;box-shadow:0 8px 24px #00000040!important
}

html.uniscan-scanning,html.uniscan-scanning body{overflow:hidden!important;overscroll-behavior:none!important}
html.uniscan-scanning > body{visibility:hidden!important}
html.uniscan-scanning > #uniscan-overlay{visibility:visible!important}
#uniscan-overlay{
  position:fixed!important;top:0!important;left:0!important;right:auto!important;bottom:auto!important;
  width:100vw!important;width:100dvw!important;height:100vh!important;height:100dvh!important;
  min-width:100vw!important;min-height:100vh!important;max-width:none!important;max-height:none!important;
  margin:0!important;padding:0!important;border:0!important;transform:none!important;box-sizing:border-box!important;
  z-index:2147483647!important;background:#000!important;display:flex!important;flex-direction:column!important;
  direction:rtl!important;overflow:hidden!important
}
#uniscan-overlay *{box-sizing:border-box!important}
#uniscan-overlay .us-head{
  flex:0 0 auto!important;width:100%!important;min-height:58px!important;display:flex!important;align-items:center!important;
  gap:8px!important;padding:max(10px,env(safe-area-inset-top)) 12px 10px!important;background:#050505!important;color:#fff!important
}
#uniscan-overlay .us-head .title{flex:1!important;text-align:center!important;font-size:14px!important;font-weight:800!important}
#uniscan-overlay .us-head button{
  min-width:64px!important;min-height:42px!important;border:1px solid #ffffff55!important;
  background:#ffffff1f!important;color:#fff!important;border-radius:12px!important;padding:8px 10px!important;font:inherit!important
}
#uniscan-overlay .us-cam{position:relative!important;flex:1 1 auto!important;width:100%!important;min-height:0!important;overflow:hidden!important;background:#000!important}
#uniscan-overlay video,#uniscan-overlay #uniscan-html5,#uniscan-overlay #uniscan-html5>div{width:100%!important;height:100%!important;max-width:none!important;max-height:none!important}
#uniscan-overlay video,#uniscan-overlay #uniscan-html5 video,#uniscan-overlay #uniscan-html5 canvas{
  width:100%!important;height:100%!important;object-fit:cover!important;display:block!important
}
#uniscan-html5{position:absolute!important;inset:0!important;background:#000!important}
#uniscan-html5 img{display:none!important}
#uniscan-overlay .us-frame{
  position:absolute!important;left:7%!important;right:7%!important;top:37%!important;height:25%!important;
  border:3px solid #fff!important;border-radius:18px!important;box-shadow:0 0 0 9999px #00000055!important;pointer-events:none!important
}
#uniscan-overlay .us-line{position:absolute!important;left:11%!important;right:11%!important;top:49.5%!important;height:2px!important;background:#fff!important;pointer-events:none!important}
#uniscan-overlay .us-hint{
  position:absolute!important;left:15px!important;right:15px!important;bottom:max(18px,env(safe-area-inset-bottom))!important;
  color:#fff!important;text-align:center!important;font-size:14px!important;font-weight:800!important;text-shadow:0 2px 5px #000!important
}

@media(max-width:900px){
  html.uniscan-scan-mode .uniscan-target-zone{
    width:100%!important;max-width:100%!important;min-width:0!important;margin:54px 0 0!important;
    padding:18px 18px 112px!important;box-sizing:border-box!important;overflow-x:hidden!important;
    transform:none!important;zoom:1!important
  }
  html.uniscan-scan-mode .uniscan-target-zone *{box-sizing:border-box!important;min-width:0!important}
  html.uniscan-scan-mode .uniscan-primary-row{
    display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:22px!important;
    width:100%!important;max-width:100%!important;align-items:stretch!important
  }
  html.uniscan-scan-mode .uniscan-primary-field{
    width:100%!important;max-width:100%!important;min-width:0!important;margin:0!important;float:none!important;
    position:relative!important;left:auto!important;right:auto!important;transform:none!important
  }
  html.uniscan-scan-mode .uniscan-primary-field input,
  html.uniscan-scan-mode .uniscan-primary-field .dx-texteditor,
  html.uniscan-scan-mode .uniscan-primary-field .dx-dropdowneditor,
  html.uniscan-scan-mode .uniscan-primary-field .dx-selectbox,
  html.uniscan-scan-mode .uniscan-primary-field .dx-textbox{
    width:100%!important;max-width:100%!important
  }
  html.uniscan-scan-mode #dxContact,html.uniscan-scan-mode #kitNumber{
    width:100%!important;max-width:100%!important;min-height:58px!important;font-size:18px!important
  }
  html.uniscan-scan-mode #kitNumber{cursor:pointer!important;caret-color:transparent!important;user-select:none!important}
  html.uniscan-scan-mode .uniscan-barcode-field::after{
    content:"اضغط هنا أو استخدم زر مسح الباركود";display:block!important;margin-top:7px!important;
    font-size:12px!important;color:#6b7280!important;text-align:right!important;direction:rtl!important
  }
  html.uniscan-scan-mode .uniscan-secondary-field,
  html.uniscan-scan-mode .uniscan-target-title,
  html.uniscan-scan-mode .uniscan-target-note,
  html.uniscan-scan-mode .uniscan-hide-target-chrome{display:none!important}
}`;
    document.documentElement.appendChild(s);
  }

  let toastTimer;
  function toast(message, duration=2300) {
    let e = document.getElementById('uniscan-toast');
    if (!e) {
      e = document.createElement('div');
      e.id = 'uniscan-toast';
      e.setAttribute('role','status');
      e.setAttribute('aria-live','polite');
      document.documentElement.appendChild(e);
    }
    e.textContent = message;
    e.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { e.hidden = true; }, duration);
  }

  function ready(show) {
    let e = document.getElementById('uniscan-ready');
    if (!e) {
      e = document.createElement('div');
      e.id = 'uniscan-ready';
      e.textContent = 'UniScan جاهز ✓';
      document.documentElement.appendChild(e);
    }
    e.hidden = !show;
  }

  function ancestors(el) {
    const out = [];
    for (let n=el; n && n!==document.documentElement; n=n.parentElement) out.push(n);
    return out;
  }

  function lowestCommonAncestor(a,b) {
    if (!a || !b) return null;
    const set = new Set(ancestors(b));
    return ancestors(a).find(n => set.has(n)) || null;
  }

  function findFieldBlock(input,labelText) {
    const wanted = norm(labelText);
    let node = input?.parentElement;
    let fallback = node || null;
    for (let i=0; node && node!==document.body && i<7; i++) {
      const text = norm(node.textContent);
      const count = node.querySelectorAll('input,textarea,select').length;
      if (text.includes(wanted) && count<=3) return node;
      fallback = node;
      node = node.parentElement;
    }
    return fallback;
  }

  function clearMarks() {
    for (const cls of [
      'uniscan-target-zone','uniscan-primary-row','uniscan-primary-field',
      'uniscan-secondary-field','uniscan-target-title','uniscan-target-note','uniscan-hide-target-chrome',
      'uniscan-barcode-field'
    ]) {
      document.querySelectorAll('.'+cls).forEach(el => el.classList.remove(cls));
    }
  }

  function markScanLayout() {
    clearMarks();
    const c = document.querySelector(CONFIG.contactSelector);
    const b = document.querySelector(CONFIG.barcodeSelector);
    if (!c || !b) return false;

    const cb = findFieldBlock(c,'جهة الاتصال');
    const bb = findFieldBlock(b,'رقم الباركود');
    if (!cb || !bb) return false;

    cb.classList.add('uniscan-primary-field');
    bb.classList.add('uniscan-primary-field','uniscan-barcode-field');

    const common = lowestCommonAncestor(cb,bb);
    if (common && common!==document.body) common.classList.add('uniscan-primary-row');

    let zone = common;
    for (let i=0; zone?.parentElement && i<2; i++) {
      if (zone.parentElement===document.body) break;
      zone = zone.parentElement;
    }
    if (zone && zone!==document.body) zone.classList.add('uniscan-target-zone');

    for (const el of zone?.querySelectorAll('label,div,span') || []) {
      const t = norm(el.textContent);
      if (t.includes('نوع الادخال')) {
        let n = el;
        for (let i=0; n?.parentElement && i<3; i++) {
          if (n.querySelector?.('input,.dx-selectbox,.dx-dropdowneditor')) break;
          n = n.parentElement;
        }
        n?.classList.add('uniscan-secondary-field');
      }
      if (t.includes('معرف العينه')) el.classList.add('uniscan-target-note');
      if (t.includes('الادخال الديموغرافي عن بعد')) el.classList.add('uniscan-target-title');
    }

    const top = zone?.getBoundingClientRect().top ?? 200;
    for (const el of document.querySelectorAll('header,nav,[role="banner"],[role="navigation"]')) {
      if (zone?.contains(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.height>20 && r.top<Math.max(180,top) && r.width>innerWidth*.45) el.classList.add('uniscan-hide-target-chrome');
    }
    return true;
  }

  function applyMode() {
    const on = mobile() && scanStep();
    document.body.classList.toggle('uniscan-target-active', on);
    document.documentElement.classList.toggle('uniscan-scan-mode', on && scanMode);
    if (on && scanMode) markScanLayout(); else clearMarks();
  }

  function ensureTools() {
    const show = mobile() && scanStep();
    let tools = document.getElementById('uniscan-mobile-tools');
    if (!tools && show) {
      tools = document.createElement('div');
      tools.id = 'uniscan-mobile-tools';

      const mode = document.createElement('button');
      mode.id = 'uniscan-mode-btn';
      mode.type = 'button';

      const reload = document.createElement('button');
      reload.type = 'button';
      reload.textContent = '↻';
      reload.title = 'تحديث الصفحة';

      mode.onclick = () => {
        scanMode = !scanMode;
        applyMode();
        configureBarcodeField();
        mode.textContent = scanMode ? '◉' : '▣';
        mode.title = scanMode ? 'عرض الموقع' : 'العودة لوضع المسح';
      };
      reload.onclick = () => location.reload();
      tools.append(mode,reload);
      document.documentElement.appendChild(tools);
    }
    if (tools) {
      tools.hidden = !show;
      const mode = tools.querySelector('#uniscan-mode-btn');
      if (mode) {
        mode.textContent = scanMode ? '◉' : '▣';
        mode.title = scanMode ? 'عرض الموقع' : 'العودة لوضع المسح';
      }
    }
  }

  function ensureButton() {
    let btn = document.getElementById('uniscan-scan-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'uniscan-scan-btn';
      btn.type = 'button';
      btn.textContent = '📷 مسح الباركود';
      btn.onclick = startScanner;
      document.documentElement.appendChild(btn);
    }
    const show = mobile() && scanStep();
    btn.hidden = !show;
    ready(show);
  }

  async function waitAnbar(timeout=CONFIG.optionWaitMs) {
    const start = Date.now();
    while (Date.now()-start < timeout) {
      const o = [...document.querySelectorAll('[role="option"]')]
        .find(el => norm(el.textContent).includes(CONFIG.contactName));
      if (o) return o;
      await sleep(80);
    }
    return null;
  }

  let contactSelecting = false, lastContactAttempt = 0;
  async function ensureAnbar(quiet=false) {
    const c = document.querySelector(CONFIG.contactSelector);
    if (!c) return false;
    if (norm(c.value).includes(CONFIG.contactName)) return true;
    if (contactSelecting || Date.now()-lastContactAttempt<900) return false;
    contactSelecting = true;
    lastContactAttempt = Date.now();
    try {
      c.focus(); c.click();
      const o = await waitAnbar();
      if (!o) {
        try { c.blur(); } catch {}
        if (!quiet) toast('لم أجد خيار الأنبار');
        return false;
      }
      o.click();
      await sleep(220);
      const ok = norm(c.value).includes(CONFIG.contactName);
      if (!ok && !quiet) toast('تعذر تثبيت جهة الاتصال');
      return ok;
    } finally {
      contactSelecting = false;
    }
  }

  function nativeSet(el,val) {
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
    if (d?.set) d.set.call(el,val); else el.value = val;
  }

  function sink() {
    let x = document.getElementById('uniscan-sink');
    if (!x) {
      x = document.createElement('button');
      x.id = 'uniscan-sink';
      x.type = 'button';
      x.tabIndex = -1;
      x.setAttribute('aria-hidden','true');
      x.style.cssText='position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none';
      document.documentElement.appendChild(x);
    }
    return x;
  }

  function softKeyboardGuard(ms=1400) {
    softGuardUntil = Date.now()+ms;
    const t = setInterval(() => {
      if (Date.now() >= softGuardUntil) { clearInterval(t); return; }
      if (Date.now()-lastUserGesture < 700) return;
      const a = document.activeElement;
      if (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement) {
        if (a.id !== 'kitNumber' && a.id !== 'dxContact') {
          try { a.blur(); } catch {}
          try { sink().focus({preventScroll:true}); } catch {}
        }
      }
    },80);
  }

  async function commitBarcode(raw) {
    const code = String(raw || '').trim();
    if (!code) { toast('لم يتم العثور على باركود صالح'); return false; }
    if (code===lastCode && Date.now()-lastAt<CONFIG.duplicateLockMs) return false;
    if (busy) return false;

    busy = true;
    try {
      if (!await ensureAnbar(false)) return false;
      const b = document.querySelector(CONFIG.barcodeSelector);
      if (!b) { toast('لم أجد حقل رقم الباركود'); return false; }

      postScanLock = true;
      applyMode(); ensureTools(); ensureButton();
      softKeyboardGuard();

      b.setAttribute('readonly','readonly');
      b.setAttribute('inputmode','none');
      try { b.focus({preventScroll:true}); } catch { b.focus(); }
      await sleep(70);
      nativeSet(b,code);

      try {
        b.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'insertText',data:code}));
      } catch {
        b.dispatchEvent(new Event('input',{bubbles:true,composed:true}));
      }
      b.dispatchEvent(new Event('change',{bubbles:true,composed:true}));

      lastCode = code; lastAt = Date.now();
      try { navigator.vibrate?.([65,35,65]); } catch {}
      await sleep(220);
      try { sink().focus({preventScroll:true}); } catch {}
      try { b.blur(); } catch {}
      return true;
    } finally {
      busy = false;
      setTimeout(scheduleRefresh,350);
    }
  }

  function beep() {
    try {
      const A = window.AudioContext || window.webkitAudioContext;
      const a = new A(), o = a.createOscillator(), g = a.createGain();
      o.frequency.value=900; g.gain.value=.07; o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime+.09);
      o.onended=()=>a.close().catch(()=>{});
    } catch {}
  }

  async function stopCamera() {
    scanning=false; stable=''; stableCount=0;
    if (raf) { cancelAnimationFrame(raf); raf=0; }
    const h=html5; html5=null;
    if (h) { try{await h.stop()}catch{} try{h.clear()}catch{} }
    if (stream) { for(const t of stream.getTracks()) try{t.stop()}catch{}; stream=null; }
    if (overlay) { overlay.remove(); overlay=null; }
    document.documentElement.classList.remove('uniscan-scanning');
  }

  function overlayUI() {
    addStyle();
    document.documentElement.classList.add('uniscan-scanning');
    overlay = document.createElement('div');
    overlay.id = 'uniscan-overlay';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.innerHTML = `
      <div class="us-head">
        <button class="close" type="button">إغلاق</button>
        <div class="title">وجّه الكاميرا إلى باركود الكارت</div>
        <button class="manual" type="button">كتابة</button>
      </div>
      <div class="us-cam">
        <video class="native" playsinline muted autoplay hidden></video>
        <div id="uniscan-html5" hidden></div>
        <div class="us-frame"></div>
        <div class="us-line"></div>
        <div class="us-hint">ثبّت الباركود داخل الإطار</div>
      </div>`;
    document.documentElement.appendChild(overlay);
    overlay.querySelector('.close').onclick = () => stopCamera();
    overlay.querySelector('.manual').onclick = async () => {
      const v = prompt('اكتب رقم الباركود:');
      if (v) { await stopCamera(); await commitBarcode(v); }
    };
  }

  async function ensureHtml5Qrcode() {
    if (window.Html5Qrcode) return true;
    if (html5Promise) return html5Promise;
    html5Promise = new Promise((resolve,reject) => {
      const old = document.querySelector('script[data-uniscan-html5]');
      if (old) {
        old.addEventListener('load',()=>resolve(!!window.Html5Qrcode),{once:true});
        old.addEventListener('error',reject,{once:true});
        return;
      }
      const s = document.createElement('script');
      s.src = CONFIG.html5Src;
      s.async = true;
      s.dataset.uniscanHtml5 = '1';
      s.onload = () => resolve(!!window.Html5Qrcode);
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return html5Promise;
  }

  async function accept(value) {
    if (!scanning) return;
    value = String(value || '').trim();
    if (!value) return;
    if (value===stable) stableCount++; else { stable=value; stableCount=1; }
    if (stableCount<CONFIG.stableReadsRequired) return;
    scanning=false;
    beep();
    await stopCamera();
    await commitBarcode(value);
  }

  async function nativeScanner() {
    const video = overlay.querySelector('.native');
    video.hidden = false;
    const supported = await BarcodeDetector.getSupportedFormats();
    const formats = CONFIG.scanFormats.filter(f => supported.includes(f));
    const detector = formats.length ? new BarcodeDetector({formats}) : new BarcodeDetector();

    stream = await navigator.mediaDevices.getUserMedia({
      video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},
      audio:false
    });
    video.srcObject = stream;
    await video.play();

    const loop = async () => {
      if (!scanning || !overlay) return;
      if (video.readyState>=2) {
        try {
          const r = await detector.detect(video);
          if (r?.[0]) await accept(r[0].rawValue);
        } catch {}
      }
      if (scanning) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  async function fallbackScanner() {
    await ensureHtml5Qrcode();
    if (!window.Html5Qrcode) throw new Error('scanner unavailable');
    const host = overlay.querySelector('#uniscan-html5');
    host.hidden = false;
    html5 = new window.Html5Qrcode('uniscan-html5',{verbose:false});
    await html5.start(
      {facingMode:'environment'},
      {
        fps:12,
        aspectRatio:1.777778,
        qrbox:(w,h)=>({width:Math.min(Math.floor(w*.9),520),height:Math.min(Math.max(100,Math.floor(h*.23)),190)})
      },
      t=>accept(t),
      ()=>{}
    );
  }

  async function startScanner() {
    if (busy || scanning) return;
    if (!isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      toast('الكاميرا غير متاحة');
      return;
    }
    try { document.activeElement?.blur?.(); } catch {}
    await stopCamera();
    overlayUI();
    scanning = true;

    if ('BarcodeDetector' in window) {
      try { await nativeScanner(); return; }
      catch (e) {
        if (e?.name==='NotAllowedError') {
          await stopCamera(); toast('اسمح للكاميرا من إعدادات الموقع'); return;
        }
        if (stream) { for(const t of stream.getTracks()) try{t.stop()}catch{}; stream=null; }
        const v=overlay?.querySelector('.native'); if (v) v.hidden=true;
      }
    }

    try { await fallbackScanner(); }
    catch (e) {
      await stopCamera();
      toast(e?.name==='NotAllowedError' ? 'اسمح للكاميرا من إعدادات المتصفح' : 'تعذر تشغيل الماسح',3500);
    }
  }

  function isBarcodeTapTarget(target) {
    if (!(target instanceof Element)) return false;
    const b = document.querySelector(CONFIG.barcodeSelector);
    if (!b) return false;
    if (target===b || target.closest?.(CONFIG.barcodeSelector)) return true;
    const block = findFieldBlock(b,'رقم الباركود');
    return !!(block && block.contains(target));
  }

  let lastTapOpenAt = 0;
  function delegatedBarcodeTap(e) {
    if (!scanMode || !mobile() || !scanStep() || !isBarcodeTapTarget(e.target)) return;
    const now=Date.now();
    if (now-lastTapOpenAt<700) { e.preventDefault(); e.stopPropagation(); return; }
    lastTapOpenAt=now;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.();
    startScanner();
  }

  function configureBarcodeField() {
    const b = document.querySelector(CONFIG.barcodeSelector);
    if (!b) return;
    const block = findFieldBlock(b,'رقم الباركود');
    if (block) block.classList.add('uniscan-barcode-field');

    if (mobile() && scanMode && scanStep()) {
      b.setAttribute('readonly','readonly');
      b.setAttribute('inputmode','none');
      b.setAttribute('autocomplete','off');
      b.setAttribute('aria-label','مسح الباركود بالكاميرا');
    } else if (!postScanLock) {
      b.removeAttribute('readonly');
      b.removeAttribute('inputmode');
      b.removeAttribute('aria-label');
    }
  }

  async function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer=setTimeout(async() => {
      if (!targetPage()) return;
      ensureViewport();
      addStyle();

      applyMode();
      ensureTools();
      ensureButton();
      configureBarcodeField();

      if (scanStep()) {
        await ensureAnbar(true);
        applyMode();
        configureBarcodeField();
        ensureButton();
      }
    },120);
  }

  function activate() {
    if (activated || !targetPage()) return;
    activated=true;
    ensureViewport();
    addStyle();

    document.addEventListener('pointerdown',()=>{lastUserGesture=Date.now()},true);
    document.addEventListener('touchstart',()=>{lastUserGesture=Date.now()},{capture:true,passive:true});
    document.addEventListener('pointerdown',delegatedBarcodeTap,true);
    document.addEventListener('touchstart',delegatedBarcodeTap,{capture:true,passive:false});

    new MutationObserver(scheduleRefresh).observe(document.documentElement,{childList:true,subtree:true});
    addEventListener('resize',scheduleRefresh);
    addEventListener('pagehide',()=>stopCamera(),{once:true});

    scheduleRefresh();
    console.info('[UniScan] Evoya Mobile v1.4.0 activated');
  }

  // Evoya SPA: this stays tiny on login and activates only when the demographic-entry controls exist.
  const watcher=setInterval(() => {
    if (targetPage()) {
      clearInterval(watcher);
      activate();
    }
  },350);

  activate();
})();
