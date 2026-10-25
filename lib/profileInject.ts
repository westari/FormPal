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
 *  - "Coming soon", non-interactive: workout reminders/time, Apple Health,
 *    membership, referral rewards + codes, support/feature messaging — the app
 *    has no backend or native module for these yet, and the artboard's demo
 *    values for them ("Renews Sep 14, 2027", "$10 per friend") are not true.
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
  function row(self, label, value, tap) {
    var r = self.row(label, value, '', null);
    r.tap = tap;
    return r;
  }
  function soon(self, r) {
    r.isToggle = false; r.isUnits = false; r.isValue = true; r.value = 'Coming soon'; r.sub = ''; r.hasSub = false;
    r.tap = function () { self.showToast('Coming soon'); };
    return r;
  }

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
      var toast = function (m) { return function (e) { if (e && e.preventDefault) e.preventDefault(); self.showToast(m); }; };

      // Referral program does not exist yet — never imply it does.
      v.openRewards = toast('Referrals are coming soon');
      v.openCode = toast('Referral codes are coming soon');
      v.applyCode = toast('Referral codes are coming soon');
      v.shareLink = toast('Referrals are coming soon');
      v.copyLink = function () { self.showToast('Referrals are coming soon'); };
      // No support inbox / feature backend yet.
      v.send = function (e) {
        if (e && e.preventDefault) e.preventDefault();
        if (!s.draft.trim()) return;
        self.showToast('Support messaging is not live yet');
      };

      // "Update my plan" really rebuilds the plan natively.
      v.applyPlan = function (e) { if (e && e.preventDefault) e.preventDefault(); post({ type: 'applyPlan' }); self.setState({ dirty: null }); self.showToast('Updating your plan…'); };

      var hasWeight = d.weight != null || s.weight !== this.__seedWeight;
      var groups = v.groups.map(function (g) {
        var rows = g.rows.filter(function (r) { return r.label !== 'Restore purchases'; }).map(function (r) {
          if (r.label === 'Weight') r.value = hasWeight ? (kg ? Math.round(s.weight / 2.2046) + ' kg' : s.weight + ' lb') : 'Not set';
          else if (r.label === 'Workout time' || r.label === 'Apple Health' || r.label === 'Workout reminders') soon(self, r);
          else if (r.label === 'FormPal Annual') { r.label = 'Subscription'; soon(self, r); }
          else if (r.label === 'Audio coaching') { r.value = d.audioLabel; r.tap = function () { post({ type: 'nav', to: 'audio' }); }; }
          return r;
        });
        return Object.assign({}, g, { rows: rows });
      });
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
    + '*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;}'
    + 'div[style*="right: 88px"][style*="bottom: 22px"][style*="height: 64px"]{display:none!important;}'
    + 'div[style*="right: 14px"][style*="bottom: 22px"][style*="width: 64px"][style*="height: 64px"]{display:none!important;}'
    + 'input,textarea{font-size:16px!important;}';
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

  // Static referral banner copy promises a $10 reward that does not exist.
  function apply() {
    ensureCss();
    var okFit = fit();
    var d = window.__athltData;
    var t1 = leafWithText('Refer a friend, get $10');
    if (t1) t1.textContent = 'Refer a friend';
    var t2 = leafWithText('Get $10 off for each friend. More rewards inside.');
    if (t2) t2.textContent = 'Referral rewards are coming soon.';
    if (d && d.appVersion) { var ver = leafWithText('FormPal 1.0 (12)'); if (ver) ver.textContent = d.appVersion; }
    // The artboard's own red "Sign out" button has no handler of its own.
    var links = document.querySelectorAll('#dc-root a');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (!a.__signWired && (a.textContent || '').trim() === 'Sign out') {
        a.__signWired = true;
        a.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); post({ type: 'signOut' }); }, true);
      }
    }
    return { okFit: okFit, filled: !!d };
  }

  var reported = false, lastAsk = 0, deb;
  function tick() {
    var r = apply();
    if (!window.__athltData && Date.now() - lastAsk > 700) { lastAsk = Date.now(); post({ type: 'needData' }); }
    if (!reported && r.okFit && r.filled && window.__athltLogicReady && leafWithText('Profile')) {
      reported = true;
      post({ type: 'ready' });
    }
  }
  function schedule() { clearTimeout(deb); deb = setTimeout(tick, 50); }
  try { new MutationObserver(schedule).observe(document, { childList: true, subtree: true }); } catch (e) {}
  window.addEventListener('resize', schedule);
  setInterval(tick, 500);
  tick();
})();
true;
`;
