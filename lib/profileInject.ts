/**
 * lib/profileInject.ts
 *
 * Page-side code for the Profile tab (assets/app screens/profile.html). Same
 * architecture as lib/progressInject.ts (see that file + lib/dcLogicPatch.ts):
 * a subclass of the design's own logic fed from `window.__athltData`, plus a
 * small persistent DOM pass for the static markup.
 *
 * What is real vs honest-placeholder here (nothing fake is shown as real):
 *  - REAL: name, member-since, streak, badges (earned from the session log),
 *    weight (weight log), goal / experience / training location / days
 *    (plan profile), audio summary, units, plus Sign out / Delete account /
 *    developer tools that the old native screen had.
 *  - REFERRAL: the design's "Refer a friend" banner opens the referral page, which shows the user's own
 *    code, "0 of 6" friends joined (there is no referral backend yet) and shares through the real share
 *    sheet. "Enter referral code" opens the design's own small screen where a code is typed and saved.
 *    The banner's "$10 off" subtitle and the code screen's "free month" line promised rewards that do not
 *    exist, so those two lines are reworded.
 *  - HIDDEN (no placeholder rows, nothing says "coming soon"): workout reminders / workout time, Apple Health, membership,
 *    and the feature-request / contact-support composers. The app has no backend
 *    or native module for them yet, and the artboard's demo values for them
 *    ("Renews Sep 14, 2027", "$10 per friend") are not true. They come back by
 *    removing their label from HIDDEN_ROWS below once the feature exists.
 *
 * Edits made on the page are persisted by posting {type:'save', patch} to
 * native (debounced); native writes them to their real homes.
 */

export const PROFILE_LOGIC_EXT = String.raw`function (Orig) {
  function D() { return window.__athltData || null; }
  function post(m) { try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch (e) {} }
  var GOALS = [
    ['Build strength', 'Lift heavier on the big moves'],
    ['Get toned', 'Build muscle and lean out together'],
    ['General fitness', 'Stay active and healthy'],
    ['Lose weight', 'Keep muscle while you lean out'],
  ];
  var PLACES = ['Gym', 'Home', 'Outdoors'];
  var timer = null;

  function tracked(s) {
    return { name: s.det.name, age: s.det.age, height: s.det.height, sex: s.det.sex, experience: s.det.experience,
      goal: s.goal, place: s.place, days: s.days, weight: s.weight, units: s.units, pinned: s.pinned || [] };
  }
  // Copy text from inside the page (no native clipboard module is installed).
  function copyText(txt) {
    try {
      var ta = document.createElement('textarea');
      ta.value = txt; ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:0;top:0;opacity:0;font-size:16px;';
      document.body.appendChild(ta);
      ta.focus(); ta.select(); ta.setSelectionRange(0, txt.length);
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) {}
  }
  function row(self, label, value, tap) {
    var r = self.row(label, value, '', null);
    r.tap = tap;
    return r;
  }
  // Rows for features that don't exist yet are removed, not shown as placeholders.
  var HIDDEN_ROWS = ['Restore purchases', 'FormPal Annual', 'Workout time', 'Apple Health', 'Workout reminders', 'Request a feature', 'Contact support'];

  return class extends Orig {
    setState(u, cb) {
      super.setState(u, cb);
      if (!this.__saved) return; // the design's own setStates before real data lands are not edits
      var self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { self.__flush(); }, 600);
    }

    __flush() {
      var cur = tracked(this.state), prev = this.__saved, patch = {}, any = false;
      for (var k in cur) {
        if (JSON.stringify(cur[k]) !== JSON.stringify(prev[k])) { patch[k] = cur[k]; any = true; }
      }
      if (any) { post({ type: 'save', patch: patch }); this.__saved = cur; }
    }

    // Adopt saved settings into the design's own state. Only while no sub-page
    // is open, so a refresh can never yank a field out from under an edit.
    __adopt(d) {
      var s = this.state;
      var det = Object.assign({}, s.det, { name: d.name, email: d.email, age: d.det.age, height: d.det.height, sex: d.det.sex, experience: d.det.experience });
      var earned = d.badgesEarned || [], first = [];
      for (var i = 0; i < earned.length && first.length < 3; i++) if (earned[i]) first.push(i);
      var pinned = d.pinned ? d.pinned.filter(function (k) { return earned[k]; }) : first;
      this.__seedWeight = d.weight != null ? d.weight : 150;
      this.state = Object.assign({}, s, { det: det, goal: d.goalIdx, place: d.placeIdx, days: d.days.slice(), weight: this.__seedWeight, units: d.units, pinned: pinned });
      this.__saved = tracked(this.state);
      this.__seedV = d.seedVersion;
    }

    renderVals() {
      var d = D(), self = this;
      if (d && d.seedVersion !== this.__seedV && !this.state.page && !this.state.card) this.__adopt(d);
      this.GOALS = GOALS;
      this.PLACES = PLACES;
      if (d) {
        this.BADGES = this.BADGES.map(function (b, i) { return b.slice(0, 5).concat([!!(d.badgesEarned && d.badgesEarned[i])]); });
        this.props = Object.assign({}, this.props, { since: d.since, streak: String(d.streak) });
      }
      var v = super.renderVals();
      if (!d) return v;
      var s = this.state, kg = s.units === 1;
      // "Update my plan" really rebuilds the plan natively.
      // Referral: both cards open the referral page, which shows MY code; Invite friends opens the real share
      // sheet (native); Copy copies the code. No friends have joined (no backend yet), so no tier is earned.
      var refCode = d.referral && d.referral.code ? d.referral.code : '';
      v.openRewards = function (e) { if (e && e.preventDefault) e.preventDefault(); self.go('rewards'); };
      v.applyCode = function (e) {
        if (e && e.preventDefault) e.preventDefault();
        var code = (s.draft || '').trim().toUpperCase();
        if (!code) return self.showToast('Enter a code first');
        if (refCode && code === refCode.toUpperCase()) return self.showToast('That is your own code');
        post({ type: 'applyReferralCode', code: code });
        self.showToast('Code saved');
      };
      v.shareLink = function (e) { if (e && e.preventDefault) e.preventDefault(); post({ type: 'shareReferral' }); };
      v.copyLink = function () { copyText(refCode); self.showToast('Code copied'); };
      if (s.page === 'rewards' && v.pg && v.pg.tiers) {
        var joined = d.referral ? d.referral.joined : 0;
        v.pg.tiers = v.pg.tiers.map(function (t, i) {
          var need = [1, 4, 6][i], got = joined >= need;
          return Object.assign({}, t, { bg: got ? '#111114' : '#ffffff', fg: got ? '#ffffff' : '#111114', stateColor: got ? '#1f8a4a' : '#8e8e96' });
        });
      }
      v.applyPlan = function (e) { if (e && e.preventDefault) e.preventDefault(); post({ type: 'applyPlan' }); self.setState({ dirty: null }); self.showToast('Updating your plan…'); };

      var hasWeight = d.weight != null || s.weight !== this.__seedWeight;
      var groups = v.groups.map(function (g) {
        var rows = g.rows.filter(function (r) { return HIDDEN_ROWS.indexOf(r.label) < 0; }).map(function (r, i) {
          if (r.label === 'Weight') r.value = hasWeight ? (kg ? Math.round(s.weight / 2.2046) + ' kg' : s.weight + ' lb') : 'Not set';
          // a value that was never chosen is "Not set", never the design's or a default's (the page only has the picker's starting point)
          else if (r.label === 'Goal' && !d.goalSet && s.goal === d.goalIdx) r.value = 'Not set';
          else if (r.label === 'Where you train' && !d.placeSet && s.place === d.placeIdx) r.value = 'Not set';
          else if (r.label === 'Training days' && !d.daysSet && JSON.stringify(s.days) === JSON.stringify(d.days)) r.value = d.planDays ? d.planDays + (d.planDays === 1 ? ' day a week' : ' days a week') : 'Not set';
          else if (r.label === 'Audio coaching') { r.value = d.audioLabel; r.tap = function () { post({ type: 'nav', to: 'audio' }); }; }
          r.line = i === 0 ? 'none' : '1px solid rgba(17,17,20,0.07)';
          return r;
        });
        return Object.assign({}, g, { rows: rows });
      }).filter(function (g) { return g.rows.length > 0; });
      var line = function (rows) { return rows.map(function (r, i) { r.line = i === 0 ? 'none' : '1px solid rgba(17,17,20,0.07)'; return r; }); };
      var act = function (label, tone, glyph, type, extra) {
        return self.icon(row(self, label, '', function () { post(Object.assign({ type: type }, extra || {})); }), tone, glyph);
      };
      // (Sign out is the artboard's own red button at the bottom — wired in the DOM pass.)
      groups.push({ title: 'Account', rows: line([
        act('Delete account', 'red', 'shield', 'deleteAccount'),
      ]) });
      groups.push({ title: 'Developer', rows: line([
        act('Reset onboarding', 'red', 'restore', 'resetOnboarding'),
        act('ARKit body experiment (DEV)', 'ink', 'camera', 'nav', { to: 'ar' }),
        act('Calibrate an exercise (DEV)', 'teal', 'ruler', 'nav', { to: 'calibrate' }),
        act('Clear calibration overrides (DEV)', 'red', 'shield', 'clearCalibration'),
      ]) });
      v.groups = groups;

      if (s.page === 'details' && v.pg && v.pg.fields) {
        // Email is the account login — not an editable profile field.
        v.pg.fields = v.pg.fields.filter(function (f) { return f.label !== 'Email'; }).map(function (f) {
          if (!f.value) f.value = 'Not set';
          return f;
        });
      }
      return v;
    }
  };
}`;

export const PROFILE_DOM_JS = String.raw`
(function () {
  if (window.__profDomInstalled) return;
  window.__profDomInstalled = true;
  function post(m) { try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch (e) {} }

  var CSS = ''
    + 'html{background:#eeeef1!important;overflow:hidden!important;}'
    + 'body{margin:0!important;padding:0!important;background:#eeeef1!important;overflow:hidden!important;}'
    + '#dc-root{position:relative!important;margin:0 auto!important;width:390px!important;transform-origin:top center!important;}'
    + '#dc-root *{animation:none!important;-webkit-animation:none!important;transition:none!important;-webkit-transition:none!important;}'
    + '*{-webkit-tap-highlight-color:transparent!important;}'
    + '*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;}'
    + 'div[style*="right: 88px"][style*="bottom: 22px"][style*="height: 64px"]{display:none!important;}'
    + 'div[style*="right: 14px"][style*="bottom: 22px"][style*="width: 64px"][style*="height: 64px"]{display:none!important;}'
    + 'input,textarea{font-size:16px!important;}'
    // Nothing is painted until the pass below has seen the page rendered with the user's real data
    // (the artboard shows its own demo text first); <html data-pready> is set by the pass, and a fresh
    // document (the bundle replaces <html> while unpacking) starts hidden again.
    + 'html:not([data-pready]) body{visibility:hidden!important;}'
    // The blanket "no animation" rule above also froze the design's toast at its pre-animation position
    // (left:50% with no translate => a clipped box in the top-right corner). The toast, the member-card
    // sheet's slide-up + backdrop fade, the card's entrance and the tilt easing are real motion the design
    // relies on — give them back (higher specificity than the blanket rule).
    + '#dc-root div[style*="pf-toast"]{animation:pf-toast 2200ms cubic-bezier(.22,1,.36,1) both!important;}'
    + '#dc-root div[style*="pf-sheet"]{animation:pf-sheet 380ms cubic-bezier(.22,1,.36,1) both!important;}'
    // tapping a row opens its page with the design's own push (opacity + translateX only), not an instant jump
    + '#dc-root div[style*="pf-in"]{animation:pf-in 300ms cubic-bezier(.22,1,.36,1) both!important;-webkit-animation:pf-in 300ms cubic-bezier(.22,1,.36,1) both!important;will-change:transform,opacity;}'
    + '#dc-root div[style*="pf-fade"]{animation:pf-fade 220ms ease both!important;}'
    + '#dc-root div[style*="pf-card"]{animation:pf-card 520ms cubic-bezier(.2,.8,.2,1) 60ms both!important;}'
    + '#dc-root div[style*="preserve-3d"]{transition:transform 380ms cubic-bezier(.2,.8,.2,1)!important;}';
  function ensureCss() {
    if (document.getElementById('__prof_css')) return;
    var host = document.head || document.documentElement;
    if (!host) return;
    var s = document.createElement('style');
    s.id = '__prof_css';
    s.textContent = CSS;
    host.appendChild(s);
  }
  var lastS = -1;
  function fit() {
    var root = document.getElementById('dc-root');
    var vh = window.innerHeight;
    if (!root || !vh) return false;
    var S = vh / 844;
    if (Math.abs(S - lastS) >= 0.002 || !root.style.transform) {
      lastS = S;
      root.style.setProperty('transform', 'scale(' + S + ')', 'important');
    }
    document.body.style.setProperty('height', vh + 'px', 'important');
    document.documentElement.style.setProperty('height', vh + 'px', 'important');
    return true;
  }
  function leafWithText(txt) {
    var all = document.querySelectorAll('#dc-root *');
    for (var i = 0; i < all.length; i++) {
      if (all[i].children.length === 0 && (all[i].textContent || '').trim() === txt) return all[i];
    }
    return null;
  }

  // Hide a whole block (its link row + the padded wrapper around it) that has no backend yet.
  function hideBlockWithText(txt) {
    var el = leafWithText(txt);
    var a = el && el.closest('a');
    var wrap = a && a.parentElement;
    if (wrap) wrap.style.setProperty('display', 'none', 'important');
  }

  // Text swaps for the artboard's demo strings. Runs synchronously from the mutation observer (a microtask,
  // before the browser paints), so a page the artboard has just opened (the referral screens) is never
  // painted with its demo text for a frame before the real text lands.
  function textPass() {
    var d = window.__athltData;
    // No reward system exists yet: no "$10 off" / "free month" promises on the banner or the code screen.
    var sub1 = leafWithText('Get $10 off for each friend. More rewards inside.') || document.querySelector('#dc-root [data-ref-sub]');
    if (sub1) { sub1.setAttribute('data-ref-sub', '1'); if (sub1.textContent !== 'Invite friends to FormPal') sub1.textContent = 'Invite friends to FormPal'; }
    var ttl = leafWithText('Refer a friend, get $10') || document.querySelector('#dc-root [data-ref-title]');
    if (ttl) { ttl.setAttribute('data-ref-title', '1'); if (ttl.textContent !== 'Refer a friend') ttl.textContent = 'Refer a friend'; }
    var sub2 = leafWithText('Enter it to get a free month.') || document.querySelector('#dc-root [data-ref-sub2]');
    if (sub2) { sub2.setAttribute('data-ref-sub2', '1'); if (sub2.textContent !== 'Enter it below.') sub2.textContent = 'Enter it below.'; }
    // Referral page: the design's demo link and "1 of 6" become the user's real code and friend count.
    if (d && d.referral && d.referral.code) {
      var refEl = leafWithText('formpal.app/JORDAN10') || document.querySelector('#dc-root [data-ref-code]');
      if (refEl) { refEl.setAttribute('data-ref-code', '1'); var rt = 'Your code: ' + d.referral.code; if (refEl.textContent !== rt) refEl.textContent = rt; }
      var cntEl = leafWithText('1 of 6') || document.querySelector('#dc-root [data-ref-count]');
      if (cntEl) { cntEl.setAttribute('data-ref-count', '1'); var ct = d.referral.joined + ' of 6'; if (cntEl.textContent !== ct) cntEl.textContent = ct; }
      var fillEl = document.querySelector('#dc-root div[style*="width: 20%"][style*="border-radius: 999px"]') || document.querySelector('#dc-root [data-ref-fill]');
      if (fillEl) { fillEl.setAttribute('data-ref-fill', '1'); var fw = Math.min(100, d.referral.joined / 6 * 100) + '%'; if (fillEl.style.width !== fw) fillEl.style.setProperty('width', fw, 'important'); }
    }
    if (d && d.appVersion) { var ver = leafWithText('FormPal 1.0 (12)'); if (ver) ver.textContent = d.appVersion; }
  }

  function apply() {
    ensureCss();
    var okFit = fit();
    var d = window.__athltData;
    var root = document.getElementById('dc-root');
    textPass();
    // Top-right badges button: the design's ribbon-medal glyph is swapped for a clean line trophy (same 42px white
    // circle, same tap target and handler - only the drawing inside it changes).
    var badgeSvg = document.querySelector('#dc-root div[aria-label="Badges"] svg');
    if (badgeSvg && badgeSvg.getAttribute('data-icon') !== 'trophy') {
      badgeSvg.setAttribute('data-icon', 'trophy');
      badgeSvg.innerHTML = '<g fill="none" stroke="#111114" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
        + '<path d="M8 4h8v5.2a4 4 0 0 1-8 0V4z"/>'
        + '<path d="M8 6.2H5.6a.9.9 0 0 0-.9 1c.2 2 1.6 3.4 3.5 3.7"/>'
        + '<path d="M16 6.2h2.4a.9.9 0 0 1 .9 1c-.2 2-1.6 3.4-3.5 3.7"/>'
        + '<path d="M12 13.2v3.3M9.6 16.5h4.8M8.6 20h6.8"/></g>';
    }
    // The artboard's own red "Sign out" button has no handler of its own.
    var links = document.querySelectorAll('#dc-root a');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (!a.__signWired && (a.textContent || '').trim() === 'Sign out') {
        a.__signWired = true;
        a.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); post({ type: 'signOut' }); }, true);
      }
    }
    if (root && d) {
      // The native tab bar overlays the bottom of this page: scrollers get bottom padding so their last
      // item scrolls clear of it, and the member-card sheet's content sits above it.
      var S = (window.innerHeight || 844) / 844;
      var ins = d.insets || { top: 0, bottom: 0 };
      if (window.__fpHeader) window.__fpHeader('Profile', ins.top); // the same header on all four tabs (lib/tabHeader.ts)
      var cover = ins.tabCover != null ? ins.tabCover : ins.bottom + 49; // the floating tab bar (lib/tabBarMetrics.ts)
      var tb = (cover + 16) / S;
      var scrollers = root.querySelectorAll('div[data-scroll]');
      for (var sc = 0; sc < scrollers.length; sc++) {
        var el = scrollers[sc];
        if (el.style.overflowY === 'auto' && el.style.position === 'absolute') {
          if (el.__pb0 === undefined) el.__pb0 = parseFloat(el.style.paddingBottom) || 0;
          el.style.setProperty('padding-bottom', Math.max(el.__pb0, tb + 24).toFixed(1) + 'px', 'important');
        }
      }
      var sheet = root.querySelector('div[style*="pf-sheet"]');
      if (sheet) sheet.style.setProperty('padding-bottom', (tb + 14).toFixed(1) + 'px', 'important');
    }
    return { okFit: okFit, filled: !!d };
  }

  // The artboard links to its sibling prototype pages by file name ("Camera Setup.dc.html"). Inside the
  // app those files don't exist, so following one blanks the WebView — route them to the real screen instead.
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (!/\.dc\.html?$/i.test(href)) return;
    ev.preventDefault(); ev.stopPropagation();
    if (/Camera Setup/i.test(href)) post({ type: 'nav', to: 'camera' });
  }, true);

  var reported = false, lastAsk = 0, deb;
  // Real = laid out, the logic has rendered with the user's data (no leftover template text), and the
  // viewport and page have both stopped changing.
  function pageIsReal(r) {
    var root = document.getElementById('dc-root');
    if (!(r.okFit && r.filled && window.__athltLogicReady && root && leafWithText('Profile'))) return false;
    if ((root.textContent || '').indexOf('{{') >= 0) return false;
    return !window.__dcSettle || window.__dcSettle(100);
  }
  function setPageReady(on) {
    var h = document.documentElement;
    if (!h) return;
    if (on) { if (!h.hasAttribute('data-pready')) h.setAttribute('data-pready', '1'); }
    else if (h.hasAttribute('data-pready')) h.removeAttribute('data-pready');
  }
  function tick() {
    var r = apply();
    if (!window.__athltData && Date.now() - lastAsk > 700) { lastAsk = Date.now(); post({ type: 'needData' }); }
    // Once revealed, the page stays revealed (taps and re-renders must never hide it again); the gate only
    // applies to the first reveal.
    var ok = reported || pageIsReal(r);
    setPageReady(ok);
    if (!reported && ok) {
      reported = true;
      post({ type: 'ready' });
    }
    if (!ok && r.okFit && r.filled && window.__athltLogicReady) { clearTimeout(deb); deb = setTimeout(tick, 40); }
  }
  function schedule() { ensureCss(); clearTimeout(deb); deb = setTimeout(tick, 20); }
  try { new MutationObserver(function () { try { textPass(); } catch (e) {} schedule(); }).observe(document, { childList: true, subtree: true }); } catch (e) {}
  window.addEventListener('resize', schedule);
  setInterval(tick, 250);
  tick();
})();
true;
`;
