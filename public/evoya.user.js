// ==UserScript==
// @name         UniScan Evoya
// @namespace    uniscan.evoya
// @version      1.3.8
// @description  UniScan للغربلة: تفعيل Evoya SPA + ماسح باركود ملء الشاشة على الهاتف.
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
  if (window.__UNISCAN_EVOYA_138__) return;
  window.__UNISCAN_EVOYA_138__ = true;

  const CONTACT = '#dxContact';
  const BARCODE = '#kitNumber';
  const HTML5_SRC = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => String(s || '')
    .replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه')
    .replace(/[\u064B-\u065F\u0670]/g,'').replace(/\s+/g,' ').trim().toLowerCase();

  let activated = false;
  let overlay = null, stream = null, html5 = null, raf = 0;
  let scanning = false, busy = false, postScan = false;
  let stable = '', stableCount = 0, lastCode = '', lastAt = 0;
  let refreshTimer = 0, html5Promise = null;

  const targetPage = () => !!document.querySelector(CONTACT) && !!document.querySelector(BARCODE);

  function scanStep() {
    const b = document.querySelector(BARCODE);
    if (postScan && b && !String(b.value || '').trim()) postScan = false;
    return targetPage() && !postScan;
  }

  function ensureStyle() {
    if (document.getElementById('uniscan-style')) return;
    const s = document.createElement('style');
    s.id = 'uniscan-style';
    s.textContent = `
      #uniscan-ready,#uniscan-overlay,#uniscan-toast{
        font-family:system-ui,-apple-system,"Segoe UI",Arial,sans-serif!important
      }
      #uniscan-ready{
        position:fixed!important;z-index:2147483644!important;left:50%!important;bottom:24px!important;
        transform:translateX(-50%)!important;background:#111827ed!important;color:#fff!important;
        border-radius:999px!important;padding:9px 14px!important;font-size:13px!important;font-weight:800!important;
        white-space:nowrap!important
      }
      #uniscan-ready[hidden]{display:none!important}
      #uniscan-toast{
        position:fixed!important;z-index:2147483647!important;left:50%!important;bottom:90px!important;
        transform:translateX(-50%)!important;background:#111827f5!important;color:#fff!important;
        border-radius:14px!important;padding:11px 15px!important;max-width:90vw!important;text-align:center!important;font-weight:700!important
      }

      html.uniscan-scanning,html.uniscan-scanning body{
        overflow:hidden!important;overscroll-behavior:none!important
      }
      html.uniscan-scanning > body{
        visibility:hidden!important
      }
      html.uniscan-scanning > #uniscan-overlay{
        visibility:visible!important
      }

      #uniscan-overlay{
        position:fixed!important;
        top:0!important;right:auto!important;bottom:auto!important;left:0!important;
        width:100vw!important;width:100dvw!important;
        height:100vh!important;height:100dvh!important;
        min-width:100vw!important;min-height:100vh!important;
        max-width:none!important;max-height:none!important;
        margin:0!important;padding:0!important;border:0!important;
        transform:none!important;translate:none!important;
        box-sizing:border-box!important;
        z-index:2147483647!important;background:#000!important;
        display:flex!important;flex-direction:column!important;direction:rtl!important;
        overflow:hidden!important;contain:none!important
      }
      #uniscan-overlay *{box-sizing:border-box!important}
      #uniscan-overlay .us-head{
        flex:0 0 auto!important;width:100%!important;min-height:58px!important;
        display:flex!important;align-items:center!important;gap:8px!important;
        padding:max(10px,env(safe-area-inset-top)) 12px 10px!important;
        background:#050505!important;color:#fff!important
      }
      #uniscan-overlay .us-head .title{
        flex:1!important;text-align:center!important;font-size:14px!important;font-weight:800!important
      }
      #uniscan-overlay .us-head button{
        min-width:64px!important;min-height:42px!important;border:1px solid #ffffff55!important;
        background:#ffffff1f!important;color:#fff!important;border-radius:12px!important;padding:8px 10px!important;
        font:inherit!important
      }
      #uniscan-overlay .us-cam{
        position:relative!important;flex:1 1 auto!important;width:100%!important;min-height:0!important;
        overflow:hidden!important;background:#000!important
      }
      #uniscan-overlay video,
      #uniscan-overlay #uniscan-html5,
      #uniscan-overlay #uniscan-html5 > div{
        width:100%!important;height:100%!important;max-width:none!important;max-height:none!important
      }
      #uniscan-overlay video,
      #uniscan-overlay #uniscan-html5 video,
      #uniscan-overlay #uniscan-html5 canvas{
        width:100%!important;height:100%!important;object-fit:cover!important;display:block!important
      }
      #uniscan-html5{position:absolute!important;inset:0!important;background:#000!important}
      #uniscan-html5 img{display:none!important}
      #uniscan-overlay .us-frame{
        position:absolute!important;left:7%!important;right:7%!important;top:37%!important;height:25%!important;
        border:3px solid #fff!important;border-radius:18px!important;
        box-shadow:0 0 0 9999px #00000055!important;pointer-events:none!important
      }
      #uniscan-overlay .us-line{
        position:absolute!important;left:11%!important;right:11%!important;top:49.5%!important;height:2px!important;
        background:#fff!important;pointer-events:none!important
      }
      #uniscan-overlay .us-hint{
        position:absolute!important;left:15px!important;right:15px!important;
        bottom:max(18px,env(safe-area-inset-bottom))!important;color:#fff!important;text-align:center!important;
        font-size:14px!important;font-weight:800!important;text-shadow:0 2px 5px #000!important
      }
    `;
    document.documentElement.appendChild(s);
  }

  let toastTimer;
  function toast(text, ms=2500) {
    let e = document.getElementById('uniscan-toast');
    if (!e) {
      e = document.createElement('div');
      e.id = 'uniscan-toast';
      document.documentElement.appendChild(e);
    }
    e.textContent = text;
    e.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { e.hidden = true; }, ms);
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

  async function waitAnbar(timeout=3200) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const x = [...document.querySelectorAll('[role="option"]')]
        .find(e => norm(e.textContent).includes('الانبار'));
      if (x) return x;
      await sleep(70);
    }
    return null;
  }

  async function ensureAnbar(quiet=false) {
    const c = document.querySelector(CONTACT);
    if (!c) return false;
    if (norm(c.value).includes('الانبار')) return true;
    try {
      c.focus();
      c.click();
      const o = await waitAnbar();
      if (!o) {
        try { c.blur(); } catch {}
        if (!quiet) toast('لم أجد خيار الأنبار');
        return false;
      }
      o.click();
      await sleep(180);
      return norm(c.value).includes('الانبار');
    } catch {
      if (!quiet) toast('تعذر تحديد الأنبار');
      return false;
    }
  }

  function nativeSet(el, val) {
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (d?.set) d.set.call(el, val);
    else el.value = val;
  }

  function sink() {
    let x = document.getElementById('uniscan-sink');
    if (!x) {
      x = document.createElement('button');
      x.id = 'uniscan-sink';
      x.tabIndex = -1;
      x.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0';
      document.documentElement.appendChild(x);
    }
    return x;
  }

  async function commit(raw) {
    const code = String(raw || '').trim();
    if (!code || busy) return false;
    if (code === lastCode && Date.now() - lastAt < 5000) return false;
    busy = true;
    try {
      if (!await ensureAnbar()) return false;
      const b = document.querySelector(BARCODE);
      if (!b) return false;

      postScan = true;
      ready(false);
      b.setAttribute('readonly', 'readonly');
      b.setAttribute('inputmode', 'none');

      try { b.focus({preventScroll:true}); } catch { b.focus(); }
      await sleep(60);
      nativeSet(b, code);

      try {
        b.dispatchEvent(new InputEvent('input', {
          bubbles:true, composed:true, inputType:'insertText', data:code
        }));
      } catch {
        b.dispatchEvent(new Event('input', {bubbles:true, composed:true}));
      }
      b.dispatchEvent(new Event('change', {bubbles:true, composed:true}));

      lastCode = code;
      lastAt = Date.now();
      try { navigator.vibrate?.([60,30,60]); } catch {}

      await sleep(230);
      try { sink().focus({preventScroll:true}); } catch {}
      try { b.blur(); } catch {}
      return true;
    } finally {
      busy = false;
      setTimeout(refresh, 350);
    }
  }

  function beep() {
    try {
      const A = window.AudioContext || window.webkitAudioContext;
      const a = new A(), o = a.createOscillator(), g = a.createGain();
      o.frequency.value = 900;
      g.gain.value = .06;
      o.connect(g); g.connect(a.destination);
      o.start(); o.stop(a.currentTime + .08);
      o.onended = () => a.close().catch(() => {});
    } catch {}
  }

  async function stopCamera() {
    scanning = false;
    stable = '';
    stableCount = 0;
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    const h = html5;
    html5 = null;
    if (h) {
      try { await h.stop(); } catch {}
      try { h.clear(); } catch {}
    }
    if (stream) {
      for (const t of stream.getTracks()) {
        try { t.stop(); } catch {}
      }
      stream = null;
    }
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
    document.documentElement.classList.remove('uniscan-scanning');
  }

  function overlayUI() {
    ensureStyle();
    document.documentElement.classList.add('uniscan-scanning');

    overlay = document.createElement('div');
    overlay.id = 'uniscan-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
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

    for (const [k,v] of Object.entries({
      position:'fixed', top:'0', left:'0', width:'100dvw', height:'100dvh',
      margin:'0', padding:'0', transform:'none', zIndex:'2147483647'
    })) {
      const prop = k === 'zIndex' ? 'z-index' : k;
      overlay.style.setProperty(prop, v, 'important');
    }

    overlay.querySelector('.close').onclick = () => stopCamera();
    overlay.querySelector('.manual').onclick = async () => {
      const v = prompt('اكتب رقم الباركود:');
      if (v) {
        await stopCamera();
        await commit(v);
      }
    };
  }

  async function accept(v) {
    if (!scanning) return;
    v = String(v || '').trim();
    if (!v) return;
    if (v === stable) stableCount++;
    else { stable = v; stableCount = 1; }
    if (stableCount < 2) return;

    scanning = false;
    beep();
    await stopCamera();
    await commit(v);
  }

  async function ensureHtml5Qrcode() {
    if (window.Html5Qrcode) return true;
    if (html5Promise) return html5Promise;

    html5Promise = new Promise((resolve, reject) => {
      const old = document.querySelector('script[data-uniscan-html5]');
      if (old) {
        old.addEventListener('load', () => resolve(!!window.Html5Qrcode), {once:true});
        old.addEventListener('error', reject, {once:true});
        return;
      }
      const s = document.createElement('script');
      s.src = HTML5_SRC;
      s.async = true;
      s.dataset.uniscanHtml5 = '1';
      s.onload = () => resolve(!!window.Html5Qrcode);
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return html5Promise;
  }

  async function nativeScanner() {
    const video = overlay.querySelector('.native');
    video.hidden = false;
    const formats = await BarcodeDetector.getSupportedFormats();
    const wanted = ['code_128','code_39','ean_13','ean_8','itf','codabar','upc_a','upc_e']
      .filter(x => formats.includes(x));
    const detector = wanted.length ? new BarcodeDetector({formats:wanted}) : new BarcodeDetector();

    stream = await navigator.mediaDevices.getUserMedia({
      video:{
        facingMode:{ideal:'environment'},
        width:{ideal:1280},
        height:{ideal:720}
      },
      audio:false
    });
    video.srcObject = stream;
    await video.play();

    const loop = async () => {
      if (!scanning || !overlay) return;
      if (video.readyState >= 2) {
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
    if (typeof window.Html5Qrcode === 'undefined') throw new Error('scanner unavailable');
    const host = overlay.querySelector('#uniscan-html5');
    host.hidden = false;
    html5 = new window.Html5Qrcode('uniscan-html5', {verbose:false});
    await html5.start(
      {facingMode:'environment'},
      {
        fps:12,
        aspectRatio:1.777778,
        qrbox:(w,h) => ({
          width:Math.min(Math.floor(w*.9), 520),
          height:Math.min(Math.max(100, Math.floor(h*.23)), 190)
        })
      },
      t => accept(t),
      () => {}
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
      try {
        await nativeScanner();
        return;
      } catch (e) {
        if (e?.name === 'NotAllowedError') {
          await stopCamera();
          toast('اسمح للكاميرا من إعدادات الموقع');
          return;
        }
        if (stream) {
          for (const t of stream.getTracks()) {
            try { t.stop(); } catch {}
          }
          stream = null;
        }
        const v = overlay?.querySelector('.native');
        if (v) v.hidden = true;
      }
    }

    try {
      await fallbackScanner();
    } catch (e) {
      await stopCamera();
      toast(
        e?.name === 'NotAllowedError'
          ? 'اسمح للكاميرا من إعدادات المتصفح'
          : 'تعذر تشغيل الماسح',
        3500
      );
    }
  }

  function configureField() {
    const b = document.querySelector(BARCODE);
    if (!b) return;
    if (scanStep()) {
      b.setAttribute('readonly','readonly');
      b.setAttribute('inputmode','none');
      b.setAttribute('autocomplete','off');
    } else if (!postScan) {
      b.removeAttribute('readonly');
      b.removeAttribute('inputmode');
    }
  }

  function tapped(e) {
    if (!scanStep() || innerWidth > 900) return;
    const b = document.querySelector(BARCODE);
    if (!b || !(e.target === b || b.contains?.(e.target))) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();
    startScanner();
  }

  async function refresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      if (!targetPage()) return;
      ensureStyle();
      if (postScan) {
        ready(false);
        return;
      }
      configureField();
      ready(scanStep());
      if (scanStep()) await ensureAnbar(true);
    }, 100);
  }

  function activate() {
    if (activated || !targetPage()) return;
    activated = true;
    ensureStyle();

    document.addEventListener('pointerdown', tapped, true);
    document.addEventListener('touchstart', tapped, {capture:true, passive:false});
    new MutationObserver(refresh).observe(document.documentElement, {
      subtree:true, childList:true
    });
    addEventListener('resize', refresh);
    addEventListener('pagehide', () => stopCamera(), {once:true});

    refresh();
    console.info('[UniScan] Evoya standalone v1.3.8 activated');
  }

  const watcher = setInterval(() => {
    if (targetPage()) {
      clearInterval(watcher);
      activate();
    }
  }, 350);

  activate();
})();
