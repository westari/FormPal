/**
 * lib/homeClean.ts
 *
 * The Home tab's "hyper-clean" pass, layered on top of the Claude-Design
 * artboard (assets/app screens/home.html) WITHOUT editing the design file:
 *
 *  - HOME_CLEAN_JS tags the artboard's elements with data-hc="..." (found by
 *    their text / structure in the rendered DOM, re-run on every DOM change) and
 *    wires the week dots to the real weekly goal.
 *  - HOME_CLEAN_CSS styles those tags. Everything else — the artboard's own
 *    click handlers, the pickers, the edit sheet — is untouched, so it all still
 *    works.
 *
 * The spec, as implemented:
 *   background  #F2F2F7; every card / pill pure white; 90% black-white-grey with
 *               ONE accent (ACCENT) used only for active state
 *   no shadows  every drop shadow removed; a 1px #E4E4E7 hairline instead
 *   rhythm      20px outer margin everywhere, 56px between the main sections,
 *               one radius system (16px cards, 12px thumbnails, pills fully round)
 *   hero card   the rotated "deck" is now a tidy, flat three-card stack
 *   typography  titles bold, all meta text muted grey, secondary header pills
 *               smaller and lighter
 *
 * Plain ES5-ish strings (String.raw). NEVER put a backtick or a dollar-brace in
 * the page code.
 */

export const HOME_ACCENT = '#2E7DFF';   // the single accent: active dots, form bar, Cue
const BG = '#F2F2F7';
const HAIR = '#E4E4E7';                 // zinc-200
const META = '#71717A';                 // zinc-500

export const HOME_CLEAN_CSS = `
[data-hc="root"]{background:${BG}!important;}
/* ── cards + pills: flat white, hairline, no shadow ── */
[data-hc="card"],[data-hc="pill"]{background:#ffffff!important;box-shadow:none!important;border:1px solid ${HAIR}!important;box-sizing:border-box!important;filter:none!important;}
[data-hc="card"]{border-radius:16px!important;}
[data-hc="pill"]{border-radius:999px!important;}
[data-hc="herohead"]{border-bottom:1px solid #F4F4F5!important;}
[data-hc="iconbtn"]{background:#F4F4F5!important;box-shadow:none!important;}
/* ── spacing: 20px outer margin, 56px between the main sections ── */
[data-hc="top"]{padding-left:20px!important;padding-right:20px!important;}
[data-hc="pillrow"]{padding:14px 20px 0!important;}
[data-hc="sec"]{padding-top:56px!important;padding-left:20px!important;padding-right:20px!important;}
[data-hc="sec1"]{padding-top:44px!important;padding-left:20px!important;padding-right:20px!important;}
[data-hc="wrap"]{padding-left:20px!important;padding-right:20px!important;padding-top:16px!important;}
[data-hc="row"]{padding-left:20px!important;padding-right:20px!important;scroll-padding-left:20px!important;}
[data-hc="dots"]{padding-bottom:36px!important;}
[data-hc="dotpill"]{background:#ffffff!important;box-shadow:none!important;border:1px solid ${HAIR}!important;box-sizing:border-box!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;}
[data-hc="dotpill"] > div:first-child{display:none!important;}
[data-hc="stackwrap"]{padding:22px 16px 6px!important;}
[data-hc="cta"]{padding:14px 16px 16px!important;}
/* progress: the two stacked/overlapping cards become two separate, evenly spaced cards */
[data-hc-cue]{margin:12px 0 0!important;padding:16px 18px!important;border-radius:16px!important;}
/* ── radius system ── */
[data-hc="thumb"]{border-radius:12px!important;box-shadow:none!important;}
/* ── hero: a tidy flat three-card preview stack ── */
[data-hc="stack"]{width:200px!important;height:116px!important;}
[data-hc="stk0"],[data-hc="stk1"],[data-hc="stk2"]{width:92px!important;height:112px!important;border-radius:14px!important;transform:none!important;box-shadow:none!important;border:1px solid ${HAIR}!important;box-sizing:border-box!important;}
[data-hc="stk0"]{left:31px!important;top:8px!important;opacity:.5!important;background-color:#F4F4F5!important;}
[data-hc="stk1"]{left:54px!important;top:4px!important;opacity:.8!important;background-color:#F4F4F5!important;}
[data-hc="stk2"]{left:77px!important;top:0!important;opacity:1!important;}
[data-hc="seal"]{left:152px!important;top:84px!important;right:auto!important;bottom:auto!important;width:28px!important;height:28px!important;filter:none!important;}
[data-hc="seal"] svg{width:28px!important;height:28px!important;transform:none!important;}
/* ── typography ── */
[data-hc="meta"]{color:${META}!important;font-weight:500!important;}
[data-hc="meta2"]{color:#A1A1AA!important;}
[data-hc="pill-sub"]{font-size:9.5px!important;color:${META}!important;font-weight:500!important;}
[data-hc="pill-main"]{font-size:12px!important;color:${META}!important;font-weight:600!important;}
[data-hc="pill"] svg path[stroke]{stroke:#A1A1AA!important;}
/* header icon chips: neutral, no glossy colour */
[data-hc="chip"]{background:#F4F4F5!important;box-shadow:none!important;}
[data-hc="chip"] > div{display:none!important;}
[data-hc="chip"] rect{fill:${META}!important;}
[data-hc="chip"] path{fill:${META}!important;}
[data-hc="chip"] circle{fill:#F4F4F5!important;}
[data-hc="flame"]{background:#111114!important;}
[data-hc="streaknum"]{color:#111114!important;}
/* ── ONE accent, active states only ── */
[data-hc="dot-on"]{background:${HOME_ACCENT}!important;box-shadow:none!important;}
[data-hc="dot-off"]{background:${HAIR}!important;box-shadow:none!important;}
[data-hc="ftrack"]{background:#F4F4F5!important;box-shadow:none!important;}
[data-hc="ffill"]{background:${HOME_ACCENT}!important;box-shadow:none!important;}
`;

export interface HomeCleanOpts {
  /** workouts done this week (real) */
  done: number;
  /** weekly goal from the plan (daysPerWeek), default 4 */
  goal: number;
  insetBottom: number;
}

export function homeCleanJs(o: HomeCleanOpts): string {
  return `
(function(){
  var DONE=${Math.max(0, Math.round(o.done))}, GOAL=${Math.max(1, Math.round(o.goal))}, INSET_BOTTOM=${Math.max(0, Math.round(o.insetBottom))};
  var CSS=${JSON.stringify(HOME_CLEAN_CSS)};
  function tag(el,v){ if(el && el.getAttribute && el.getAttribute('data-hc')!==v) el.setAttribute('data-hc',v); }
  // The element a piece of text BELONGS to. The artboard's runtime wraps text in an extra
  // child element, so a "no children" test finds the inner wrapper; pick the outermost
  // element whose whole text is exactly this (its parent holds more than just it).
  function leaf(txt, re){
    var all=document.querySelectorAll('div,span,a');
    for(var i=0;i<all.length;i++){
      var e=all[i]; var t=(e.textContent||'').trim();
      if(!(re? re.test(t) : t===txt)) continue;
      var p=e.parentElement; if(p && (p.textContent||'').trim()===t) continue;
      if(e.tagName==='SPAN' && p && p.tagName==='DIV' && (p.textContent||'').trim()===t) continue;
      return e;
    }
    return null;
  }
  function up(el,test,max){ for(var i=0;el&&i<(max||8);i++,el=el.parentElement){ if(test(el)) return el; } return null; }
  function ensureCss(){
    if(document.getElementById('__hc_css')) return;
    var st=document.createElement('style'); st.id='__hc_css'; st.textContent=CSS; (document.head||document.documentElement).appendChild(st);
  }
  function px(el,prop){ return el&&el.style?el.style[prop]:''; }

  function pass(){
    ensureCss();
    var divs=document.querySelectorAll('div');
    // root canvas + page scroller (bottom clearance for the real tab bar)
    var root=null; for(var i=0;i<divs.length;i++){ if(divs[i].style.width==='390px'&&divs[i].style.height==='844px'){ root=divs[i]; break; } }
    if(!root) return false;
    tag(root,'root');
    var scroller=root.querySelector('[data-scroll]');
    if(scroller){
      var S=window.__dcCanvasScale||1;
      // content ends clear of the floating tab bar: safe-area + bar (~49pt) + 24pt air
      scroller.style.setProperty('padding-bottom', ((INSET_BOTTOM+49+24)/S)+'px','important');
    }
    // header: streak pill
    var streakEl=null; for(var s0=0;s0<divs.length;s0++){ if(divs[s0].style&&divs[s0].style.color==='rgb(242, 112, 28)'){ streakEl=divs[s0]; break; } }
    if(streakEl){
      tag(streakEl,'streaknum');
      var sp=streakEl.parentElement; tag(sp,'pill');
      var hrow=sp&&sp.parentElement&&sp.parentElement.parentElement; tag(hrow,'top');
      var fl=sp&&sp.querySelector('div[role="img"]'); tag(fl,'flame');
    }
    // secondary header pills (Energy / Training at)
    ['Energy','Training at'].forEach(function(lbl){
      var sub=leaf(lbl); if(!sub) return;
      tag(sub,'pill-sub');
      var main=sub.nextElementSibling; tag(main,'pill-main');
      var pill=up(sub,function(e){return e.style&&e.style.height==='40px'&&e.style.borderRadius==='999px';},5)||up(sub,function(e){return e.style&&e.style.height==='40px';},5);
      tag(pill,'pill'); if(pill){ tag(pill.parentElement,'pillrow'); var chip=pill.firstElementChild; tag(chip,'chip'); }
    });
    // section titles
    var today=leaf('Today'); tag(today,'sec1');
    var prog=leaf('Progress'); tag(prog,'sec');
    // titles that are links: tag the LINK itself (it carries the section padding)
    function secEl(e){ return !e?null : (e.tagName==='A' ? e : (e.parentElement&&e.parentElement.tagName==='A' ? e.parentElement : e)); }
    tag(secEl(leaf('Recent Workouts')),'sec');
    tag(secEl(leaf('Learn The Moves')),'sec');
    // hero card
    var btn=null; var as=document.querySelectorAll('a');
    for(var ai=0;ai<as.length;ai++){ if(/^Start workout$/.test((as[ai].textContent||'').trim())){ btn=as[ai]; break; } }
    if(btn){
      var cta=btn&&btn.parentElement; tag(cta,'cta');
      var card=cta&&cta.parentElement; tag(card,'card');
      tag(card&&card.parentElement,'wrap');
      var hh=card&&card.children[0]; tag(hh,'herohead');
      var edit=hh&&hh.querySelector('a[aria-label="Edit workout"]'); tag(edit,'iconbtn');
      var metaEl=hh&&hh.lastElementChild; tag(metaEl,'meta');
      var sw=card&&card.children[1]; tag(sw,'stackwrap');
      var st=sw&&sw.firstElementChild; tag(st,'stack');
      if(st){ tag(st.children[0],'stk0'); tag(st.children[1],'stk1'); tag(st.children[2],'stk2'); tag(st.children[3],'seal'); }
    }
    // progress cards
    var tw=leaf('This week');
    if(tw){
      tag(tw,'meta');
      var pc=up(tw,function(e){return e.style&&/28px/.test(e.style.borderRadius||'');},6)||up(tw,function(e){return e.style&&e.style.display==='flex'&&e.style.position==='relative';},6);
      tag(pc,'card'); tag(pc&&pc.parentElement,'wrap');
      var cue=pc&&pc.nextElementSibling; tag(cue,'card');
      if(cue && !cue.getAttribute('data-hc-cue')) cue.setAttribute('data-hc-cue','1');
      // week dots -> the real weekly goal
      var dotsBox=tw.nextElementSibling;
      if(dotsBox){
        var dots=Array.prototype.slice.call(dotsBox.children).filter(function(d){return !d.getAttribute('data-hc-clone');});
        var clones=Array.prototype.slice.call(dotsBox.children).filter(function(d){return d.getAttribute('data-hc-clone');});
        var base=dots[0];
        while(base && dots.length+clones.length<GOAL){ var c=base.cloneNode(true); c.setAttribute('data-hc-clone','1'); dotsBox.appendChild(c); clones.push(c); }
        var all=dots.concat(clones);
        all.forEach(function(d,i){ d.style.display = i<GOAL ? '' : 'none'; tag(d, i<Math.min(DONE,GOAL) ? 'dot-on':'dot-off'); });
      }
      var fl2=leaf(null,/^\\d+%$/);
      if(fl2){
        var track=fl2.nextElementSibling; tag(track,'ftrack'); tag(track&&track.firstElementChild,'ffill');
      }
    }
    var fs=leaf('Form score'); tag(fs,'meta');
    var cw=leaf('Chat with Cue'); if(!cw){ var ca=document.querySelector('a[href="Cue.dc.html"]'); tag(ca,'meta2'); }
    // recent workouts + learn cards
    var recents=document.querySelectorAll('a[href="Workout Recap v2.dc.html"]');
    for(var r=0;r<recents.length;r++){ tag(recents[r],'card'); var th=recents[r].querySelector('div[role="img"]'); tag(th,'thumb'); var rowEl=recents[r].parentElement; tag(rowEl,'row'); var fsm=recents[r].querySelectorAll('div'); for(var q=0;q<fsm.length;q++){ if(!fsm[q].children.length&&(fsm[q].textContent||'').trim()==='Form score') tag(fsm[q],'meta'); } }
    var learnCards=document.querySelectorAll('a[href="Demo.dc.html"]');
    for(var l=0;l<learnCards.length;l++){
      var a=learnCards[l]; if(a.style.width!=='132px') continue;
      tag(a,'card'); tag(a.parentElement,'row');
      var img=a.firstElementChild; tag(img,'thumb');
      var sub=a.querySelectorAll('div'); for(var m=0;m<sub.length;m++){ if(!sub[m].children.length&&/ · /.test(sub[m].textContent||'')) tag(sub[m],'meta'); }
    }
    // the dots under Recent Workouts
    if(recents.length){ var last=recents[recents.length-1].parentElement; var dd=last&&last.nextElementSibling; tag(dd,'dots'); tag(dd&&dd.firstElementChild,'dotpill'); }
    return true;
  }
  var deb; function schedule(){ clearTimeout(deb); deb=setTimeout(pass,40); }
  try{ new MutationObserver(schedule).observe(document,{childList:true,subtree:true}); }catch(e){}
  window.addEventListener('resize',schedule);
  [0,100,300,700,1500].forEach(function(d){ setTimeout(pass,d); });
  pass();
})();
true;`;
}
