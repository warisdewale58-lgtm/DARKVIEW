/* =========================================================
   Dark View admin — /admin only. Server-verified password,
   scrypt hashing, rate limit, GitHub publish. NOT linked from
   the public storefront.
   ========================================================= */
(function () {
  'use strict';

  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var naira = function (n) { return '\u20a6' + Math.round(+n || 0).toLocaleString('en-NG'); };

  var D = null, S = null;
  var ADM = { tab: 'prod', q: '', dirty: false, edit: null, pw: '', pwNext: '', busy: false, pub: '' };
  var isAdmin = false;

  var TABS = [
    ['prod', 'Products', 'M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10'],
    ['cat', 'Categories', 'M4 5h7v7H4zM13 5h7v7h-7zM4 14h7v6H4zM13 14h7v6h-7z'],
    ['del', 'Delivery', 'M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 18h.01M17 18h.01'],
    ['site', 'Content', 'M3 5h18v14H3zM3 15l5-4 4 3 4-5 5 5'],
    ['set', 'Settings', 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 12h2M18 12h2M12 4v2M12 18v2']
  ];
  var BADGES = ['', 'New', 'Best seller', 'Sale', 'Limited'];

  function vcCall(path, body) {
    return fetch(path, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw { code: j.code || ('http_' + r.status), msg: j.error || ('Error ' + r.status) };
        return j;
      });
    }).catch(function (e) {
      if (e && e.code) throw e;
      throw { code: 'network', msg: 'No internet connection.' };
    });
  }

  function toast(msg) {
    var t = $('#admToast');
    if (!t) { t = document.createElement('div'); t.id = 'admToast'; t.className = 'adm-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('on'); }, 2600);
  }

  /* ---------- lock ---------- */
  function showLock() {
    var el = $('#adLock');
    if (!el) {
      el = document.createElement('div');
      el.id = 'adLock'; el.className = 'ad-lock';
      el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Admin password');
      document.body.appendChild(el);
    }
    el.innerHTML = '<div class="lk"><div class="lk-i"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="1.6"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></div>' +
      '<h3>Admin access</h3><p>Enter the admin password to manage the store.</p>' +
      '<form id="lkForm" novalidate><input id="lkPw" type="password" autocomplete="current-password" placeholder="Password" aria-label="Admin password">' +
      '<p id="lkErr" hidden></p>' +
      '<button class="btn block" type="submit">Unlock</button></form></div>';
    el.classList.add('on');
    document.body.style.overflow = 'hidden';
    setTimeout(function () { var i = $('#lkPw'); if (i) i.focus(); }, 40);
  }
  function hideLock() {
    var el = $('#adLock'); if (el) el.classList.remove('on');
    document.body.style.overflow = '';
  }

  document.addEventListener('submit', function (e) {
    if (e.target.id !== 'lkForm') return;
    e.preventDefault();
    var err = $('#lkErr'), v = $('#lkPw').value, btn = e.target.querySelector('[type=submit]');
    err.hidden = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Checking\u2026'; }
    vcCall('/api/unlock', { pw: v }).then(function () {
      isAdmin = true; ADM.pw = v;
      try { sessionStorage.setItem('dv_adm', '1'); } catch (x) { }
      hideLock(); openAdmin();
    }).catch(function (x) {
      err.textContent = x && x.code === 'rate_limited'
        ? 'Too many tries. Please wait a few minutes and try again.'
        : (x && x.msg) || 'That password is not right.';
      err.hidden = false;
    }).finally(function () {
      if (btn) { btn.disabled = false; btn.textContent = 'Unlock'; }
    });
  });

  /* ---------- publish ---------- */
  function publish() {
    if (!ADM.dirty || ADM.busy) return;
    ADM.busy = true; paint();
    var body = { pw: ADM.pw, data: D };
    if (ADM.pwNext) body.pwNext = ADM.pwNext;
    vcCall('/api/save', body).then(function () {
      ADM.dirty = false; ADM.pwNext = ''; ADM.pub = 'Published. The live site updates in about a minute.';
      toast('Published');
    }).catch(function (x) {
      ADM.pub = (x && x.msg) || 'Publish failed';
      toast(ADM.pub);
      if (x && x.code === 'rate_limited') { /* keep */ }
    }).finally(function () {
      ADM.busy = false; paint();
    });
  }

  function upload(file) {
    return new Promise(function (ok, no) {
      if (!/^image\//.test(file.type)) return no({ msg: 'Only photos can be uploaded here.' });
      var im = new Image(), u = URL.createObjectURL(file);
      im.onload = function () {
        var k = Math.min(1, 1400 / Math.max(im.width, im.height));
        var c = document.createElement('canvas');
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u);
        ok(c.toDataURL('image/jpeg', 0.82).split(',')[1]);
      };
      im.onerror = function () { no({ msg: 'That image could not be read.' }); };
      im.src = u;
    }).then(function (b64) { return vcCall('/api/upload', { pw: ADM.pw, data: b64 }); })
      .then(function (j) { return j.url; });
  }

  function ai(input) {
    return vcCall('/api/ai', { pw: ADM.pw, input: input }).then(function (j) { return j.text || ''; });
  }

  /* ---------- shell ---------- */
  function openAdmin() {
    var el = $('#adm');
    if (!el) {
      el = document.createElement('div');
      el.id = 'adm'; el.className = 'adm';
      document.body.appendChild(el);
    }
    el.classList.add('on');
    document.body.style.overflow = 'hidden';
    paint();
  }
  function closeAdmin() {
    var el = $('#adm'); if (el) el.classList.remove('on');
    document.body.style.overflow = '';
  }

  function paint() {
    var el = $('#adm'); if (!el) return;
    var t = TABS.filter(function (x) { return x[0] === ADM.tab; })[0] || TABS[0];
    var scroll = (el.querySelector('.adm-body') || {}).scrollTop || 0;
    el.innerHTML =
      '<nav class="adm-side" aria-label="Admin">' +
        '<div class="adm-logo"><b>' + esc(S.name) + '</b><small>Admin</small></div>' +
        TABS.map(function (x) {
          return '<button class="adm-tab' + (x[0] === ADM.tab ? ' on' : '') + '" data-tab="' + x[0] + '">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + x[2] + '"/></svg>' + x[1] + '</button>';
        }).join('') +
        '<div style="flex:1"></div>' +
        '<button class="adm-tab" data-act="lock"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="1.6"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>Lock</button>' +
        '<button class="adm-tab" data-act="exit"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>View store</button>' +
      '</nav>' +
      '<div class="adm-main">' +
        '<div class="adm-top"><h2>' + t[1] + '</h2>' +
          '<span class="adm-st' + (ADM.dirty ? ' dirty' : '') + '">' + esc(ADM.pub || (ADM.dirty ? 'Unpublished changes' : 'All changes published')) + '</span>' +
          '<button class="adm-btn" data-act="discard"' + (ADM.dirty ? '' : ' disabled') + '>Discard</button>' +
          '<button class="adm-btn pri" data-act="publish"' + (ADM.dirty && !ADM.busy ? '' : ' disabled') + '>' + (ADM.busy ? 'Publishing\u2026' : 'Publish changes') + '</button>' +
        '</div>' +
        '<div class="adm-body">' + bodyFor(ADM.tab) + '</div>' +
      '</div>' +
      (ADM.edit ? prodModal() : '');
    var b = el.querySelector('.adm-body'); if (b) b.scrollTop = scroll;
  }

  function bodyFor(tab) {
    if (tab === 'prod') return viewProducts();
    if (tab === 'cat') return viewCats();
    if (tab === 'del') return viewDelivery();
    if (tab === 'site') return viewContent();
    return viewSettings();
  }

  /* ---------- products ---------- */
  function viewProducts() {
    var q = ADM.q.toLowerCase();
    var list = D.products.filter(function (p) {
      return !q || String(p.n).toLowerCase().indexOf(q) >= 0 || String(p.c).toLowerCase().indexOf(q) >= 0;
    });
    return '<div class="adm-bar">' +
        '<input class="adm-inp" id="admQ" placeholder="Search products" value="' + esc(ADM.q) + '">' +
        '<button class="adm-btn pri" data-act="new">Add product</button>' +
      '</div>' +
      '<div class="adm-list">' + list.map(function (p) {
        var ph = (p.ci && p.ci[p.cl[0]]) || p.img || (p.imgs || [])[0] || '';
        ph = String(ph).replace(/^\//, '');
        return '<div class="adm-row">' +
          '<div class="adm-th">' + (ph ? '<img src="/' + esc(ph) + '" alt="">' : '') + '</div>' +
          '<div class="adm-r-mid">' +
            '<b>' + esc(p.n) + '</b>' +
            '<small>' + esc(p.c) + ' \u00b7 ' + naira(p.p) + ' \u00b7 ' + (p.stock || 0) + ' in stock' + (p.hidden ? ' \u00b7 hidden' : '') + '</small>' +
          '</div>' +
          '<div class="adm-r-act">' +
            '<button class="adm-btn sm" data-edit="' + p.id + '">Edit</button>' +
            '<button class="adm-btn sm ghost" data-hide="' + p.id + '">' + (p.hidden ? 'Show' : 'Hide') + '</button>' +
          '</div>' +
        '</div>';
      }).join('') + '</div>' +
      (list.length ? '' : '<p class="adm-note">No products match that search.</p>');
  }

  function prodModal() {
    var p = ADM.edit;
    var isNew = !D.products.filter(function (x) { return x.id === p.id; }).length;
    var ph = ((p.ci && p.ci[p.cl[0]]) || p.img || (p.imgs || [])[0] || '');
    ph = String(ph).replace(/^\//, '');
    return '<div class="adm-modal"><div class="adm-modal-in">' +
      '<div class="adm-modal-h"><h3>' + (isNew ? 'New product' : 'Edit product') + '</h3>' +
        '<button class="adm-x" data-act="closeEdit" aria-label="Close">\u00d7</button></div>' +
      '<div class="adm-modal-b">' +
        '<div class="adm-photo">' +
          '<div class="adm-photo-th">' + (ph ? '<img id="pvImg" src="/' + esc(ph) + '" alt="">' : '<img id="pvImg" alt="" style="display:none">') + '</div>' +
          '<label class="adm-btn sm" style="cursor:pointer">Change photo<input type="file" id="pPhoto" accept="image/*" hidden></label>' +
          '<p class="adm-note" style="margin-top:8px">JPEG or PNG. Shrunk to 1400px on upload.</p>' +
        '</div>' +
        '<div class="adm-fields">' +
          fld('n', 'Name', p.n) +
          '<div class="adm-f2">' + sel('c', 'Category', D.categories, p.c) + sel('b', 'Badge', BADGES, p.b) + '</div>' +
          '<div class="adm-f2">' + fld('p', 'Price', p.p, 'number') + fld('o', 'Compare-at price', p.o || '', 'number') + '</div>' +
          '<div class="adm-f2">' + fld('stock', 'Stock', p.stock, 'number') + fld('cl', 'Colours (comma)', (p.cl || []).join(', ')) + '</div>' +
          '<div class="adm-f2">' + fld('s', 'Sizes (comma)', (p.s || []).join(', ')) + fld('out', 'Sold-out sizes', (p.out || []).join(', ')) + '</div>' +
          '<div class="adm-fl"><label>Description</label><textarea id="f_d" rows="3">' + esc(p.d || '') + '</textarea></div>' +
          '<label class="adm-chk"><input type="checkbox" id="f_feat"' + (p.featured ? ' checked' : '') + '> Feature on the home page</label>' +
        '</div>' +
      '</div>' +
      '<div class="adm-modal-f">' +
        (isNew ? '' : '<button class="adm-btn ghost" data-act="del" style="margin-right:auto;color:#b0201c">Delete</button>') +
        '<button class="adm-btn" data-act="closeEdit">Cancel</button>' +
        '<button class="adm-btn pri" data-act="saveProd">Save product</button>' +
      '</div>' +
    '</div></div>';
  }

  function fld(k, label, val, type) {
    return '<div class="adm-fl"><label for="f_' + k + '">' + label + '</label>' +
      '<input id="f_' + k + '" type="' + (type || 'text') + '" value="' + esc(val == null ? '' : val) + '"></div>';
  }
  function sel(k, label, opts, val) {
    return '<div class="adm-fl"><label for="f_' + k + '">' + label + '</label><select id="f_' + k + '">' +
      opts.map(function (o) {
        return '<option value="' + esc(o) + '"' + (o === val ? ' selected' : '') + '>' + (o === '' ? '\u2014' : esc(o)) + '</option>';
      }).join('') + '</select></div>';
  }

  /* ---------- other views ---------- */
  function viewCats() {
    return '<p class="adm-note">Categories power the shop tabs and category pages. Renaming one updates its page link.</p>' +
      '<div class="adm-list">' + D.categories.map(function (c, i) {
        var n = D.products.filter(function (p) { return p.c === c; }).length;
        return '<div class="adm-row"><div class="adm-r-mid"><b>' + esc(c) + '</b><small>' + n + ' product' + (n === 1 ? '' : 's') + '</small></div>' +
          '<div class="adm-r-act"><button class="adm-btn sm" data-rencat="' + i + '">Rename</button>' +
          '<button class="adm-btn sm ghost" data-delcat="' + i + '">Delete</button></div></div>';
      }).join('') + '</div>' +
      '<div class="adm-bar" style="margin-top:16px"><input class="adm-inp" id="newCat" placeholder="New category name">' +
      '<button class="adm-btn pri" data-act="addCat">Add category</button></div>';
  }

  function viewDelivery() {
    return '<p class="adm-note">Delivery areas and fees shown at checkout.</p><div class="adm-list">' +
      (D.zones || []).map(function (z, i) {
        return '<div class="adm-row" style="display:block">' +
          '<div class="adm-f2">' + fld('zn' + i, 'Area', z.name) + fld('zf' + i, 'Fee', z.fee, 'number') + '</div>' +
          '<div class="adm-f2">' + fld('zo' + i, 'Free over', z.freeOver, 'number') + fld('ze' + i, 'Delivery time', z.eta) + '</div>' +
          '<label class="adm-chk"><input type="checkbox" id="f_zp' + i + '"' + (z.pod ? ' checked' : '') + '> Allow pay on delivery</label>' +
          '<button class="adm-btn sm" data-act="saveZone" data-i="' + i + '" style="margin-top:10px">Save area</button>' +
        '</div>';
      }).join('') + '</div>';
  }

  function viewContent() {
    return '<p class="adm-note">The words and photos on the home page and About page.</p>' +
      '<div class="adm-fields">' +
        '<div class="adm-fl"><label for="f_heroTitle">Hero headline</label><input id="f_heroTitle" data-s="heroTitle" value="' + esc(S.heroTitle || '') + '"></div>' +
        '<div class="adm-fl"><label for="f_heroLead">Hero paragraph</label><textarea id="f_heroLead" data-s="heroLead" rows="2">' + esc(S.heroLead || '') + '</textarea></div>' +
        '<div class="adm-fl"><label for="f_announce">Announcement bar</label><input id="f_announce" data-s="announce" value="' + esc(S.announce || '') + '"></div>' +
        '<div class="adm-fl"><label for="f_tagline">Brand quote</label><input id="f_tagline" data-s="tagline" value="' + esc(S.tagline || '') + '"></div>' +
        '<div class="adm-fl"><label for="f_storyH">About heading</label><input id="f_storyH" data-s="storyH" value="' + esc(S.storyH || '') + '"></div>' +
        '<div class="adm-fl"><label for="f_story1">About paragraph 1</label><textarea id="f_story1" data-s="story1" rows="3">' + esc(S.story1 || '') + '</textarea></div>' +
        '<div class="adm-fl"><label for="f_story2">About paragraph 2</label><textarea id="f_story2" data-s="story2" rows="3">' + esc(S.story2 || '') + '</textarea></div>' +
      '</div>' +
      '<button class="adm-btn pri" data-act="saveContent" style="margin-top:14px">Save content</button>';
  }

  function viewSettings() {
    return '<div class="adm-fields">' +
      '<div class="adm-f2">' + fld('name', 'Store name', S.name) + fld('phone', 'Phone', S.phone) + '</div>' +
      '<div class="adm-f2">' + fld('waNum', 'WhatsApp number (234...)', S.waNum) + fld('email', 'Email', S.email) + '</div>' +
      '<div class="adm-f2">' + fld('bankName', 'Bank', S.bankName) + fld('acctNum', 'Account number', S.acctNum) + '</div>' +
      '<div class="adm-f2">' + fld('acctName', 'Account name', S.acctName) + fld('promoCode', 'Promo code', S.promoCode) + '</div>' +
      '<div class="adm-f2">' + fld('promoPct', 'Promo percent', S.promoPct, 'number') + fld('address', 'Address', S.address) + '</div>' +
      '<div class="adm-fl"><label for="f_hours">Opening hours</label><input id="f_hours" value="' + esc(S.hours || '') + '"></div>' +
      '<button class="adm-btn pri" data-act="saveSettings" style="margin-top:6px">Save settings</button>' +
      '</div>' +
      '<div class="adm-card"><h4>Admin password</h4>' +
        '<p class="adm-note">Change it here, then press Publish changes. The new password is hashed on the server.</p>' +
        '<div class="adm-f2"><div class="adm-fl"><label for="f_pwNext">New password</label><input id="f_pwNext" type="password" autocomplete="new-password"></div>' +
        '<div class="adm-fl"><label for="f_pwNext2">Repeat</label><input id="f_pwNext2" type="password" autocomplete="new-password"></div></div>' +
        '<button class="adm-btn" data-act="setPw">Set new password</button>' +
      '</div>' +
      '<div class="adm-card"><h4>AI assistant</h4>' +
        '<p class="adm-note">Ask for help writing product copy or descriptions.</p>' +
        '<div class="adm-fl"><textarea id="aiIn" rows="3" placeholder="Write a short description for the Velocity Tracksuit Set"></textarea></div>' +
        '<button class="adm-btn" data-act="ai">Ask</button>' +
        '<pre class="adm-ai-out" id="aiOut" hidden></pre>' +
      '</div>';
  }

  /* ---------- events ---------- */
  function dirty() { ADM.dirty = true; ADM.pub = ''; paint(); }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var tab = t.closest('[data-tab]');
    if (tab) { ADM.tab = tab.getAttribute('data-tab'); ADM.pub = ''; paint(); return; }

    var act = t.closest('[data-act]');
    if (act) {
      e.preventDefault();
      var a = act.getAttribute('data-act');
      if (a === 'exit') { closeAdmin(); location.href = '/'; return; }
      if (a === 'lock') { isAdmin = false; ADM.pw = ''; try { sessionStorage.removeItem('dv_adm'); } catch (x) { } closeAdmin(); location.reload(); return; }
      if (a === 'publish') { publish(); return; }
      if (a === 'discard') { location.reload(); return; }
      if (a === 'new') { ADM.edit = blankProduct(); paint(); return; }
      if (a === 'closeEdit') { ADM.edit = null; paint(); return; }
      if (a === 'saveProd') { saveProduct(); return; }
      if (a === 'del') { delProduct(); return; }
      if (a === 'addCat') { addCat(); return; }
      if (a === 'saveZone') { saveZone(+act.getAttribute('data-i')); return; }
      if (a === 'saveContent') { saveContent(); return; }
      if (a === 'saveSettings') { saveSettings(); return; }
      if (a === 'setPw') { setPw(); return; }
      if (a === 'ai') { askAI(); return; }
      return;
    }

    var ed = t.closest('[data-edit]');
    if (ed) {
      var id = +ed.getAttribute('data-edit');
      var p = D.products.filter(function (x) { return x.id === id; })[0];
      if (p) { ADM.edit = JSON.parse(JSON.stringify(p)); paint(); }
      return;
    }

    var hd = t.closest('[data-hide]');
    if (hd) {
      var pid = +hd.getAttribute('data-hide');
      var q = D.products.filter(function (x) { return x.id === pid; })[0];
      if (q) { q.hidden = !q.hidden; dirty(); }
      return;
    }

    var dc = t.closest('[data-delcat]');
    if (dc) {
      var i = +dc.getAttribute('data-delcat');
      var name = D.categories[i];
      var used = D.products.filter(function (p) { return p.c === name; }).length;
      if (used) { toast('Move the ' + used + ' product(s) in this category first'); return; }
      if (!confirm('Delete the category "' + name + '"?')) return;
      D.categories.splice(i, 1); dirty(); return;
    }

    var rc = t.closest('[data-rencat]');
    if (rc) {
      var j = +rc.getAttribute('data-rencat');
      var old = D.categories[j];
      var nn = prompt('Rename category', old);
      if (!nn || nn === old) return;
      D.products.forEach(function (p) { if (p.c === old) p.c = nn; });
      D.categories[j] = nn; dirty(); return;
    }
  });

  document.addEventListener('input', function (e) {
    if (e.target.id === 'admQ') { ADM.q = e.target.value; var body = $('.adm-body'); if (body) body.innerHTML = viewProducts(); }
  });

  document.addEventListener('change', function (e) {
    if (e.target.id === 'pPhoto') {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      toast('Uploading photo\u2026');
      upload(f).then(function (url) {
        ADM.edit.imgs = [url];
        ADM.edit.img = url;
        if (ADM.edit.cl && ADM.edit.cl.length) {
          ADM.edit.ci = ADM.edit.ci || {};
          ADM.edit.ci[ADM.edit.cl[0]] = url;
        }
        paint();
        toast('Photo uploaded. Press Publish to make it live.');
      }).catch(function (x) { toast((x && x.msg) || 'Upload failed'); });
    }
  });

  /* ---------- mutations ---------- */
  function blankProduct() {
    return {
      id: Date.now(),
      n: '', c: D.categories[0] || 'Tees & Vests', t: 'tee',
      p: 0, o: 0, cl: [], s: ['M', 'L'], out: [], b: '',
      d: '', stock: 0, img: '', hidden: true, featured: false, imgs: [], ci: {}
    };
  }

  function readEdit() {
    var p = ADM.edit;
    var g = function (k) { var el = $('#f_' + k); return el ? el.value.trim() : ''; };
    p.n = g('n');
    p.c = g('c') || p.c;
    p.b = g('b');
    p.p = +g('p') || 0;
    p.o = +g('o') || 0;
    p.stock = +g('stock') || 0;
    p.cl = g('cl').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    p.s = g('s').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    p.out = g('out').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    p.d = g('d');
    var feat = $('#f_feat');
    p.featured = !!(feat && feat.checked);
    if (!p.cl.length) p.cl = ['Black'];
    return p;
  }

  function saveProduct() {
    var p = readEdit();
    if (!p.n) { toast('Give the product a name'); return; }
    if (!p.p) { toast('Set a price'); return; }
    var idx = -1;
    D.products.forEach(function (x, i) { if (x.id === p.id) idx = i; });
    if (idx >= 0) D.products[idx] = p; else D.products.push(p);
    ADM.edit = null;
    dirty();
    toast('Product saved. Press Publish to go live.');
  }

  function delProduct() {
    var p = ADM.edit;
    if (!confirm('Delete "' + p.n + '" for good?')) return;
    D.products = D.products.filter(function (x) { return x.id !== p.id; });
    ADM.edit = null;
    dirty();
    toast('Deleted. Press Publish to apply.');
  }

  function addCat() {
    var el = $('#newCat'), v = el ? el.value.trim() : '';
    if (!v) { toast('Type a category name'); return; }
    if (D.categories.indexOf(v) >= 0) { toast('That category exists'); return; }
    D.categories.push(v);
    dirty();
  }

  function saveZone(i) {
    var z = D.zones[i]; if (!z) return;
    var g = function (k) { var el = $('#f_' + k + i); return el ? el.value.trim() : ''; };
    z.name = g('zn') || z.name;
    z.fee = +g('zf') || 0;
    z.freeOver = +g('zo') || 0;
    z.eta = g('ze');
    var pod = $('#f_zp' + i);
    z.pod = !!(pod && pod.checked);
    dirty();
    toast('Delivery area saved');
  }

  function saveContent() {
    $$('[data-s]').forEach(function (el) {
      S[el.getAttribute('data-s')] = el.value;
    });
    dirty();
    toast('Content saved. Press Publish to go live.');
  }

  function saveSettings() {
    var g = function (k) { var el = $('#f_' + k); return el ? el.value.trim() : undefined; };
    ['name', 'phone', 'waNum', 'email', 'bankName', 'acctNum', 'acctName', 'promoCode', 'address', 'hours'].forEach(function (k) {
      var v = g(k); if (v !== undefined) S[k] = v;
    });
    var pp = g('promoPct'); if (pp !== undefined) S.promoPct = +pp || 0;
    dirty();
    toast('Settings saved. Press Publish to go live.');
  }

  function setPw() {
    var a = $('#f_pwNext').value, b = $('#f_pwNext2').value;
    if (a.length < 8) { toast('Use at least 8 characters'); return; }
    if (a !== b) { toast('The two passwords do not match'); return; }
    ADM.pwNext = a;
    ADM.dirty = true;
    paint();
    toast('Password set. Press Publish changes to save it.');
  }

  function askAI() {
    var el = $('#aiIn'), out = $('#aiOut');
    if (!el || !el.value.trim()) { toast('Type a request first'); return; }
    if (out) { out.hidden = false; out.textContent = 'Thinking\u2026'; }
    ai(el.value.trim()).then(function (text) {
      if (out) out.textContent = text;
    }).catch(function (x) {
      if (out) out.textContent = (x && x.msg) || 'The assistant is not available right now.';
    });
  }

  /* ---------- boot ---------- */
  function loadData() {
    return fetch('/data.json?ts=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function init() {
    document.body.className = 'adm-page';
    var robots = document.querySelector('meta[name="robots"]');
    if (robots) robots.setAttribute('content', 'noindex, nofollow, noarchive');
    document.title = 'Admin \u00b7 Dark View';

    loadData().then(function (data) {
      if (!data) { document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif">Could not load store data.</p>'; return; }
      D = data;
      S = D.settings;
      var authed = false;
      try { authed = sessionStorage.getItem('dv_adm') === '1'; } catch (e) { }
      if (authed) {
        /* Session flag only re-opens the padlock; the server still checks the
           password on every write, so a stale flag just shows the lock again. */
        authed = false;
      }
      showLock();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.DV_ADMIN = {
    get data() { return D; },
    setData: function (d) { D = d; S = d.settings; paint(); }
  };
})();
