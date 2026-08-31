// ==UserScript==
// @name         UniScan Evoya
// @namespace    uniscan.evoya
// @version      1.3.5
// @description  UniScan للغربلة: إصلاح عرض اقتراحات Evoya على الهاتف بعد مسح الباركود.
// @match        https://iraq-central-moh-nbs.evoya.revvitycloud.com/home/management/remote-demographic-entry*
// @run-at       document-idle
// @noframes
// @inject-into  content
// @require      https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js
// @updateURL    https://uniscan-evoya.workmail97x.workers.dev/evoya.meta.js
// @downloadURL  https://uniscan-evoya.workmail97x.workers.dev/evoya.user.js
// @homepageURL  https://uniscan-evoya.workmail97x.workers.dev
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  if (window.__UNISCAN_EVOYA_135__) return;
  window.__UNISCAN_EVOYA_135__ = true;

  const CONTACT = '#dxContact', BARCODE = '#kitNumber';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => String(s || '').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه')
    .replace(/[\u064B-\u065F\u0670]/g,'').replace(/\s+/g,' ').trim().toLowerCase();

  let overlay=null, stream=null, html5=null, raf=0, scanning=false, busy=false, postScan=false;
  let stable='', stableCount=0, lastCode='', lastAt=0, keyboardGuardUntil=0, refreshTimer=0;
  let lastUserGesture=0;

  const targetPage = () => !!document.querySelector(CONTACT) && !!document.querySelector(BARCODE);
  const recentUserGesture = () => Date.now()-lastUserGesture < 1200;
  function scanStep(){
    const b=document.querySelector(BARCODE);
    if(postScan && b && !String(b.value||'').trim()) postScan=false;
    return targetPage() && !postScan;
  }

  function ensureStyle(){
    if(document.getElementById('uniscan-style')) return;
    const s=document.createElement('style'); s.id='uniscan-style'; s.textContent=`
      #uniscan-ready,#uniscan-overlay,#uniscan-toast{font-family:system-ui,-apple-system,"Segoe UI",Arial,sans-serif!important}
      #uniscan-ready{position:fixed!important;z-index:2147483644!important;left:50%!important;bottom:24px!important;transform:translateX(-50%)!important;background:#111827ed!important;color:#fff!important;border-radius:999px!important;padding:9px 14px!important;font-size:13px!important;font-weight:800!important;white-space:nowrap!important}
      #uniscan-ready[hidden]{display:none!important}
      #uniscan-toast{position:fixed!important;z-index:2147483647!important;left:50%!important;bottom:90px!important;transform:translateX(-50%)!important;background:#111827f5!important;color:#fff!important;border-radius:14px!important;padding:11px 15px!important;max-width:90vw!important;text-align:center!important;font-weight:700!important}
      #uniscan-overlay{position:fixed!important;inset:0!important;z-index:2147483646!important;background:#000!important;display:flex!important;flex-direction:column!important;direction:rtl!important}
      .us-head{display:flex!important;align-items:center!important;gap:8px!important;padding:12px!important;background:#000d!important;color:#fff!important}.us-head .title{flex:1!important;text-align:center!important;font-weight:800!important}.us-head button{min-height:44px!important;border:1px solid #ffffff55!important;background:#ffffff1f!important;color:#fff!important;border-radius:12px!important;padding:8px 12px!important}.us-cam{position:relative!important;flex:1!important;overflow:hidden!important}.us-cam video,#uniscan-html5 video,#uniscan-html5 canvas{width:100%!important;height:100%!important;object-fit:cover!important;display:block!important}#uniscan-html5{position:absolute!important;inset:0!important;background:#000!important}#uniscan-html5 img{display:none!important}.us-frame{position:absolute!important;left:7%!important;right:7%!important;top:38%!important;height:24%!important;border:3px solid #fff!important;border-radius:18px!important;box-shadow:0 0 0 9999px #00000055!important;pointer-events:none!important}.us-line{position:absolute!important;left:11%!important;right:11%!important;top:50%!important;height:2px!important;background:#fff!important;pointer-events:none!important}.us-hint{position:absolute!important;left:15px!important;right:15px!important;bottom:18px!important;color:#fff!important;text-align:center!important;font-weight:800!important;text-shadow:0 2px 5px #000!important}
      @media(max-width:900px){
        html.uniscan-postscan .dx-overlay-wrapper .dx-list,
        html.uniscan-postscan .dx-overlay-wrapper .dx-scrollable,
        html.uniscan-postscan .dx-overlay-wrapper .dx-scrollable-container,
        html.uniscan-postscan .dx-overlay-wrapper .dx-scrollable-content{
          width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important
        }
        html.uniscan-postscan .dx-overlay-wrapper .dx-list-item{
          width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important;
          color:#111827!important;background:#fff!important;opacity:1!important;visibility:visible!important;
          direction:rtl!important;text-align:right!important;overflow:visible!important
        }
        html.uniscan-postscan .dx-overlay-wrapper .dx-list-item-content{
          display:block!important;width:100%!important;max-width:100%!important;min-width:0!important;
          box-sizing:border-box!important;color:#111827!important;background:#fff!important;opacity:1!important;
          visibility:visible!important;font-size:16px!important;line-height:1.55!important;direction:rtl!important;
          text-align:right!important;white-space:normal!important;overflow:visible!important;padding:11px 14px!important
        }
      }`;
    document.documentElement.appendChild(s);
  }

  let toastTimer;
  function toast(text,ms=2500){
    let e=document.getElementById('uniscan-toast'); if(!e){e=document.createElement('div');e.id='uniscan-toast';document.body.appendChild(e)}
    e.textContent=text;e.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.hidden=true,ms);
  }
  function ready(show){
    let e=document.getElementById('uniscan-ready'); if(!e){e=document.createElement('div');e.id='uniscan-ready';e.textContent='UniScan جاهز ✓';document.body.appendChild(e)}
    e.hidden=!show;
  }

  function repairSuggestionPopup(){
    document.documentElement.classList.toggle('uniscan-postscan', !!postScan);
    if(!postScan || innerWidth>900) return;
    for(const list of document.querySelectorAll('.dx-overlay-wrapper .dx-list')){
      list.style.setProperty('width','100%','important');
      list.style.setProperty('max-width','100%','important');
      for(const item of list.querySelectorAll('.dx-list-item,.dx-list-item-content')){
        item.style.setProperty('max-width','100%','important');
        item.style.setProperty('min-width','0','important');
        item.style.setProperty('box-sizing','border-box','important');
        item.style.setProperty('color','#111827','important');
        item.style.setProperty('opacity','1','important');
        item.style.setProperty('visibility','visible','important');
        item.style.setProperty('direction','rtl','important');
        item.style.setProperty('text-align','right','important');
      }
    }
  }

  async function waitAnbar(timeout=3200){
    const start=Date.now();
    while(Date.now()-start<timeout){
      const x=[...document.querySelectorAll('[role="option"]')].find(e=>norm(e.textContent).includes('الانبار'));
      if(x) return x; await sleep(70);
    }
    return null;
  }
  async function ensureAnbar(quiet=false){
    const c=document.querySelector(CONTACT); if(!c) return false;
    if(norm(c.value).includes('الانبار')) return true;
    try{c.focus();c.click();const o=await waitAnbar();if(!o){try{c.blur()}catch{};if(!quiet)toast('لم أجد خيار الأنبار');return false}o.click();await sleep(180);return norm(c.value).includes('الانبار')}
    catch{if(!quiet)toast('تعذر تحديد الأنبار');return false}
  }

  function nativeSet(el,val){const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');if(d?.set)d.set.call(el,val);else el.value=val}
  function sink(){let x=document.getElementById('uniscan-sink');if(!x){x=document.createElement('button');x.id='uniscan-sink';x.tabIndex=-1;x.style.cssText='position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0';document.body.appendChild(x)}return x}
  function textField(el){return el instanceof HTMLElement&&(el.matches('textarea')||(el.matches('input')&&!['hidden','button','submit','checkbox','radio','file'].includes((el.type||'text').toLowerCase())))}
  function suppressAutoFocus(el){return Date.now()<keyboardGuardUntil && !recentUserGesture() && textField(el) && el.id!=='kitNumber'}
  function guardKeyboard(ms=4200){keyboardGuardUntil=Date.now()+ms;const t=setInterval(()=>{if(Date.now()>=keyboardGuardUntil){clearInterval(t);return}const a=document.activeElement;if(suppressAutoFocus(a)){try{a.blur()}catch{};try{sink().focus({preventScroll:true})}catch{}}},70)}

  async function commit(raw){
    const code=String(raw||'').trim(); if(!code||busy) return false;
    if(code===lastCode && Date.now()-lastAt<5000) return false;
    busy=true;
    try{
      if(!await ensureAnbar()) return false;
      const b=document.querySelector(BARCODE); if(!b) return false;
      postScan=true; document.documentElement.classList.add('uniscan-postscan'); ready(false); guardKeyboard();
      b.setAttribute('readonly','readonly'); b.setAttribute('inputmode','none');
      try{b.focus({preventScroll:true})}catch{b.focus()}
      await sleep(60); nativeSet(b,code);
      try{b.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'insertText',data:code}))}catch{b.dispatchEvent(new Event('input',{bubbles:true,composed:true}))}
      b.dispatchEvent(new Event('change',{bubbles:true,composed:true})); lastCode=code; lastAt=Date.now();
      try{navigator.vibrate?.([60,30,60])}catch{}; await sleep(230);
      try{sink().focus({preventScroll:true})}catch{}; try{b.blur()}catch{}; return true;
    } finally {busy=false;setTimeout(refresh,350)}
  }

  function beep(){try{const A=AudioContext||webkitAudioContext,a=new A(),o=a.createOscillator(),g=a.createGain();o.frequency.value=900;g.gain.value=.06;o.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+.08);o.onended=()=>a.close().catch(()=>{})}catch{}}
  async function stopCamera(){scanning=false;stable='';stableCount=0;if(raf){cancelAnimationFrame(raf);raf=0}const h=html5;html5=null;if(h){try{await h.stop()}catch{}try{h.clear()}catch{}}if(stream){for(const t of stream.getTracks())try{t.stop()}catch{};stream=null}if(overlay){overlay.remove();overlay=null}}
  function overlayUI(){overlay=document.createElement('div');overlay.id='uniscan-overlay';overlay.innerHTML=`<div class="us-head"><button class="close">إغلاق</button><div class="title">وجّه الكاميرا إلى باركود الكارت</div><button class="manual">كتابة</button></div><div class="us-cam"><video class="native" playsinline muted autoplay hidden></video><div id="uniscan-html5" hidden></div><div class="us-frame"></div><div class="us-line"></div><div class="us-hint">ثبّت الباركود داخل الإطار</div></div>`;document.body.appendChild(overlay);overlay.querySelector('.close').onclick=()=>stopCamera();overlay.querySelector('.manual').onclick=async()=>{const v=prompt('اكتب رقم الباركود:');if(v){await stopCamera();await commit(v)}}}
  async function accept(v){if(!scanning)return;v=String(v||'').trim();if(!v)return;if(v===stable)stableCount++;else{stable=v;stableCount=1}if(stableCount<2)return;scanning=false;beep();await stopCamera();await commit(v)}

  async function nativeScanner(){
    const video=overlay.querySelector('.native');video.hidden=false;const formats=await BarcodeDetector.getSupportedFormats();const wanted=['code_128','code_39','ean_13','ean_8','itf','codabar','upc_a','upc_e'].filter(x=>formats.includes(x));const detector=wanted.length?new BarcodeDetector({formats:wanted}):new BarcodeDetector();
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});video.srcObject=stream;await video.play();
    const loop=async()=>{if(!scanning||!overlay)return;if(video.readyState>=2){try{const r=await detector.detect(video);if(r?.[0])await accept(r[0].rawValue)}catch{}}if(scanning)raf=requestAnimationFrame(loop)};raf=requestAnimationFrame(loop);
  }
  async function fallbackScanner(){if(typeof Html5Qrcode==='undefined')throw new Error('scanner unavailable');const host=overlay.querySelector('#uniscan-html5');host.hidden=false;html5=new Html5Qrcode('uniscan-html5',{verbose:false});await html5.start({facingMode:'environment'},{fps:12,aspectRatio:1.777778,qrbox:(w,h)=>({width:Math.min(Math.floor(w*.9),520),height:Math.min(Math.max(100,Math.floor(h*.23)),190)})},t=>accept(t),()=>{})}
  async function startScanner(){
    if(busy||scanning)return;if(!isSecureContext||!navigator.mediaDevices?.getUserMedia){toast('الكاميرا غير متاحة');return}
    try{document.activeElement?.blur?.()}catch{};await stopCamera();overlayUI();scanning=true;
    if('BarcodeDetector' in window){try{await nativeScanner();return}catch(e){if(e?.name==='NotAllowedError'){await stopCamera();toast('اسمح للكاميرا من إعدادات الموقع');return}if(stream){for(const t of stream.getTracks())try{t.stop()}catch{};stream=null}const v=overlay?.querySelector('.native');if(v)v.hidden=true}}
    try{await fallbackScanner()}catch(e){await stopCamera();toast(e?.name==='NotAllowedError'?'اسمح للكاميرا من إعدادات Safari':'تعذر تشغيل الماسح',3500)}
  }

  function configureField(){const b=document.querySelector(BARCODE);if(!b)return;if(scanStep()){b.setAttribute('readonly','readonly');b.setAttribute('inputmode','none');b.setAttribute('autocomplete','off')}else if(!postScan){b.removeAttribute('readonly');b.removeAttribute('inputmode')}}
  function tapped(e){if(!scanStep()||innerWidth>900)return;const b=document.querySelector(BARCODE);if(!b||!(e.target===b||b.contains?.(e.target)))return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation?.();startScanner()}
  async function refresh(){clearTimeout(refreshTimer);refreshTimer=setTimeout(async()=>{ensureStyle();repairSuggestionPopup();const a=document.activeElement;if(suppressAutoFocus(a))try{a.blur()}catch{};if(postScan){ready(false);return}configureField();ready(scanStep());if(scanStep())await ensureAnbar(true)},100)}

  document.addEventListener('pointerdown',()=>{lastUserGesture=Date.now()},true);
  document.addEventListener('touchstart',()=>{lastUserGesture=Date.now()},{capture:true,passive:true});
  document.addEventListener('pointerdown',tapped,true);
  document.addEventListener('touchstart',tapped,{capture:true,passive:false});
  document.addEventListener('focusin',e=>{if(suppressAutoFocus(e.target))setTimeout(()=>{if(!recentUserGesture()){try{e.target.blur()}catch{};try{sink().focus({preventScroll:true})}catch{}}},0)},true);
  ensureStyle();refresh();new MutationObserver(refresh).observe(document.documentElement,{subtree:true,childList:true});addEventListener('resize',refresh);addEventListener('pagehide',()=>stopCamera(),{once:true});
  console.info('[UniScan] Evoya standalone v1.3.5 loaded');
})();
