/* Dark View storefront — core: utils, data, cart, routing, chrome */
'use strict';

var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
var esc = function (s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
};
var naira = function (n) { return '\u20a6' + Math.round(+n || 0).toLocaleString('en-NG'); };
var slugify = function (s) {
  return String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
};
var plain = function (s) { return String(s).replace(/\u20a6/g, 'NGN '); };

/* ---------- data ---------- */
var D = null, S = null;

function boot(data) {
  D = data;
  S = D.settings;
  try { syncCart(); } catch (e) { }
  render();
  bindGlobal();
  initReveal();
}

function products() { return (D.products || []).filter(function (p) { return !p.hidden; }); }
function byId(id) { return (D.products || []).filter(function (p) { return p.id == id; })[0]; }
function productBySlug(sl) {
  var list = products(), i;
  for (i = 0; i < list.length; i++) if (slugify(list[i].n) === sl) return list[i];
  return null;
}
function gal(p) {
  var out = (p.imgs || []).filter(Boolean).map(function (u) { return u.replace(/^\//, ''); });
  if (!out.length && p.img) out = [String(p.img).replace(/^\//, '')];
  return out;
}
function allPhotos(p) {
  var s = {}, out = [];
  gal(p).concat(Object.keys(p.ci || {}).map(function (k) { return String(p.ci[k] || '').replace(/^\//, ''); }))
    .forEach(function (u) { if (u && !s[u]) { s[u] = 1; out.push(u); } });
  return out;
}
function photoFor(p, c) {
  if (p.ci && c && p.ci[c]) return String(p.ci[c]).replace(/^\//, '');
  return gal(p)[0] || '';
}
function categories() {
  var used = {}, out = [];
  products().forEach(function (p) { used[p.c] = 1; });
  (D.categories || []).forEach(function (c) { if (used[c] && out.indexOf(c) < 0) out.push(c); });
  Object.keys(used).forEach(function (c) { if (out.indexOf(c) < 0) out.push(c); });
  return out;
}
function colorHex(name) { return (D.colors || {})[name] || '#c9c7c0'; }
function badgeOf(p) {
  if (+p.stock <= 0) return '';
  if (p.b === 'New') return 'New';
  if (p.b === 'Best seller') return 'Best seller';
  if (p.b === 'Sale') return 'Sale';
  return '';
}

/* ---------- cart ---------- */
var CART = [];
var PROMO = '';
var lastOrder = null;

function cartSave() {
  try { localStorage.setItem('dv2_cart', JSON.stringify(CART)); localStorage.setItem('dv2_promo', PROMO); } catch (e) { }
}
function cartLoad() {
  try {
    CART = JSON.parse(localStorage.getItem('dv2_cart') || '[]') || [];
    PROMO = localStorage.getItem('dv2_promo') || '';
  } catch (e) { CART = []; }
}
function syncCart() {
  cartLoad();
  CART = CART.filter(function (l) { return byId(l.id); });
}
function unitPrice(p) {
  var o = +p.o || 0, pr = +p.p || 0;
  return o > pr ? pr : pr;
}
function subtotal() {
  return CART.reduce(function (a, l) {
    var p = byId(l.id);
    return a + (p ? unitPrice(p) * l.qty : 0);
  }, 0);
}
function discount() {
  if (!PROMO) return 0;
  var pct = 0;
  if (PROMO === String(S.promoCode || '').toUpperCase() && +S.promoPct > 0) pct = +S.promoPct / 100;
  return Math.round(subtotal() * pct);
}
function zoneList() { return (D.zones || []).filter(function (z) { return z.on !== false; }); }
function activeZone() { return zoneList()[0] || null; }
function deliveryFee() {
  var z = activeZone();
  if (!z) return 0;
  if (+z.freeOver > 0 && subtotal() - discount() >= +z.freeOver) return 0;
  return +z.fee || 0;
}
function cartCount() { return CART.reduce(function (a, l) { return a + l.qty; }, 0); }
function stockLeft(id) {
  var p = byId(id); if (!p) return 0;
  var inCart = CART.filter(function (l) { return l.id == id; }).reduce(function (a, l) { return a + l.qty; }, 0);
  return Math.max(0, (+p.stock || 0) - inCart);
}

function addItem(id, size, color, qty) {
  var p = byId(id); if (!p) return false;
  qty = Math.max(1, +qty || 1);
  var have = CART.filter(function (l) { return l.id == id; }).reduce(function (a, l) { return a + l.qty; }, 0);
  if (have + qty > (+p.stock || 0)) {
    toast(have >= (+p.stock || 0) ? 'That is all we have in stock' : 'Only ' + p.stock + ' left');
    return false;
  }
  var found = CART.filter(function (l) { return l.id == id && l.size === size && l.color === color; })[0];
  if (found) found.qty += qty;
  else CART.push({ id: id, size: size, color: color, qty: qty });
  cartSave(); paintCart();
  return true;
}
function setQty(idx, qty) {
  var l = CART[idx]; if (!l) return;
  var p = byId(l.id); if (!p) return;
  var others = CART.filter(function (x, i) { return x.id == l.id && i !== idx; }).reduce(function (a, x) { return a + x.qty; }, 0);
  qty = Math.max(0, +qty || 0);
  if (qty + others > (+p.stock || 0)) { qty = Math.max(0, (+p.stock || 0) - others); toast('Only ' + p.stock + ' in stock'); }
  if (qty === 0) CART.splice(idx, 1); else l.qty = qty;
  cartSave(); paintCart();
}
function removeItem(idx) { CART.splice(idx, 1); cartSave(); paintCart(); }

/* ---------- chrome ---------- */
var svg = {
  bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h12l-1 12H7L6 8z"/><path d="M9.5 8V6.5a2.5 2.5 0 0 1 5 0V8"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
  arrowR: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  arrowL: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.6-7-9.4A4 4 0 0 1 12 7a4 4 0 0 1 7 3.6C19 15.4 12 20 12 20z"/></svg>',
  truck: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h10v9H3zM13 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></svg>',
  swap: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="1.6"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>'
};

function brandHTML() {
  return '<a class="brand" href="/" aria-label="' + esc(S.name) + ' home">' + esc(S.name) + '<i></i></a>';
}
function navHTML(active) {
  var links = [
    ['/shop', 'Shop'],
    ['/shop/tracksuits', 'Tracksuits'],
    ['/shop/tees-and-vests', 'Tees & Vests'],
    ['/shop/shorts', 'Shorts'],
    ['/about', 'About']
  ];
  return links.map(function (l) {
    return '<a href="' + l[0] + '"' + (active === l[0] ? ' aria-current="page"' : '') + '>' + l[1] + '</a>';
  }).join('');
}
function headerHTML(active) {
  return '<header class="hdr" id="hdr"><div class="hdr-in">' +
    brandHTML() +
    '<nav class="hnav" aria-label="Main">' + navHTML(active) + '</nav>' +
    '<div class="hact">' +
      '<a class="ico deskl-only" href="/shop" aria-label="Search pieces">' + svg.search + '</a>' +
      '<a class="ico" href="/cart" aria-label="Open cart" id="bagBtn"><span class="sr">Cart</span>' + svg.bag + '<span class="badge" id="bagN"></span></a>' +
      '<button class="menubtn" id="menuBtn" aria-label="Open menu" aria-expanded="false"><i></i><i></i><i></i></button>' +
    '</div></div></header>';
}
function mobileNavHTML() {
  return '<div class="mnav" id="mnav"><div class="wrap">' +
    navHTML('').replace(/class=/g, 'x').length ? '' : '' +
    '<a class="big" href="/shop">Shop all' + svg.arrowR + '</a>' +
    '<a class="big" href="/shop/tracksuits">Tracksuits' + svg.arrowR + '</a>' +
    '<a class="big" href="/shop/tees-and-vests">Tees &amp; vests' + svg.arrowR + '</a>' +
    '<a class="big" href="/shop/shorts">Shorts' + svg.arrowR + '</a>' +
    '<a class="big" href="/about">About' + svg.arrowR + '</a>' +
    '<div class="mini">' +
      '<a href="/help">Help &amp; delivery</a><a href="/orders">Track order</a>' +
      '<a href="/cart">Your cart</a><a href="/help#sizes">Size guide</a>' +
    '</div>' +
    '<div class="foot">' +
      '<a href="https://wa.me/' + esc(S.waNum) + '">WhatsApp ' + esc(S.phone) + '</a>' +
      '<a href="https://instagram.com/' + esc(S.ig) + '">@' + esc(S.ig) + '</a>' +
      '<a href="mailto:' + esc(S.email) + '">' + esc(S.email) + '</a>' +
    '</div></div></div>';
}
function footerHTML() {
  return '<footer class="ftr"><div class="wrap">' +
    '<div class="ftr-top">' +
      '<div class="ftr-brand">' + brandHTML() +
        '<span class="lbl">' + esc(S.tagline || 'Wear the mindset') + '</span>' +
        '<p>' + esc(S.story1Short || 'Streetwear made in small batches in Abuja.') + '</p>' +
      '</div>' +
      '<div class="ftr-cols">' +
        '<div class="ftr-col"><h4>Shop</h4><a href="/shop">All pieces</a><a href="/shop/tracksuits">Tracksuits</a><a href="/shop/tees-and-vests">Tees &amp; vests</a><a href="/shop/shorts">Shorts</a></div>' +
        '<div class="ftr-col"><h4>Help</h4><a href="/help">Delivery</a><a href="/help#returns">Returns</a><a href="/help#sizes">Size guide</a><a href="/orders">Track order</a></div>' +
        '<div class="ftr-col"><h4>Studio</h4><a href="/about">About us</a><a href="https://wa.me/' + esc(S.waNum) + '">WhatsApp</a><a href="https://instagram.com/' + esc(S.ig) + '">Instagram</a><a href="mailto:' + esc(S.email) + '">Email</a></div>' +
        '<div class="ftr-col"><h4>Visit</h4><a href="/help#contact">' + esc(S.address) + '</a><a href="/help#contact">' + esc(S.hours) + '</a><a href="/help#contact">' + esc(S.phone) + '</a></div>' +
      '</div>' +
    '</div>' +
    '<div class="ftr-foot"><span>&copy; ' + new Date().getFullYear() + ' ' + esc(S.name) + '. All rights reserved.</span><span>Abuja, Nigeria</span></div>' +
  '</div></footer>';
}
function shellHTML(active, main) {
  var announce = S.announce ? '<div class="announce">' + esc(S.announce) + '</div>' : '';
  return '<a class="skip" href="#main">Skip to content</a>' + announce + headerHTML(active) + mobileNavHTML() +
    '<main id="main">' + main + '</main>' + footerHTML() +
    '<div class="scrim" id="scrim"></div>' +
    '<div class="toast" id="toast" role="status" aria-live="polite"></div>';
}

function toast(msg) {
  var t = $('#toast'); if (!t) return;
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { t.classList.remove('on'); }, 2400);
}

function paintCart() {
  var n = cartCount();
  var b = $('#bagN');
  if (b) { b.textContent = n ? String(n) : ''; }
  var badge = n ? '<span class="count-pill">' + n + '</span>' : '';
  if (drawerOpen()) renderDrawer();
}

/* ---------- product card ---------- */
function firstWord(n) { return String(n || '').trim().split(/\s+/)[0] || 'DV'; }
function cardHTML(p) {
  var imgs = gal(p), main = photoFor(p, p.cl[0]), alt = '';
  for (var i = 0; i < imgs.length; i++) if (imgs[i] !== main) { alt = imgs[i]; break; }
  var o = +p.o || 0;
  var price = o > +p.p ? '<s>' + naira(o) + '</s>' + naira(p.p) : naira(p.p);
  var bd = badgeOf(p);
  var sold = +p.stock <= 0;
  return '<a class="pc rv" href="/product/' + slugify(p.n) + '">' +
    '<div class="pc-img">' +
      (main ? '<img class="main" src="/' + esc(main) + '" alt="' + esc(p.n) + '" loading="lazy" width="800" height="1000">' : '') +
      (alt ? '<img class="alt" src="/' + esc(alt) + '" alt="" loading="lazy" aria-hidden="true" width="800" height="1000">' : '') +
      '<div class="pc-tags"><span class="pc-price">' + price + '</span>' + (bd ? '<span class="pc-badge">' + esc(bd) + '</span>' : '') + '</div>' +
      (sold ? '<div class="pc-sold">Sold out</div>' : '') +
    '</div>' +
    '<div class="pc-foot"><div><div class="pc-name">' + esc(p.n) + '</div>' +
      '<div class="pc-cols">' + (p.cl || []).length + ' colour' + ((p.cl || []).length === 1 ? '' : 's') + '</div></div>' +
      (sold ? '' : '<button class="pc-add" data-add="' + p.id + '" aria-label="Add ' + esc(p.n) + ' to cart">' + svg.plus + '</button>') +
    '</div></a>';
}
function gridHTML(list, cls) {
  if (!list.length) return '';
  return '<div class="grid ' + (cls || '') + '">' + list.map(cardHTML).join('') + '</div>';
}

/* ---------- home ---------- */
function homeHTML() {
  var all = products();
  var feat = all.filter(function (p) { return p.featured; })[0] || all[0];
  var newest = all.slice().reverse().slice(0, 8);
  var best = all.filter(function (p) { return p.b === 'Best seller'; }).slice(0, 4);
  if (best.length < 4) best = all.slice(0, 4);
  var cats = categories();

  var hero = feat ? (
    '<section class="home">' +
      '<div class="home-pills"><div class="pills">' +
        all.slice(0, 5).map(function (p, i) {
          return '<a href="/product/' + slugify(p.n) + '"' + (i === 0 ? ' class="on"' : '') + '>' + esc(p.n.split(' ')[0]) + '</a>';
        }).join('') +
      '</div></div>' +
      '<div class="home-stage" id="heroStage">' +
        '<div class="wordmark" aria-hidden="true">' + esc(firstWord(feat.n)) + '</div>' +
        (photoFor(feat, feat.cl[0]) ? '<img class="shoes" src="/' + esc(photoFor(feat, feat.cl[0])) + '" alt="' + esc(feat.n) + '" fetchpriority="high" width="900" height="900">' : '') +
        '<div class="home-bar">' +
          '<div class="ruler" aria-hidden="true"><div class="bar"></div>' +
            Array.apply(null, Array(13)).map(function (_, i) {
              return '<i class="' + (i % 3 === 0 ? 's' : '') + '"></i>';
            }).join('') +
            '<span style="left:2%">0</span><span style="left:26%">8</span><span style="left:50%">16</span><span style="left:74%">24</span><span style="left:98%">32</span>' +
          '</div>' +
          '<div class="home-meta"><div class="swatches">' +
            (feat.cl || []).map(function (c) { return '<span style="background:' + colorHex(c) + '"></span>'; }).join('') +
          '</div><b>' + esc((feat.cl || [])[0] || '') + '</b></div>' +
        '</div>' +
      '</div>' +
      '<div class="home-copy">' +
        '<h1 class="display">' + esc(S.heroTitle || 'Everyday uniform.') + '</h1>' +
        '<p class="lead home-desc">' + esc(S.heroLead || '') + '</p>' +
        '<div class="home-tools">' +
          '<a class="line-ico" href="/help#sizes">' + svg.swap + 'Find your size</a>' +
          '<span class="dash" aria-hidden="true"></span>' +
          '<a class="btn" href="/product/' + slugify(feat.n) + '"><span class="a">Shop</span><span class="b">' + esc(feat.n) + '</span><span class="a">' + naira(feat.p) + '</span></a>' +
        '</div>' +
      '</div>' +
    '</section>'
  ) : '';

  var catTiles = cats.map(function (c, i) {
    var first = all.filter(function (p) { return p.c === c; })[0];
    var img = first ? photoFor(first, (first.cl || [])[0]) : '';
    return '<a class="tile rv" href="/shop/' + slugify(c) + '">' +
      (img ? '<img src="/' + esc(img) + '" alt="" loading="lazy">' : '') +
      '<span class="lbl">0' + (i + 1) + '</span>' +
      '<h3>' + esc(c) + '</h3>' +
      '<span class="go">Shop' + svg.arrowR + '</span></a>';
  }).join('');

  var editor = all.filter(function (p) { return +p.p >= 40000; })[0] || all[0];

  return hero +
    '<section class="sec"><div class="wrap">' +
      '<div class="sec-head rv"><div><span class="lbl eyebrow">New arrivals</span><h2 class="display">Just landed</h2>' +
      '<p class="sub body">Fresh from the studio. Small runs, so sizes go quickly.</p></div>' +
      '<a class="link" href="/shop">See all pieces' + svg.arrowR + '</a></div>' +
      gridHTML(newest) +
    '</div></section>' +

    '<section class="sec"><div class="wrap">' +
      '<div class="sec-head rv"><div><span class="lbl eyebrow">Explore</span><h2 class="display">Shop by category</h2>' +
      '<p class="sub body">Tracksuits, tees, vests and shorts. Every piece is made to be worn hard and often.</p></div></div>' +
      '<div class="tiles">' + catTiles + '</div>' +
    '</div></section>' +

    '<div class="marquee" aria-hidden="true"><div class="mq">' +
      Array.apply(null, Array(2)).map(function () {
        return ['Made in Abuja', 'Pay on delivery', '7-day exchange', 'Sizes S to XXL', 'Free delivery over ' + naira(100000), 'Small batches'].map(function (t) {
          return '<span>' + esc(t) + '</span>';
        }).join('');
      }).join('') +
    '</div></div>' +

    '<section class="sec"><div class="wrap"><div class="vps rv">' +
      '<div class="vp">' + svg.truck + '<h3>Delivered across Abuja</h3><p>Same or next day in the FCT. Free over ' + naira(100000) + ', otherwise ' + naira(2500) + '.</p></div>' +
      '<div class="vp">' + svg.swap + '<h3>7-day exchange</h3><p>Wrong size? Send it back within a week and we will swap it.</p></div>' +
      '<div class="vp">' + svg.check + '<h3>Pay on delivery</h3><p>Bank transfer, or pay the rider when your order arrives.</p></div>' +
      '<div class="vp">' + svg.heart + '<h3>Made in small batches</h3><p>Every run is limited. When a size is gone it often does not come back.</p></div>' +
    '</div></div></section>' +

    (editor ? '<section class="sec"><div class="wrap">' +
      '<div class="sec-head rv"><div><span class="lbl eyebrow">Made to wear</span><h2 class="display">Built for the everyday</h2></div></div>' +
      '<div class="feat"><div class="feat-img rv">' +
        (photoFor(editor, (editor.cl || [])[0]) ? '<img src="/' + esc(photoFor(editor, (editor.cl || [])[0])) + '" alt="' + esc(editor.n) + '" loading="lazy">' : '') +
        '<div class="ov"><span class="lbl">Featured piece</span><h3>' + esc(editor.n) + '</h3></div>' +
      '</div><div class="feat-copy rv">' +
        '<h2 class="display">Heavy cotton.<br>Honest fit.</h2>' +
        '<p class="body">' + esc(editor.d || '') + '</p>' +
        '<div class="specs">' +
          '<div class="spec"><b>' + naira(editor.p) + '</b><span>Price</span></div>' +
          '<div class="spec"><b>' + (editor.cl || []).length + '</b><span>Colours</span></div>' +
          '<div class="spec"><b>' + ((editor.s || []).join(', ') || 'One') + '</b><span>Sizes</span></div>' +
        '</div>' +
        '<a class="link" href="/product/' + slugify(editor.n) + '">View the piece' + svg.arrowR + '</a>' +
      '</div></div>' +
    '</div></section>' : '') +

    '<section class="sec"><div class="wrap">' +
      '<div class="sec-head rv"><div><span class="lbl eyebrow">Best sellers</span><h2 class="display">Most worn</h2>' +
      '<p class="sub body">The pieces people keep coming back for.</p></div>' +
      '<a class="link" href="/shop">Shop all' + svg.arrowR + '</a></div>' +
      gridHTML(best) +
    '</div></section>';
}

/* ---------- shop ---------- */
var SORT = 'featured', CATF = '';

function shopList() {
  var list = products().filter(function (p) { return !CATF || p.c === CATF; });
  if (SORT === 'low') list.sort(function (a, b) { return a.p - b.p; });
  else if (SORT === 'high') list.sort(function (a, b) { return b.p - a.p; });
  else if (SORT === 'new') list.reverse();
  return list;
}
function shopHTML(catSlug) {
  var cats = categories();
  var match = null;
  if (catSlug) {
    cats.forEach(function (c) { if (slugify(c) === catSlug) match = c; });
  }
  CATF = match || '';
  var list = shopList();
  var title = match || 'All pieces';
  var head = match
    ? '<h1 class="display">' + esc(match) + '</h1>'
    : '<h1 class="display">All <span class="halftone">pieces</span></h1>';

  var tabs = '<a href="/shop"' + (!match ? ' class="on"' : '') + '>All</a>' +
    cats.map(function (c) {
      return '<a href="/shop/' + slugify(c) + '"' + (match === c ? ' class="on"' : '') + '>' + esc(c) + '</a>';
    }).join('');

  return '<section class="phd"><div class="wrap">' +
      '<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><i>/</i><span>' + esc(title) + '</span></nav>' +
      head +
      '<p class="lead">' + (match ? 'Every ' + esc(match.toLowerCase()) + ' piece in the studio right now.' : 'Tracksuits, tees, vests and shorts, made in small batches in Abuja.') + '</p>' +
    '</div></section>' +
    '<div class="shopbar"><div class="wrap">' +
      '<div class="tabs">' + tabs + '</div>' +
      '<div class="shopctl">' +
        '<span class="count" id="count">' + list.length + ' piece' + (list.length === 1 ? '' : 's') + '</span>' +
        '<div class="rightctl">' +
          '<label class="sel-box"><span class="sr">Sort by</span><select id="sortSel">' +
            '<option value="featured"' + (SORT === 'featured' ? ' selected' : '') + '>Featured</option>' +
            '<option value="new"' + (SORT === 'new' ? ' selected' : '') + '>Newest</option>' +
            '<option value="low"' + (SORT === 'low' ? ' selected' : '') + '>Price: low to high</option>' +
            '<option value="high"' + (SORT === 'high' ? ' selected' : '') + '>Price: high to low</option>' +
          '</select></label>' +
        '</div>' +
      '</div>' +
      '<div id="shopGrid" class="shop-grid">' + gridHTML(list) + '</div>' +
      (list.length ? '' : '<div class="empty">' + svg.bag + '<h2>Nothing here yet</h2><p>This category is empty right now. Check back soon or browse everything.</p><a class="btn" href="/shop">Shop all pieces</a></div>') +
    '</div></div>';
}

/* ---------- product page ---------- */
var PSEL = { size: '', color: '', qty: 1, idx: 0 };

function productHTML(p) {
  var photos = allPhotos(p);
  var sizes = (p.s || []).slice();
  var colors = (p.cl || []).slice();
  PSEL = { size: sizes[0] || '', color: colors[0] || '', qty: 1, idx: 0 };
  var o = +p.o || 0;
  var price = o > +p.p
    ? '<s>' + naira(o) + '</s>' + naira(p.p)
    : naira(p.p);
  var sold = +p.stock <= 0;

  var stage = photos.length
    ? photos.map(function (u, i) {
        return '<img class="s' + (i === 0 ? ' on' : '') + '" src="/' + esc(u) + '" alt="' + esc(p.n) + (i ? ' photo ' + (i + 1) : '') + '" loading="' + (i ? 'lazy' : 'eager') + '" width="900" height="1125">';
      }).join('')
    : '<div class="ph">' + svg.bag + '</div>';

  var rail = photos.length > 1
    ? '<div class="colrail" id="colrail">' + photos.map(function (u, i) {
        return '<button data-idx="' + i + '" class="' + (i === 0 ? 'on' : '') + '" aria-label="Photo ' + (i + 1) + '"><img src="/' + esc(u) + '" alt=""></button>';
      }).join('') + '</div>'
    : '';

  var strip = photos.length > 1
    ? '<div class="thumb-strip" id="thumbStrip">' + photos.map(function (u, i) {
        return '<button data-idx="' + i + '" class="' + (i === 0 ? 'on' : '') + '" aria-label="Photo ' + (i + 1) + '"><img src="/' + esc(u) + '" alt=""></button>';
      }).join('') + '</div>'
    : '';

  var counter = photos.length > 1
    ? '<div class="counter-pill"><div class="steps">' +
        '<button data-step="-1" aria-label="Previous photo">' + svg.arrowL + '</button>' +
        '<span class="n"><span id="curN">1</span> / ' + photos.length + '</span>' +
        '<button data-step="1" aria-label="Next photo">' + svg.arrowR + '</button>' +
      '</div></div>'
    : '';

  var arrows = photos.length > 1
    ? '<button class="nav-arrow prev" data-step="-1" aria-label="Previous photo">' + svg.arrowL + '</button>' +
      '<button class="nav-arrow next" data-step="1" aria-label="Next photo">' + svg.arrowR + '</button>'
    : '';

  var colorRow = colors.map(function (c) {
    return '<button class="colsw' + (c === PSEL.color ? ' on' : '') + '" data-col="' + esc(c) + '" aria-label="' + esc(c) + '" title="' + esc(c) + '"><i style="background:' + colorHex(c) + '"></i></button>';
  }).join('');

  var sizeRow = sizes.map(function (s) {
    var gone = (p.out || []).indexOf(s) >= 0;
    return '<button class="sz' + (s === PSEL.size && !gone ? ' on' : '') + '" data-size="' + esc(s) + '"' + (gone ? ' disabled' : '') + '>' + esc(s) + '</button>';
  }).join('');

  var z = activeZone();
  var ship = z
    ? 'Free delivery over ' + naira(z.freeOver) + ', otherwise ' + naira(z.fee) + '. ' + (z.eta || '') + '.'
    : 'Message us on WhatsApp for delivery.';

  var rel = products().filter(function (x) { return x.id !== p.id && x.c === p.c; }).slice(0, 4);
  if (rel.length < 4) rel = rel.concat(products().filter(function (x) { return x.id !== p.id && rel.indexOf(x) < 0; }).slice(0, 4 - rel.length));

  return '<div class="pdp"><div class="wrap">' +
    '<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><i>/</i><a href="/shop">Shop</a><i>/</i><a href="/shop/' + slugify(p.c) + '">' + esc(p.c) + '</a><i>/</i><span>' + esc(p.n) + '</span></nav>' +
    '<div class="pdp-grid">' +
      '<div class="pdp-media">' +
        '<div><div class="pdp-stage" id="pdpStage">' + stage + arrows + counter + '</div>' + strip + '</div>' + rail +
      '</div>' +
      '<div class="pinfo">' +
        '<span class="lbl top">' + esc(p.c) + '</span>' +
        '<div class="pname-row">' +
          '<h1 class="pname">' + esc(p.n) + '</h1>' +
          '<div style="display:flex;align-items:flex-start;gap:6px">' +
            '<div class="pprice">' + price + '</div>' +
            '<button class="wish-btn" data-wish="' + p.id + '" aria-label="Save for later">' + svg.heart + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="pchips">' +
          (badgeOf(p) ? '<span class="pchip">' + esc(badgeOf(p)) + '</span>' : '') +
          (colors.length ? '<span class="pchip">' + colors.length + ' colours</span>' : '') +
          (sold ? '<span class="pchip">Sold out</span>' : '<span class="pchip">' + p.stock + ' in stock</span>') +
        '</div>' +
        '<p class="pdesc">' + esc(p.d || '') + '</p>' +
        (colors.length > 1 ? '<div class="opt"><div class="opt-h"><b>Colour</b><span id="colName">' + esc(PSEL.color) + '</span></div><div class="colrow" id="colRow">' + colorRow + '</div></div>' : '') +
        (sizes.length ? '<div class="opt"><div class="opt-h"><b>Size</b><span id="sizeName">' + esc(PSEL.size || '') + '</span></div><div class="szs" id="szRow">' + sizeRow + '</div></div>' : '') +
        '<div class="opt"><div class="opt-h"><b>Quantity</b></div>' +
          '<div class="qty"><button data-q="-1" aria-label="Less">' + svg.minus + '</button><span id="qtyN">1</span><button data-q="1" aria-label="More">' + svg.plus + '</button></div>' +
        '</div>' +
        '<div class="pcta"><button class="btn" id="pdpAdd"' + (sold ? ' disabled' : '') + '>' + (sold ? 'Sold out' : 'Add to cart') + '</button></div>' +
        '<div class="delivery-line">' + svg.truck + '<span>' + esc(ship) + ' Pay by transfer or on delivery.</span></div>' +
        '<div class="accs">' +
          '<details class="acc" open><summary>Details</summary><div class="in"><p>' + esc(p.d || '') + '</p>' +
            '<dl><div><dt>Category</dt><dd>' + esc(p.c) + '</dd></div>' +
            '<div><dt>Colours</dt><dd>' + esc(colors.join(', ') || '-') + '</dd></div>' +
            '<div><dt>Sizes</dt><dd>' + esc(sizes.join(', ') || 'One size') + '</dd></div></dl></div></details>' +
          '<details class="acc"><summary>Delivery &amp; returns</summary><div class="in"><p>' + esc(ship) + '</p>' +
            '<p>7-day exchange on unworn pieces. Message us on WhatsApp with your order number and we will arrange it.</p></div></details>' +
          '<details class="acc"><summary>Care</summary><div class="in"><p>Cold machine wash inside out with similar colours. Do not tumble dry. Warm iron on the reverse, never directly on the print.</p></div></details>' +
        '</div>' +
      '</div>' +
    '</div>' +
    (rel.length ? '<div class="related"><div class="sec-head"><div><span class="lbl eyebrow">You may also like</span><h2 class="display" style="font-size:clamp(24px,4vw,36px)">More ' + esc(p.c.toLowerCase()) + '</h2></div><a class="link" href="/shop/' + slugify(p.c) + '">See all' + svg.arrowR + '</a></div>' + gridHTML(rel) + '</div>' : '') +
  '</div></div>';
}

function paintPhoto(i) {
  var stage = $('#pdpStage'); if (!stage) return;
  var imgs = $$('.s', stage);
  if (!imgs.length) return;
  i = (i + imgs.length) % imgs.length;
  PSEL.idx = i;
  imgs.forEach(function (el, k) { el.classList.toggle('on', k === i); });
  var cur = $('#curN'); if (cur) cur.textContent = String(i + 1);
  $$('#colrail button, #thumbStrip button').forEach(function (b) {
    b.classList.toggle('on', +b.dataset.idx === i);
  });
}

/* ---------- cart page ---------- */
function cartHTML() {
  var z = activeZone();
  var n = cartCount();
  if (!n) {
    return '<div class="page"><div class="wrap"><div class="empty">' + svg.bag +
      '<h2>Your cart is empty</h2><p>Nothing in the bag yet. Browse the studio and find your next piece.</p>' +
      '<a class="btn" href="/shop">Shop all pieces</a></div></div></div>';
  }
  var lines = CART.map(function (l, i) {
    var p = byId(l.id); if (!p) return '';
    var ph = photoFor(p, l.color);
    return '<div class="cline">' +
      '<a class="th" href="/product/' + slugify(p.n) + '">' + (ph ? '<img src="/' + esc(ph) + '" alt="' + esc(p.n) + '" loading="lazy">' : '') + '</a>' +
      '<div><a class="nm" href="/product/' + slugify(p.n) + '">' + esc(p.n) + '</a>' +
        '<div class="vr">' + esc(l.color || '') + (l.size ? ' · ' + esc(l.size) : '') + '</div>' +
        '<div class="ctl"><div class="mini-qty"><button data-lq="' + i + '" data-d="-1" aria-label="Less">' + svg.minus + '</button><span>' + l.qty + '</span><button data-lq="' + i + '" data-d="1" aria-label="More">' + svg.plus + '</button></div>' +
        '<button class="rm" data-rm="' + i + '">Remove</button></div>' +
        '<div class="pp">' + naira(unitPrice(p) * l.qty) + '</div>' +
      '</div></div>';
  }).join('');

  var free = z && +z.freeOver > 0 ? Math.max(0, +z.freeOver - (subtotal() - discount())) : 0;

  return '<div class="page"><div class="wrap">' +
    '<div class="pg-h"><h1>Your cart</h1><span class="n">' + n + ' item' + (n === 1 ? '' : 's') + '</span></div>' +
    '<div class="cart-grid">' +
      '<div><div class="clist">' + lines + '</div>' +
        '<div style="margin-top:18px"><a class="link" href="/shop">Continue shopping' + svg.arrowR + '</a></div></div>' +
      '<div class="sumbox"><h3>Order summary</h3>' +
        '<div class="sum"><span>Subtotal</span><span>' + naira(subtotal()) + '</span></div>' +
        (discount() ? '<div class="sum"><span>Discount (' + esc(PROMO) + ')</span><span>-' + naira(discount()) + '</span></div>' : '') +
        '<div class="sum"><span>Delivery</span><span>' + (z ? (deliveryFee() ? naira(deliveryFee()) : 'Free') : '-') + '</span></div>' +
        '<div class="sum t"><span>Total</span><span>' + naira(subtotal() - discount() + deliveryFee()) + '</span></div>' +
        (z && +z.freeOver > 0 ? '<div class="freeship"><div class="small">' + (free ? 'Add ' + naira(free) + ' for free delivery' : 'Free delivery unlocked') + '</div><div class="bar-free' + (free ? '' : ' done') + '"><i style="transform:scaleX(' + Math.min(1, (subtotal() - discount()) / +z.freeOver) + ')"></i></div></div>' : '') +
        '<div class="promo-row"><input id="promoIn" placeholder="Promo code" value="' + esc(PROMO) + '" aria-label="Promo code"><button class="btn ghost" id="promoBtn">Apply</button></div>' +
        '<a class="btn block" href="/checkout" style="margin-top:16px">Checkout</a>' +
        '<p class="small" style="text-align:center;margin-top:10px">' + esc(z ? (z.eta || '') : '') + '</p>' +
        '<div class="notice-box"><b>Payment</b>Bank transfer to ' + esc(S.bankName) + ', or pay the rider when your order arrives.</div>' +
      '</div>' +
    '</div>' +
  '</div></div>';
}

/* ---------- checkout ---------- */
function checkoutHTML() {
  var z = activeZone();
  if (!cartCount()) {
    return '<div class="page"><div class="wrap"><div class="empty">' + svg.bag + '<h2>Nothing to check out</h2><p>Add a piece to your cart first.</p><a class="btn" href="/shop">Shop all pieces</a></div></div></div>';
  }
  return '<div class="page"><div class="wrap">' +
    '<nav class="crumbs" aria-label="Breadcrumb"><a href="/cart">Cart</a><i>/</i><span>Checkout</span></nav>' +
    '<div class="pg-h"><h1>Checkout</h1></div>' +
    '<div class="cart-grid">' +
      '<form class="form" id="coForm" novalidate>' +
        '<div class="frow two">' +
          '<div class="field"><label for="cName">Full name</label><input id="cName" name="name" autocomplete="name" placeholder="Your name" required><span class="msg">Enter your name</span></div>' +
          '<div class="field"><label for="cPhone">Phone / WhatsApp</label><input id="cPhone" name="phone" inputmode="tel" autocomplete="tel" placeholder="0801 234 5678" required><span class="msg">Enter a valid phone number</span></div>' +
        '</div>' +
        '<div class="field"><label for="cEmail">Email <small>(optional)</small></label><input id="cEmail" name="email" type="email" autocomplete="email" placeholder="you@email.com"></div>' +
        '<div class="frow two">' +
          '<div class="field"><label for="cZone">Delivery area</label><select id="cZone" name="zone">' +
            (zoneList().map(function (q) { return '<option value="' + esc(q.name) + '">' + esc(q.name) + ' — ' + naira(q.fee) + '</option>'; }).join('') || '<option>Abuja (FCT)</option>') +
          '</select></div>' +
          '<div class="field"><label for="cCity">Town / area</label><input id="cCity" name="city" autocomplete="address-level2" placeholder="Gwagwalada" required><span class="msg">Enter your town or area</span></div>' +
        '</div>' +
        '<div class="field"><label for="cAddr">Delivery address</label><textarea id="cAddr" name="address" rows="2" autocomplete="street-address" placeholder="Street, house number, landmark" required></textarea><span class="msg">Enter your address</span></div>' +
        '<div class="field"><label for="cNote">Note <small>(optional)</small></label><input id="cNote" name="note" placeholder="Landmark or preferred time"></div>' +
        '<div class="pay-labels"><h3>Payment</h3>' +
          '<label class="payr"><input type="radio" name="pay" value="Bank transfer" checked><span class="t">Bank transfer</span><span class="s"><b>' + esc(S.bankName) + ' · ' + esc(S.acctNum) + '</b> — full details shown after you place the order.</span></label>' +
          (z && z.pod ? '<label class="payr"><input type="radio" name="pay" value="Pay on delivery"><span class="t">Pay on delivery</span><span class="s">Pay the rider when your order arrives.</span></label>' : '') +
        '</div>' +
        '<p class="form-err" id="coErr" hidden></p>' +
        '<button class="btn block" type="submit" style="margin-top:6px">Place order · <span id="coTotal">' + naira(subtotal() - discount() + deliveryFee()) + '</span></button>' +
        '<p class="small" style="text-align:center">You will get an order number and a WhatsApp message to confirm.</p>' +
      '</form>' +
      '<div class="sumbox"><h3>Order summary</h3>' +
        CART.map(function (l) {
          var p = byId(l.id); if (!p) return '';
          return '<div class="sum"><span>' + l.qty + ' × ' + esc(p.n) + '<br><span class="small">' + esc(l.color || '') + (l.size ? ' · ' + esc(l.size) : '') + '</span></span><span>' + naira(unitPrice(p) * l.qty) + '</span></div>';
        }).join('') +
        '<div class="sum" style="border-top:1px solid var(--line2);margin-top:9px;padding-top:11px"><span>Subtotal</span><span>' + naira(subtotal()) + '</span></div>' +
        (discount() ? '<div class="sum"><span>Discount</span><span>-' + naira(discount()) + '</span></div>' : '') +
        '<div class="sum"><span>Delivery</span><span id="coFee">' + (deliveryFee() ? naira(deliveryFee()) : 'Free') + '</span></div>' +
        '<div class="sum t"><span>Total</span><span id="coSum">' + naira(subtotal() - discount() + deliveryFee()) + '</span></div>' +
      '</div>' +
    '</div>' +
  '</div></div>';
}

/* ---------- order placed ---------- */
function orderHTML(o) {
  var t = o.tot;
  return '<div class="page"><div class="wrap"><div style="max-width:680px;margin:0 auto">' +
    '<div class="tick">' + svg.check + '</div>' +
    '<h1 class="display" style="font-size:clamp(27px,5.7vw,44px);margin-bottom:10px">Order placed</h1>' +
    '<p class="lead" style="margin-bottom:22px">Thank you. Your order number is <b>' + esc(o.no) + '</b>. We have your details and will confirm on WhatsApp shortly.</p>' +
    '<div class="transjoin"><h4>' + (o.pay === 'Bank transfer' ? 'Bank transfer' : 'Payment on delivery') + '</h4>' +
      (o.pay === 'Bank transfer'
        ? '<div class="rows"><div><span>Bank</span><b>' + esc(S.bankName) + '</b></div><div><span>Account number</span><b>' + esc(S.acctNum) + '</b></div><div><span>Account name</span><b>' + esc(S.acctName) + '</b></div><div><span>Amount</span><b>' + naira(t) + '</b></div></div>' +
          '<p class="small" style="margin-top:12px">Send the receipt on WhatsApp so we can dispatch. Use your order number as the reference.</p>'
        : '<p class="body">Pay ' + naira(t) + ' to the rider when your order arrives. Have your order number ready.</p>') +
    '</div>' +
    '<div class="transjoin"><h4>Delivery</h4><div class="rows">' +
      '<div><span>Name</span><b>' + esc(o.name) + '</b></div>' +
      '<div><span>Phone</span><b>' + esc(o.phone) + '</b></div>' +
      '<div><span>Address</span><b style="text-align:right;max-width:60%">' + esc(o.addr) + '</b></div>' +
      '<div><span>Area</span><b>' + esc(o.zone) + '</b></div>' +
      '<div><span>Total</span><b>' + naira(t) + '</b></div>' +
    '</div></div>' +
    '<a class="btn block" href="https://wa.me/' + esc(S.waNum) + '?text=' + encodeURIComponent(o.msg) + '" style="margin-bottom:10px">Send order on WhatsApp</a>' +
    '<button class="btn soft block" id="copyOrder">Copy order details</button>' +
    '<div class="ordpre-wrap" style="margin-top:14px"><pre class="ordpre" id="orderPre">' + esc(o.msg) + '</pre></div>' +
    '<div style="margin-top:22px"><a class="link" href="/shop">Continue shopping' + svg.arrowR + '</a></div>' +
  '</div></div></div>';
}

/* ---------- orders / track ---------- */
function ordersHTML() {
  return '<div class="page"><div class="wrap" style="max-width:620px">' +
    '<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><i>/</i><span>Track order</span></nav>' +
    '<h1 class="display" style="margin-bottom:14px">Track your order</h1>' +
    '<p class="lead" style="margin-bottom:24px">Enter the order number we sent you. It starts with DV-. We will check and reply on WhatsApp.</p>' +
    '<form class="form" id="trackForm">' +
      '<div class="field"><label for="trk">Order number</label><input id="trk" placeholder="DV-123456" required></div>' +
      '<button class="btn" type="submit">Check status</button>' +
    '</form>' +
    '<div class="notice-box" style="margin-top:22px"><b>Need help?</b>Message us on WhatsApp at ' + esc(S.phone) + ' or email ' + esc(S.email) + '.</div>' +
  '</div></div>';
}

/* ---------- about ---------- */
function aboutHTML() {
  var hero = S.heroImg ? String(S.heroImg).replace(/^\//, '') : '';
  var all = products();
  return (hero ? '<div class="hero-band"><img src="/' + esc(hero) + '" alt="' + esc(S.heroImgAlt || S.name) + '"><div class="ov"><span class="lbl">' + esc(S.heroEyebrow || 'Abuja, Nigeria') + '</span><h1>' + esc(S.name) + '</h1></div></div>' : '') +
    '<section class="phd"><div class="wrap">' +
      '<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><i>/</i><span>About</span></nav>' +
      '<h1 class="display">' + esc(S.storyH || 'Our studio') + '</h1>' +
      '<div class="two-col" style="margin-top:clamp(22px,3.4vw,34px)">' +
        '<div class="rich"><p>' + esc(S.story1 || '') + '</p><p>' + esc(S.story2 || '') + '</p></div>' +
        '<div class="quote">' + esc(S.tagline || 'Wear the mindset') + '<em>.</em></div>' +
      '</div>' +
      '<div class="statrow">' +
        '<div class="stat"><b>' + all.length + '</b><span>Pieces in the studio</span></div>' +
        '<div class="stat"><b>Abuja</b><span>Made and delivered</span></div>' +
        '<div class="stat"><b>7 days</b><span>Exchange window</span></div>' +
      '</div>' +
    '</div></section>' +
    '<section class="sec"><div class="wrap"><div class="nums">' +
      '<div class="num"><i>01</i><div><h4>Designed in the studio</h4><p>Every piece starts as a sketch in the Abuja studio. We keep the range tight so each one is worth wearing.</p></div></div>' +
      '<div class="num"><i>02</i><div><h4>Small batches only</h4><p>We make short runs. That keeps the quality high and means a size can sell out for good.</p></div></div>' +
      '<div class="num"><i>03</i><div><h4>Sold direct</h4><p>No middlemen. You buy straight from us, so the price stays fair and the money stays in the studio.</p></div></div>' +
      '<div class="num"><i>04</i><div><h4>Delivered across Abuja</h4><p>Same or next day across the FCT. Pick transfer or pay the rider when it arrives.</p></div></div>' +
    '</div></div></section>' +
    '<section class="sec"><div class="wrap"><div class="sec-head"><div><span class="lbl eyebrow">Visit</span><h2 class="display">Come through</h2></div></div>' +
      '<div class="two-col"><div class="body">' +
        '<p style="margin-bottom:10px"><b>' + esc(S.address) + '</b></p>' +
        '<p style="margin-bottom:10px">' + esc(S.hours) + '</p>' +
        '<p style="margin-bottom:10px">WhatsApp ' + esc(S.phone) + '</p>' +
        '<p>' + esc(S.email) + '</p>' +
      '</div><div>' +
        '<a class="btn" href="https://wa.me/' + esc(S.waNum) + '">Message us on WhatsApp</a>' +
      '</div></div>' +
    '</div></section>';
}

/* ---------- help ---------- */
function helpHTML() {
  var z = activeZone();
  return '<section class="phd"><div class="wrap">' +
    '<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><i>/</i><span>Help</span></nav>' +
    '<h1 class="display">How can we <span class="halftone">help?</span></h1>' +
    '<p class="lead">Answers to the questions we hear most. Still stuck? Message us and we will reply the same day.</p>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:22px">' +
      '<a class="btn" href="https://wa.me/' + esc(S.waNum) + '">Talk to us on WhatsApp</a>' +
      '<a class="btn soft" href="mailto:' + esc(S.email) + '">' + esc(S.email) + '</a>' +
    '</div>' +
    '<div class="tabs" style="margin-top:clamp(28px,4vw,40px)"><a href="#delivery" class="on">Delivery</a><a href="#returns">Returns</a><a href="#sizes">Sizes</a><a href="#pay">Payment</a><a href="#contact">Contact</a></div>' +
  '</div></section>' +

  '<section class="sec" id="delivery"><div class="wrap" style="max-width:820px">' +
    '<h2 class="display" style="font-size:clamp(24px,4.4vw,34px);margin-bottom:8px">Delivery</h2>' +
    '<div class="accs" style="margin-top:0">' +
      '<details class="acc" open><summary>How much is delivery?</summary><div class="in"><p>' + (z ? 'A flat ' + naira(z.fee) + ' anywhere in ' + esc(z.name) + '. Free on orders over ' + naira(z.freeOver) + '.' : 'Message us on WhatsApp for a delivery quote.') + '</p></div></details>' +
      '<details class="acc"><summary>How long does it take?</summary><div class="in"><p>' + esc(z ? (z.eta || 'Same or next day') : 'Same or next day') + ' across Abuja. We confirm on WhatsApp before dispatch.</p></div></details>' +
      '<details class="acc"><summary>Do you deliver outside Abuja?</summary><div class="in"><p>Right now we deliver inside the FCT. Message us on WhatsApp and we can arrange something for other states.</p></div></details>' +
    '</div>' +
  '</div></section>' +

  '<section class="sec" id="returns"><div class="wrap" style="max-width:820px">' +
    '<h2 class="display" style="font-size:clamp(24px,4.4vw,34px);margin-bottom:8px">Returns &amp; exchange</h2>' +
    '<div class="accs" style="margin-top:0">' +
      '<details class="acc" open><summary>Can I exchange a size?</summary><div class="in"><p>Yes. Unworn pieces with tags can be exchanged within 7 days. Message us with your order number and the size you need.</p></div></details>' +
      '<details class="acc"><summary>What if the piece is faulty?</summary><div class="in"><p>Send us a photo on WhatsApp within 7 days and we will replace it or refund you. No argument.</p></div></details>' +
      '<details class="acc"><summary>Can I return a sale item?</summary><div class="in"><p>Sale pieces are final sale, but faulty items are always covered.</p></div></details>' +
    '</div>' +
  '</div></section>' +

  '<section class="sec" id="sizes"><div class="wrap" style="max-width:820px">' +
    '<h2 class="display" style="font-size:clamp(24px,4.4vw,34px);margin-bottom:8px">Sizes</h2>' +
    '<div class="accs" style="margin-top:0">' +
      '<details class="acc" open><summary>How do the sizes fit?</summary><div class="in"><p>Tees and vests are boxy and oversized by design. Tracksuits run true to size. Shorts sit above the knee with an elastic waist.</p><p>If you are between sizes, size down for tees and up for tracksuits. Message us and we will help.</p></div></details>' +
      '<details class="acc"><summary>What sizes do you make?</summary><div class="in"><p>S to XXL. Some pieces are one size, like caps and totes.</p></div></details>' +
    '</div>' +
  '</div></section>' +

  '<section class="sec" id="pay"><div class="wrap" style="max-width:820px">' +
    '<h2 class="display" style="font-size:clamp(24px,4.4vw,34px);margin-bottom:8px">Payment</h2>' +
    '<div class="accs" style="margin-top:0">' +
      '<details class="acc" open><summary>How do I pay?</summary><div class="in"><p>Bank transfer to ' + esc(S.bankName) + ', account ' + esc(S.acctNum) + ' (' + esc(S.acctName) + '). Or pay the rider on delivery inside Abuja.</p></div></details>' +
      '<details class="acc"><summary>Do you accept card?</summary><div class="in"><p>Not online yet. Transfer or pay on delivery are the two options right now.</p></div></details>' +
      '<details class="acc"><summary>Is there a promo code?</summary><div class="in"><p>Yes, use <b>' + esc(S.promoCode) + '</b> at checkout for ' + esc(String(S.promoPct)) + '% off.</p></div></details>' +
    '</div>' +
  '</div></section>' +

  '<section class="sec" id="contact"><div class="wrap" style="max-width:820px">' +
    '<h2 class="display" style="font-size:clamp(24px,4.4vw,34px);margin-bottom:8px">Contact</h2>' +
    '<div class="accs" style="margin-top:0"><details class="acc" open><summary>Where are you?</summary><div class="in"><p>' + esc(S.address) + '</p><p>' + esc(S.hours) + '</p><p>WhatsApp ' + esc(S.phone) + '<br>' + esc(S.email) + '</p></div></details></div>' +
  '</div></section>';
}

/* ---------- drawer ---------- */
function drawerOpen() { var d = $('#drawer'); return d && d.classList.contains('on'); }
function renderDrawer() {
  var d = $('#drawer'); if (!d) return;
  var n = cartCount();
  var body = $('#dbody'), foot = $('#dfoot');
  if (!body) return;
  if (!n) {
    body.innerHTML = '<div class="empty" style="padding:60px 0">' + svg.bag + '<h2 style="font-size:20px">Your cart is empty</h2><p style="font-size:13.5px">Add a piece and it will show up here.</p></div>';
    if (foot) foot.innerHTML = '<a class="btn block" href="/shop">Shop all pieces</a>';
    return;
  }
  body.innerHTML = CART.map(function (l, i) {
    var p = byId(l.id); if (!p) return '';
    var ph = photoFor(p, l.color);
    return '<div class="line">' +
      '<a class="th" href="/product/' + slugify(p.n) + '">' + (ph ? '<img src="/' + esc(ph) + '" alt="" loading="lazy">' : '') + '</a>' +
      '<div><a href="/product/' + slugify(p.n) + '"><b>' + esc(p.n) + '</b></a>' +
        '<small>' + esc(l.color || '') + (l.size ? ' · ' + esc(l.size) : '') + '</small>' +
        '<div class="mini-qty"><button data-lq="' + i + '" data-d="-1" aria-label="Less">' + svg.minus + '</button><span>' + l.qty + '</span><button data-lq="' + i + '" data-d="1" aria-label="More">' + svg.plus + '</button></div>' +
      '</div>' +
      '<div><div class="pp">' + naira(unitPrice(p) * l.qty) + '</div><button class="rm" data-rm="' + i + '">Remove</button></div>' +
    '</div>';
  }).join('');

  var z = activeZone();
  var free = z && +z.freeOver > 0 ? Math.max(0, +z.freeOver - (subtotal() - discount())) : 0;
  if (foot) foot.innerHTML =
    (z && +z.freeOver > 0 ? '<div class="freeship"><div class="small">' + (free ? 'Add ' + naira(free) + ' for free delivery' : 'Free delivery unlocked') + '</div><div class="bar-free' + (free ? '' : ' done') + '"><i style="transform:scaleX(' + Math.min(1, (subtotal() - discount()) / +z.freeOver) + ')"></i></div></div>' : '') +
    '<div class="sum" style="margin-top:10px"><span>Subtotal</span><span>' + naira(subtotal()) + '</span></div>' +
    (discount() ? '<div class="sum"><span>Discount</span><span>-' + naira(discount()) + '</span></div>' : '') +
    '<p class="small" style="margin-top:4px">Delivery calculated at checkout</p>' +
    '<a class="btn block" href="/checkout">Checkout</a>' +
    '<a class="btn soft block" href="/cart" style="margin-top:8px">View cart</a>';
}

/* ---------- routing ---------- */
function route() {
  var path = location.pathname.replace(/\/+$/, '') || '/';
  var m;

  if (path === '/admin') return { page: 'admin' };
  if (path === '/' || path === '/index.html') return { page: 'home' };
  if (path === '/shop') return { page: 'shop' };
  if ((m = path.match(/^\/shop\/(.+)$/))) return { page: 'shop', cat: m[1] };
  if ((m = path.match(/^\/product\/(.+)$/))) return { page: 'product', slug: m[1] };
  if (path === '/cart') return { page: 'cart' };
  if (path === '/checkout') return { page: 'checkout' };
  if (path === '/orders') return { page: 'orders' };
  if (path === '/about') return { page: 'about' };
  if (path === '/help') return { page: 'help' };
  if (path === '/confirm') return { page: 'confirm' };
  return { page: '404' };
}

function notFoundHTML() {
  return '<div class="page"><div class="wrap"><div class="empty">' +
    '<h1 class="display" style="font-size:clamp(38px,9vw,74px)">404</h1>' +
    '<h2>Page not found</h2><p>That page does not exist. The shop is still right here.</p>' +
    '<a class="btn" href="/shop">Shop all pieces</a></div></div></div>';
}

function render() {
  var r = route();
  if (r.page === 'admin') { document.title = 'Admin · ' + S.name; adminBoot(); return; }

  var main = '';
  var title = S.name;
  var active = '';

  if (r.page === 'home') {
    main = homeHTML();
    title = S.name + ' | ' + (S.heroEyebrow || 'Streetwear from Abuja');
    active = '/';
  } else if (r.page === 'shop') {
    main = shopHTML(r.cat || '');
    title = (CATF || 'All pieces') + ' | ' + S.name;
    active = r.cat ? '/shop/' + slugify(CATF) : '/shop';
  } else if (r.page === 'product') {
    var p = productBySlug(r.slug);
    if (!p) { main = notFoundHTML(); title = 'Not found | ' + S.name; }
    else {
      main = productHTML(p);
      title = p.n + ' | ' + S.name;
      active = '/shop/' + slugify(p.c);
      setMeta(p);
    }
  } else if (r.page === 'cart') {
    main = cartHTML(); title = 'Your cart | ' + S.name;
  } else if (r.page === 'checkout') {
    main = checkoutHTML(); title = 'Checkout | ' + S.name;
  } else if (r.page === 'orders') {
    main = ordersHTML(); title = 'Track order | ' + S.name;
  } else if (r.page === 'about') {
    main = aboutHTML(); title = 'About | ' + S.name; active = '/about';
  } else if (r.page === 'help') {
    main = helpHTML(); title = 'Help | ' + S.name;
  } else if (r.page === 'confirm') {
    main = confirmHTML(); title = 'Payment sent | ' + S.name;
  } else {
    main = notFoundHTML(); title = 'Not found | ' + S.name;
  }

  document.title = title;
  var meta = $('meta[name="description"]');
  if (meta && !meta.dataset.locked) meta.setAttribute('content', claim());

  document.body.innerHTML = shellHTML(active, main) +
    '<aside class="drawer" id="drawer" aria-label="Cart" aria-hidden="true">' +
      '<div class="dh"><h3>Your cart <span class="count-pill" id="dcount"></span></h3>' +
      '<button class="iconbtn" id="drawerX" aria-label="Close cart">' + svg.close + '</button></div>' +
      '<div class="dbody" id="dbody"></div><div class="dfoot" id="dfoot"></div></aside>';

  paintCart();
  renderDrawer();
  var dc = $('#dcount'); if (dc) dc.textContent = String(cartCount());
  initReveal();
  afterRender(r);
}

function claim() {
  return S.name + ' — streetwear made in Abuja. Tracksuits, tees, vests and shorts in small batches. Delivery across the FCT.';
}

function setMeta(p) {
  var d = $('meta[name="description"]');
  if (d) { d.setAttribute('content', p.n + ' — ' + (p.d || '') + ' Shop ' + S.name + '.'); d.dataset.locked = '1'; }
}

/* ---------- reveal on scroll ---------- */
function initReveal() {
  var els = $$('.rv');
  if (!els.length) return;
  if (!('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('in'); }); return; }
  if (initReveal._io) initReveal._io.disconnect();
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  initReveal._io = io;
  els.forEach(function (e, i) {
    var r = e.getBoundingClientRect();
    if (r.top < window.innerHeight * 0.92) { e.classList.add('in'); return; }
    io.observe(e);
  });
}

/* ---------- after render ---------- */
function afterRender(r) {
  var hdr = $('#hdr');
  if (hdr) {
    var onScroll = function () { hdr.classList.toggle('stuck', window.scrollY > 4); };
    onScroll();
    window.removeEventListener('scroll', afterRender._s || function () { });
    afterRender._s = onScroll;
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  if (r.page === 'checkout') {
    var zs = $('#cZone');
    if (zs) zs.addEventListener('change', function () { paintTotals(); });
  }
  if (r.page === 'product') {
    var st = $('#pdpStage');
    if (st) {
      var sx = 0, sy = 0;
      st.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
      st.addEventListener('touchend', function (e) {
        var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
        if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy)) paintPhoto(PSEL.idx + (dx < 0 ? 1 : -1));
      }, { passive: true });
    }
  }
}

function paintTotals() {
  var f = deliveryFee(), tot = subtotal() - discount() + f;
  var a = $('#coTotal'); if (a) a.textContent = naira(tot);
  var b = $('#coSum'); if (b) b.textContent = naira(tot);
  var c = $('#coFee'); if (c) c.textContent = f ? naira(f) : 'Free';
}

/* ---------- interactions ---------- */
function openScrim() { var s = $('#scrim'); if (s) s.classList.add('on'); }
function closeScrim() { var s = $('#scrim'); if (s) s.classList.remove('on'); }
function openDrawer() {
  var d = $('#drawer'); if (!d) return;
  renderDrawer();
  var dc = $('#dcount'); if (dc) dc.textContent = String(cartCount());
  d.classList.add('on'); d.setAttribute('aria-hidden', 'false');
  openScrim(); document.body.style.overflow = 'hidden';
}
function closeDrawer() {
  var d = $('#drawer');
  if (d) { d.classList.remove('on'); d.setAttribute('aria-hidden', 'true'); }
  closeScrim(); document.body.style.overflow = '';
}

function openMenu() {
  document.body.classList.add('menu');
  var m = $('#mnav'); if (m) m.classList.add('on');
  var b = $('#menuBtn'); if (b) b.setAttribute('aria-expanded', 'true');
  openScrim();
}

function closeMenu() {
  document.body.classList.remove('menu');
  var m = $('#mnav'); if (m) m.classList.remove('on');
  var b = $('#menuBtn'); if (b) b.setAttribute('aria-expanded', 'false');
  closeScrim();
}

function quickAdd(id) {
  var p = byId(id); if (!p) return;
  if (+p.stock <= 0) { toast('Sold out'); return; }
  var size = (p.s || [])[0] || '';
  var color = (p.cl || [])[0] || '';
  if (addItem(p.id, size, color, 1)) {
    toast(p.n + ' added to cart');
    openDrawer();
  }
}

/* ---------- global events ---------- */
function bindGlobal() {
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var add = t.closest('[data-add]');
    if (add) { e.preventDefault(); quickAdd(+add.getAttribute('data-add')); return; }

    var pb = t.closest('#promoBtn');
    if (pb) {
      e.preventDefault();
      var pi = $('#promoIn');
      var v = pi ? pi.value.trim().toUpperCase() : '';
      PROMO = (v && v === String(S.promoCode || '').toUpperCase() && +S.promoPct > 0) ? v : '';
      cartSave(); render();
      toast(PROMO ? 'Promo applied: ' + S.promoPct + '% off' : (v ? 'That code is not valid' : 'Promo removed'));
      return;
    }

    var lq = t.closest('[data-lq]');
    if (lq) { e.preventDefault(); var li = +lq.getAttribute('data-lq'); setQty(li, CART[li] ? CART[li].qty + (+lq.getAttribute('data-d')) : 0); if (!drawerOpen() && !location.pathname.match(/cart|checkout/)) render(); return; }

    var rm = t.closest('[data-rm]');
    if (rm) { e.preventDefault(); removeItem(+rm.getAttribute('data-rm')); if (!drawerOpen() && !location.pathname.match(/cart|checkout/)) render(); return; }

    var step = t.closest('[data-step]');
    if (step) { e.preventDefault(); paintPhoto(PSEL.idx + (+step.getAttribute('data-step'))); return; }

    var idx = t.closest('[data-idx]');
    if (idx) { e.preventDefault(); paintPhoto(+idx.getAttribute('data-idx')); return; }

    var col = t.closest('[data-col]');
    if (col) { e.preventDefault(); PSEL.color = col.getAttribute('data-col'); paintSel(); return; }

    var sz = t.closest('[data-size]');
    if (sz && !sz.disabled) { e.preventDefault(); PSEL.size = sz.getAttribute('data-size'); paintSel(); return; }

    var q = t.closest('[data-q]');
    if (q) { e.preventDefault(); PSEL.qty = Math.max(1, Math.min(99, PSEL.qty + (+q.getAttribute('data-q')))); var qn = $('#qtyN'); if (qn) qn.textContent = String(PSEL.qty); return; }

    var addBtn = t.closest('#pdpAdd');
    if (addBtn) { e.preventDefault(); pdpAdd(); return; }

    var bag = t.closest('#bagBtn');
    if (bag) { e.preventDefault(); openDrawer(); return; }

    var dx = t.closest('#drawerX');
    if (dx) { e.preventDefault(); closeDrawer(); return; }

    var mb = t.closest('#menuBtn');
    if (mb) { e.preventDefault(); if (document.body.classList.contains('menu')) closeMenu(); else openMenu(); return; }

    var sc = t.closest('#scrim');
    if (sc) { closeDrawer(); closeMenu(); return; }

    /* SPA navigation for internal links */
    var a = t.closest('a[href^="/"], a[href^="./"], a[href^="../"]');
    if (a) {
      var href = a.getAttribute('href');
      if (href === '/admin') return; /* admin loads separately */
      if (/^https?:/.test(location.origin) === false) { /* fallthrough */ }
      if (href && href.charAt(0) === '/' && !href.match(/\.(jpg|jpeg|png|webp|gif|svg|css|js|json|woff2?)$/i)) {
        e.preventDefault();
        navigate(href);
        return;
      }
    }
  });

  document.addEventListener('submit', function (e) {
    if (e.target.id === 'coForm') { e.preventDefault(); placeOrder(); }
    if (e.target.id === 'trackForm') { e.preventDefault(); trackSubmit(); }
  });

  document.addEventListener('change', function (e) {
    if (e.target.id === 'sortSel') {
      SORT = e.target.value;
      var r = route(); main_swap(shopHTML(r.cat || ''));
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeDrawer(); closeMenu(); closeScrim(); document.body.style.overflow = ''; }
  });

  window.addEventListener('popstate', function () { render(); });
}

function main_swap(html) {
  var m = $('#main'); if (m) { m.innerHTML = html; initReveal(); }
}

function navigate(href) {
  closeDrawer(); closeMenu(); document.body.style.overflow = '';
  history.pushState(null, '', href);
  window.scrollTo(0, 0);
  render();
}

function paintSel() {
  $$('#colRow .colsw').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-col') === PSEL.color); });
  $$('#szRow .sz').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-size') === PSEL.size); });
  var cn = $('#colName'); if (cn) cn.textContent = PSEL.color;
  var sn = $('#sizeName'); if (sn) sn.textContent = PSEL.size;
}

function pdpAdd() {
  var r = route();
  var p = productBySlug(r.slug || '');
  if (!p) return;
  var sizes = p.s || [];
  if (sizes.length && !PSEL.size) PSEL.size = sizes[0];
  if ((p.cl || []).length && !PSEL.color) PSEL.color = p.cl[0];
  if (addItem(p.id, PSEL.size, PSEL.color, PSEL.qty)) {
    toast(p.n + ' added to cart');
    openDrawer();
  }
}

function fieldErr(id, on) {
  var f = $('#' + id); if (!f) return;
  var w = f.closest('.field'); if (w) w.classList.toggle('err', !!on);
}

function placeOrder() {
  var name = ($('#cName').value || '').trim();
  var phone = ($('#cPhone').value || '').trim();
  var email = ($('#cEmail').value || '').trim();
  var city = ($('#cCity').value || '').trim();
  var addr = ($('#cAddr').value || '').trim();
  var note = ($('#cNote').value || '').trim();
  var zoneSel = $('#cZone');
  var zoneName = zoneSel ? zoneSel.value : '';

  var ok = true;
  if (!name) { fieldErr('cName', 1); ok = false; } else fieldErr('cName', 0);
  if (phone.replace(/\D/g, '').length < 10) { fieldErr('cPhone', 1); ok = false; } else fieldErr('cPhone', 0);
  if (!city) { fieldErr('cCity', 1); ok = false; } else fieldErr('cCity', 0);
  if (!addr) { fieldErr('cAddr', 1); ok = false; } else fieldErr('cAddr', 0);

  var err = $('#coErr');
  if (!ok) {
    if (err) { err.textContent = 'Please fill in your name, a valid phone number, town and address.'; err.hidden = false; }
    return;
  }
  if (err) err.hidden = true;

  var pay = (document.querySelector('input[name=pay]:checked') || { value: 'Bank transfer' }).value;
  var no = 'DV-' + Date.now().toString().slice(-6);
  var f = deliveryFee(), tot = subtotal() - discount() + f;
  var lines = CART.map(function (l) {
    var p = byId(l.id); if (!p) return '';
    return '\u2022 ' + l.qty + ' \u00d7 ' + p.n + ' (' + (l.color || '') + (l.size ? ', ' + l.size : '') + ') \u2013 ' + naira(unitPrice(p) * l.qty);
  }).join('\n');
  var msg = 'Hello ' + S.name + ', I want to place an order.\n\nOrder: ' + no + '\n' + lines + '\n\n' +
    'Subtotal: ' + naira(subtotal()) + (discount() ? '\nDiscount (' + PROMO + '): -' + naira(discount()) : '') +
    '\nDelivery (' + zoneName + '): ' + (f ? naira(f) : 'Free') +
    '\nTotal: ' + naira(tot) + '\nPayment: ' + (pay === 'Bank transfer' ? 'Bank transfer to ' + S.bankName + ' ' + S.acctNum : pay) +
    '\n\nName: ' + name + '\nPhone: ' + phone + '\nAddress: ' + addr + ', ' + city + ', ' + zoneName + (note ? '\nNote: ' + note : '');

  lastOrder = { no: no, msg: msg, tot: tot, pay: pay, name: name, phone: phone, addr: addr + ', ' + city, zone: zoneName };
  try { localStorage.setItem('dv2_last', no); } catch (e) { }
  CART = []; PROMO = ''; cartSave(); paintCart();
  try { localStorage.setItem('dv2_order', JSON.stringify(lastOrder)); } catch (e) { }
  history.replaceState(null, '', '/confirm');
  render();
}

function confirmHTML() {
  var o = lastOrder;
  if (!o) {
    try { var raw = localStorage.getItem('dv2_order'); if (raw) o = JSON.parse(raw); } catch (e) { }
  }
  if (!o) {
    return '<div class="page"><div class="wrap"><div class="empty"><h2>No recent order</h2><p>Place an order first, then this page will show the details.</p><a class="btn" href="/shop">Shop all pieces</a></div></div></div>';
  }
  return orderHTML(o);
}

function trackSubmit() {
  var v = ($('#trk').value || '').trim().toUpperCase();
  if (!v) return;
  var url = 'https://wa.me/' + S.waNum + '?text=' + encodeURIComponent('Hello ' + S.name + ', please check my order ' + v + '.');
  toast('Opening WhatsApp to check order ' + v);
  window.open(url, '_blank');
}

/* ---------- boot ---------- */
function loadData(cb) {
  if (window.DV_DATA) { cb(window.DV_DATA); return; }
  fetch('/data.json?ts=' + Date.now(), { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      if (j) cb(j);
      else {
        var el = document.getElementById('dv-data');
        if (el) { try { cb(JSON.parse(el.textContent)); } catch (e) { document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif">Could not load store data.</p>'; } }
      }
    })
    .catch(function () {
      var el = document.getElementById('dv-data');
      if (el) { try { cb(JSON.parse(el.textContent)); } catch (e) { } }
    });
}

loadData(function (data) {
  boot(data);
  if (route().page === 'admin') return;
});
