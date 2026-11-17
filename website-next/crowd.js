/* Lastbook ink crowd: every line is drawn by hand-jittered strokes, redrawn
   about six times a second so the lines "boil" like a pencil cartoon.
   The same code writes the still SVG used when JavaScript is off (node). */
(function () {
  "use strict";
  var INK = "#16150F", WHITE = "#FFFFFF", CREAM = "#FBF5E2", LAMP = "#F6D77A", LAMPD = "#E0A82A",
    WATER = "#9CC3E6", AID = "#C8372D", HATCH = "rgba(22,21,15,.26)", HATCHB = "rgba(22,21,15,.4)", GREY = "#9A978E", PI = Math.PI,
    LINE = "#6B6B66", LINEFAR = "#B2B1AA", SHIRT = "#9C9B94";

  function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  /* ---------- the pen: geometry in local units, jitter, transform ---------- */
  function Pen(out) { this.o = out; this.m = [1, 0, 0, 1, 0, 0]; this.st = []; this.r = Math.random; this.amp = .75; this.lw = 1; }
  Pen.prototype = {
    save: function () { this.st.push([this.m.slice(), this.amp]); },
    restore: function () { var a = this.st.pop(); this.m = a[0]; this.amp = a[1]; },
    mul: function (a, b, c, d, e, f) { var m = this.m; this.m = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]]; },
    tr: function (x, y) { this.mul(1, 0, 0, 1, x, y); },
    sc: function (x, y) { this.mul(x, 0, 0, y == null ? x : y, 0, 0); },
    rot: function (a) { var c = Math.cos(a), s = Math.sin(a); this.mul(c, s, -s, c, 0, 0); },
    T: function (p) { var m = this.m; return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]; },
    k: function () { var m = this.m; return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])); },
    j: function (p, a) { var r = this.r; return [p[0] + (r() - .5) * 2 * a, p[1] + (r() - .5) * 2 * a]; },
    sub: function (pts, close, step) {
      var q = [], n = pts.length, i, a, b, d, s, t;
      for (i = 0; i < (close ? n : n - 1); i++) {
        a = pts[i]; b = pts[(i + 1) % n]; d = Math.hypot(b[0] - a[0], b[1] - a[1]); s = Math.max(1, Math.round(d / step));
        for (t = 0; t < s; t++) q.push([a[0] + (b[0] - a[0]) * t / s, a[1] + (b[1] - a[1]) * t / s]);
      }
      if (!close) q.push(pts[n - 1]);
      return q;
    },
    /* o: {fill, w, col, a, close, step, amp} */
    shape: function (pts, o) {
      var self = this, amp = (o.amp == null ? this.amp : o.amp), q = this.sub(pts, o.close, o.step || 7);
      var jp = q.map(function (p) { return self.j(p, amp); });
      var sp = jp.map(function (p) { return self.T(p); });
      var fc = o.fill, sc = o.col || INK;
      if (this.fade) { if (fc === INK) fc = this.fade; if (sc === INK) sc = this.fade; }
      if (this.soft && fc === CREAM) fc = WHITE;
      if (fc) this.o.fill(sp, fc, o.a == null ? 1 : o.a);
      if (o.w) {
        var sk = sp;
        if (o.close) { sk = sp.concat([this.T(this.j(q[0], amp * 1.6)), this.T(this.j(q[1 % q.length], amp * 1.6))]); }
        this.o.stroke(sk, sc, o.w * this.k() * this.lw * (.88 + this.r() * .24), o.a == null ? 1 : o.a);
      }
    },
    line: function (pts, w, col, a) { this.shape(pts, { w: w || 3, col: col, a: a }); },
    ell: function (cx, cy, rx, ry, o, n, rot) { this.shape(ell(cx, cy, rx, ry, n, rot), mix({ close: 1 }, o)); },
    dot: function (x, y, r, col) { this.shape(ell(x, y, r, r, 8), { close: 1, fill: col || INK, amp: .25 }); },
    glow: function (x, y, r, col, a) { var p = this.T([x, y]); this.o.glow(p[0], p[1], r * this.k(), col, a); },
    shadow: function (x, y, rx, ry, a) { if (this.noShadow) return; var p = this.T([x, y]), k = this.k(); this.o.shadow(p[0], p[1], rx * k, ry * k, a); }
  };
  function mix(a, b) { for (var k in b) a[k] = b[k]; return a; }
  function ell(cx, cy, rx, ry, n, rot) {
    n = n || 22; rot = rot || 0; var p = [], i, t, c = Math.cos(rot), s = Math.sin(rot), x, y;
    for (i = 0; i < n; i++) { t = i / n * 2 * PI - PI * .6; x = rx * Math.cos(t); y = ry * Math.sin(t); p.push([cx + x * c - y * s, cy + x * s + y * c]); }
    return p;
  }
  function rect(x, y, w, h, r) { // rounded rectangle as points
    r = r || 0; var p = [], k, a;
    var cs = [[x + w - r, y + r, -PI / 2], [x + w - r, y + h - r, 0], [x + r, y + h - r, PI / 2], [x + r, y + r, PI]];
    cs.forEach(function (c) { for (k = 0; k <= 3; k++) { a = c[2] + k / 3 * PI / 2; p.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); } });
    return p;
  }
  /* pencil shading: parallel "/" strokes in the lower right of an ellipse */
  function hatch(p, cx, cy, rx, ry, n, from, to, w, col) {
    var nx = Math.SQRT1_2, ny = Math.SQRT1_2, R = 1 / Math.sqrt(nx * nx / (rx * rx) + ny * ny / (ry * ry)), i, d, x0, y0, A, B, C, D, s1, s2, ux = Math.SQRT1_2, uy = -Math.SQRT1_2;
    from = from == null ? .38 : from; to = to == null ? .86 : to;
    for (i = 0; i < n; i++) {
      d = R * (from + (to - from) * i / Math.max(1, n - 1)); x0 = d * nx; y0 = d * ny;
      A = ux * ux / (rx * rx) + uy * uy / (ry * ry); B = 2 * (x0 * ux / (rx * rx) + y0 * uy / (ry * ry)); C = x0 * x0 / (rx * rx) + y0 * y0 / (ry * ry) - .86;
      D = B * B - 4 * A * C; if (D <= 0) continue; D = Math.sqrt(D); s1 = (-B - D) / (2 * A) * .8; s2 = (-B + D) / (2 * A) * .8;
      p.shape([[cx + x0 + ux * s1, cy + y0 + uy * s1], [cx + x0 + ux * s2, cy + y0 + uy * s2]], { w: w || 1.4, col: col || HATCH, amp: .5, step: 5 });
    }
  }

  /* ---------- renderers ---------- */
  function smooth(s, p, close) {
    var n = p.length, i, m;
    if (n < 2) return;
    if (close) {
      m = mid(p[n - 1], p[0]); s.M(m[0], m[1]);
      for (i = 0; i < n; i++) { m = mid(p[i], p[(i + 1) % n]); s.Q(p[i][0], p[i][1], m[0], m[1]); }
      s.Z();
    } else {
      s.M(p[0][0], p[0][1]);
      for (i = 1; i < n - 1; i++) { m = mid(p[i], p[i + 1]); s.Q(p[i][0], p[i][1], m[0], m[1]); }
      s.L(p[n - 1][0], p[n - 1][1]);
    }
  }
  function mid(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
  function rgba(hex, a) { var n = parseInt(hex.slice(1), 16); return "rgba(" + (n >> 16) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + a + ")"; }

  function CanvasOut(ctx) {
    var s = { M: function (x, y) { ctx.moveTo(x, y); }, L: function (x, y) { ctx.lineTo(x, y); }, Q: function (a, b, c, d) { ctx.quadraticCurveTo(a, b, c, d); }, Z: function () { ctx.closePath(); } };
    return {
      fill: function (p, col, a) { ctx.globalAlpha = a; ctx.fillStyle = col; ctx.beginPath(); smooth(s, p, true); ctx.fill(); },
      stroke: function (p, col, w, a) { ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = ctx.lineJoin = "round"; ctx.beginPath(); smooth(s, p, false); ctx.stroke(); },
      glow: function (x, y, r, col, a) { var g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(col, a)); g.addColorStop(.45, rgba(col, a * .55)); g.addColorStop(1, rgba(col, 0)); ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r); },
      shadow: function (x, y, rx, ry, a) { ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx); var g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, "rgba(22,21,15," + a + ")"); g.addColorStop(.55, "rgba(22,21,15," + a * .75 + ")"); g.addColorStop(1, "rgba(22,21,15,0)"); ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, 2 * PI); ctx.fill(); ctx.restore(); }
    };
  }
  function SvgOut() {
    var parts = [], defs = [], id = 0;
    function f(n) { return Math.round(n * 10) / 10; }
    function d(p, close) { var o = ""; smooth({ M: function (x, y) { o += "M" + f(x) + " " + f(y); }, L: function (x, y) { o += "L" + f(x) + " " + f(y); }, Q: function (a, b, c, e) { o += "Q" + f(a) + " " + f(b) + " " + f(c) + " " + f(e); }, Z: function () { o += "Z"; } }, p, close); return o; }
    return {
      parts: parts, defs: defs,
      fill: function (p, col, a) { parts.push('<path d="' + d(p, true) + '" fill="' + col + '"' + (a < 1 ? ' fill-opacity="' + a + '"' : "") + "/>"); },
      stroke: function (p, col, w, a) { parts.push('<path d="' + d(p, false) + '" fill="none" stroke="' + col + '" stroke-width="' + f(w) + '"' + (a < 1 ? ' stroke-opacity="' + a + '"' : "") + "/>"); },
      glow: function (x, y, r, col, a) { var g = "g" + (id++); defs.push('<radialGradient id="' + g + '"><stop offset="0" stop-color="' + col + '" stop-opacity="' + a + '"/><stop offset=".45" stop-color="' + col + '" stop-opacity="' + a * .55 + '"/><stop offset="1" stop-color="' + col + '" stop-opacity="0"/></radialGradient>'); parts.push('<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(r) + '" fill="url(#' + g + ')"/>'); },
      shadow: function (x, y, rx, ry, a) { var g = "s" + (id++); defs.push('<radialGradient id="' + g + '"><stop offset="0" stop-color="#16150F" stop-opacity="' + a + '"/><stop offset=".55" stop-color="#16150F" stop-opacity="' + a * .75 + '"/><stop offset="1" stop-color="#16150F" stop-opacity="0"/></radialGradient>'); parts.push('<ellipse cx="' + f(x) + '" cy="' + f(y) + '" rx="' + f(rx) + '" ry="' + f(ry) + '" fill="url(#' + g + ')"/>'); },
      raw: function (s) { parts.push(s); }
    };
  }

  /* ---------- the people ---------- */
  // Local units: feet at (0,0), up is negative y. About 68 units tall.
  function legs(p, st, sit) {
    if (sit) return;
    var f = st.walk ? Math.floor(st.t / .22) % 2 : -1, L, R;
    if (f === 0) { L = [-9, 0]; R = [8, 0]; } else if (f === 1) { L = [-2, -2.5]; R = [3, 0]; } else { L = [-6, 0]; R = [6, 0]; }
    p.line([[-5, -15], [(L[0] - 5) / 2, -7], L], 3.2);
    p.line([[5, -15], [(R[0] + 5) / 2, -7], R], 3.2);
    p.ell(L[0] + 1.6, L[1] - 1.2, 4.6, 2.7, { fill: INK, amp: .3 }, 10);
    p.ell(R[0] + 1.6, R[1] - 1.2, 4.6, 2.7, { fill: INK, amp: .3 }, 10);
  }
  function body(p, F, by, rx, ry) {
    var pts = [], i, t, s, c, k;
    for (i = 0; i < 22; i++) { t = i / 22 * 2 * PI; s = Math.sin(t); c = Math.cos(t); k = F.big ? (s > 0 ? 1 + .06 * s : 1 - .02 * -s) : (s > 0 ? 1 + .12 * s : 1 - .1 * -s); pts.push([rx * c * k, by + ry * s]); }
    p.shape(pts, { close: 1, fill: F.shirt || F.fill, w: 3 });
    if (F.big) hatch(p, 0, by, rx, ry, 6, .3, .9, 1.25, HATCHB); else hatch(p, 0, by, rx, ry, 4);
  }
  function head(p, F, hx, hy, look) {
    p.ell(hx, hy, 11.5, 11, { fill: F.fill, w: 3 });
    if (F.big) hatch(p, hx, hy, 11.5, 11, 3, .45, .85, 1.1, HATCHB); else hatch(p, hx, hy, 11.5, 11, 2, .55, .8);
    var lx = look[0], ly = look[1];
    if (!F.noFace) {
      p.dot(hx - 4 + lx, hy - 1.5 + ly * .3, 1.4);
      p.dot(hx + 3.6 + lx, hy - 1.5 + ly * .3, 1.4);
      var mx = hx + lx * .6, my = hy + 3.4 + ly * .3;
      p.line([[mx - 4, my], [mx - 2.5, my + 2.5], [mx, my + 3.5], [mx + 2.5, my + 2.5], [mx + 4, my]], 1.7);
    }
    hat(p, F.hat, hx, hy);
  }
  function hat(p, h, x, y) {
    if (!h) return;
    if (h === "cap") { p.shape([[x - 12, y - 3], [x - 11, y - 9], [x - 4, y - 13.5], [x + 5, y - 13], [x + 11, y - 7], [x + 18, y - 4.5], [x + 11, y - 2.5]], { close: 1, fill: INK, w: 2.4 }); }
    else if (h === "beanie") { p.shape([[x - 12, y - 2], [x - 10, y - 10], [x - 2, y - 14], [x + 7, y - 12.5], [x + 12, y - 4], [x + 12, y - 1.5]], { close: 1, fill: INK, w: 2.4 }); p.dot(x - 1, y - 16, 3.2); p.line([[x - 11, y - 3.5], [x + 11, y - 3]], 2.2, WHITE); }
    else if (h === "scarf") { p.shape([[x - 13, y + 5], [x - 12.5, y - 7], [x - 3, y - 14], [x + 8, y - 12], [x + 13, y - 3], [x + 12, y + 4], [x + 9, y - 4], [x, y - 8], [x - 9, y - 3], [x - 10, y + 6]], { close: 1, fill: WHITE, w: 2.6 }); p.dot(x - 4, y - 8, 1.1, HATCH); p.dot(x + 4, y - 9, 1.1, HATCH); p.dot(x + 9, y - 5, 1.1, HATCH); p.shape([[x - 12, y + 4], [x - 17, y + 10], [x - 12, y + 11]], { w: 2.4, fill: WHITE }); }
    else if (h === "straw") { p.ell(x + 1, y - 6, 21, 5, { fill: CREAM, w: 2.6 }, 24); p.shape([[x - 9, y - 7], [x - 8, y - 15], [x, y - 18], [x + 8, y - 16], [x + 10, y - 7]], { fill: CREAM, w: 2.6 }); p.line([[x - 8.5, y - 9.5], [x + 9.5, y - 9.5]], 2.2); }
  }
  function arm(p, pts) { p.line(pts, 3); }

  /* props: all at the figure's front (+x) */
  function book(p, x, y, s, turn) {
    p.save(); p.tr(x, y); p.sc(s);
    p.shape([[0, -1], [-6, -4], [-13, -3.5], [-14, 4], [-7, 3], [0, 6]], { close: 1, fill: WHITE, w: 2.4 });
    p.shape([[0, -1], [6, -4], [13, -3.5], [14, 4], [7, 3], [0, 6]], { close: 1, fill: WHITE, w: 2.4 });
    p.line([[-10.5, -.5], [-3, .2]], 1.3, HATCH); p.line([[-10.5, 2], [-3, 2.6]], 1.3, HATCH);
    p.line([[3, .2], [10.5, -.5]], 1.3, HATCH); p.line([[3, 2.6], [10.5, 2]], 1.3, HATCH);
    if (turn > 0) { var a = turn * PI; p.line([[0, -1], [Math.cos(a) * 12, -1 - Math.sin(a) * 9], [Math.cos(a) * 13, 4 - Math.sin(a) * 6]], 2.2); }
    p.restore();
  }
  var DRAW = {
    reader: function (p, F, st) { // sitting cross-legged, book on lap
      p.shadow(10 * F.dir, 1, 22, 6, .14);
      p.ell(-7, -5, 10, 5.2, { fill: F.fill, w: 3 }, 16, .1); p.ell(7, -5, 10, 5.2, { fill: F.fill, w: 3 }, 16, -.1);
      body(p, F, -21, 12.5, 14);
      head(p, F, 2, -44, [1, 3.6]);
      book(p, 2, -12, 1.05, st.turn);
      arm(p, [[-10, -27], [-14, -18], [-11, -12]]); arm(p, [[10, -27], [15, -19], [15, -12]]);
    },
    laptop: function (p, F, st) {
      p.shadow(10 * F.dir, 1, 22, 6, .14);
      p.ell(-7, -5, 10, 5.2, { fill: F.fill, w: 3 }, 16, .1); p.ell(7, -5, 10, 5.2, { fill: F.fill, w: 3 }, 16, -.1);
      body(p, F, -21, 12.5, 14);
      head(p, F, 1, -44, [2.5, 3.2]);
      // laptop: screen tilted up, tiny eye-O logo
      p.shape([[2, -11], [26, -11], [27, -8], [1, -8]], { close: 1, fill: WHITE, w: 2.4 });
      p.shape([[6, -11], [9, -31], [29, -30], [26, -11]], { close: 1, fill: WHITE, w: 2.6 });
      p.ell(17.5, -21, 3.8, 3.8, { w: 2 }, 10); p.dot(17.5, -19.8, 1.6);
      p.glow(17.5, -21, 14, LAMP, .45);
      arm(p, [[-10, -27], [-8, -15], [3, -10]]); arm(p, [[10, -27], [12, -16], [8, -10]]);
    },
    lantern: function (p, F, st) {
      p.glow(18, -16, 30, LAMP, .55);
      p.shadow(10 * F.dir, 1, 17, 5.5, .14);
      legs(p, st); body(p, F, -29, 13, 16);
      arm(p, [[-10, -36], [-14, -27], [-13, -20]]);
      head(p, F, 1, -55, [2.5, 2]);
      arm(p, [[10, -37], [17, -33], [19, -31]]);
      // lantern hanging from the hand
      p.line([[14, -23], [17, -31], [23, -30], [24, -23]], 1.8);
      p.shape(rect(12.5, -23, 13, 3, 1), { close: 1, fill: INK, amp: .3 });
      p.shape(rect(13.5, -20.5, 11, 12, 2), { close: 1, fill: LAMP, w: 2.2 });
      p.shape([[19, -18], [21.5, -13], [19, -10.5], [16.5, -13]], { close: 1, fill: LAMPD, amp: .4 });
      p.line([[16.5, -20], [16.5, -9]], 1.4); p.line([[21.5, -20], [21.5, -9]], 1.4);
      p.shape(rect(12, -9, 14, 3, 1), { close: 1, fill: INK, amp: .3 });
    },
    jug: function (p, F, st) {
      p.shadow(10 * F.dir, 1, 19, 6, .14);
      p.save(); p.rot(-.07);
      legs(p, st); body(p, F, -29, 13.5, 16);
      head(p, F, -1, -55, [2.5, 2.8]);
      arm(p, [[-10, -36], [-15, -28], [-12, -21]]);
      // jug at the side
      p.shape(rect(11, -26, 15, 18, 5), { close: 1, fill: WHITE, w: 2.6 });
      p.shape([[12.5, -18], [17, -19], [21, -17.5], [24.5, -18.5], [24.5, -12], [22, -9.5], [14, -9.5], [12.5, -12]], { close: 1, fill: WATER, amp: .4 });
      p.shape(rect(11, -26, 15, 18, 5), { close: 1, w: 2.6 });
      p.shape(rect(14.5, -30, 7, 4.5, 1.5), { close: 1, fill: WHITE, w: 2.2 });
      p.line([[26, -23], [30, -21], [29.5, -14], [26, -12.5]], 2.2);
      arm(p, [[10, -38], [14, -33], [16, -29]]);
      p.restore();
    },
    aid: function (p, F, st) {
      p.shadow(10 * F.dir, 1, 18, 6, .14);
      legs(p, st); body(p, F, -29, 13, 16);
      head(p, F, 1, -55, [2.2, 3]);
      arm(p, [[-10, -37], [-8, -28], [2, -24]]);
      p.shape(rect(3, -34, 22, 15, 3), { close: 1, fill: WHITE, w: 2.6 });
      p.line([[10, -34], [10.5, -37.5], [17.5, -37.5], [18, -34]], 2.2);
      p.shape(rect(12, -30.5, 4.6, 8.6, .6), { close: 1, fill: AID, amp: .25 });
      p.shape(rect(9.7, -28.3, 9.2, 4.4, .6), { close: 1, fill: AID, amp: .25 });
      arm(p, [[10, -37], [18, -31], [21, -25]]);
    },
    phone: function (p, F, st) {
      p.shadow(10 * F.dir, 1, 17, 5.5, .14);
      legs(p, st); body(p, F, -29, 13, 16);
      arm(p, [[-10, -36], [-14, -27], [-12, -20]]);
      head(p, F, 0, -55, [2.6, -3]);
      arm(p, [[9, -40], [16, -52], [17, -64]]);
      p.save(); p.tr(17, -70); p.rot(.15);
      p.shape(rect(-4, -7, 8, 13, 2), { close: 1, fill: INK, amp: .3 });
      p.shape(rect(-2.6, -5.4, 5.2, 9, 1), { close: 1, fill: WHITE, amp: .2 });
      p.restore();
      // empty signal bars and a little cross
      p.line([[25, -80], [29, -76]], 1.8); p.line([[29, -80], [25, -76]], 1.8);
    },
    radio: function (p, F, st) {
      p.shadow(10 * F.dir, 1, 18, 6, .14);
      legs(p, st); body(p, F, -29, 13, 16);
      head(p, F, 0, -55, [2.4, 2.4]);
      p.line([[6, -34], [14, -50], [17, -56]], 1.8); p.dot(17.4, -56.6, 2);
      p.shape(rect(2, -35, 22, 14, 3), { close: 1, fill: CREAM, w: 2.6 });
      p.ell(9, -28, 4.2, 4.2, { fill: WHITE, w: 2 }, 12);
      p.line([[7, -29], [11, -27]], 1.1, HATCH); p.line([[7, -27], [11, -29]], 1.1, HATCH);
      p.line([[16, -31], [21, -31]], 1.8); p.line([[16, -27], [21, -27]], 1.8); p.dot(18.5, -24, 1.4);
      arm(p, [[-10, -36], [-6, -27], [2, -26]]); arm(p, [[10, -37], [22, -33], [24, -27]]);
    },
    garden: function (p, F, st) {
      p.shadow(10 * F.dir, 1, 17, 5.5, .14);
      legs(p, st); body(p, F, -29, 13, 16);
      arm(p, [[-10, -36], [-14, -27], [-12, -20]]);
      head(p, F, 0, -55, [2.8, 1.6]);
      arm(p, [[10, -38], [16, -36], [18, -42]]);
      p.save(); p.tr(20, -48); p.rot(.18);
      p.shape(rect(-5, -7, 10, 13, 1.5), { close: 1, fill: WHITE, w: 2.2 });
      p.line([[0, 3], [0, -2]], 1.6, "#2F6B4F"); p.ell(-2, -2.5, 2.2, 1.3, { fill: "#2F6B4F", amp: .2 }, 8, -.5); p.ell(2, -3.5, 2.2, 1.3, { fill: "#2F6B4F", amp: .2 }, 8, .5);
      p.restore();
    },
    kid: function (p, F, st) {
      p.shadow(9 * F.dir, 1, 15, 5, .14);
      legs(p, st);
      p.shape(rect(-21, -40, 10, 18, 3.5), { close: 1, fill: CREAM, w: 2.6 }); p.line([[-20, -33], [-12, -33]], 1.8);
      body(p, F, -29, 12, 15);
      head(p, F, 1, -54, [-2.4, 2.6]);
      arm(p, [[-9, -37], [-12, -29], [-10, -21]]); arm(p, [[9, -37], [13, -29], [11, -21]]);
      p.line([[-9, -40], [-4, -24]], 1.8);
    },
    extra: function (p, F, st) {
      p.shadow(10 * F.dir, 1, 17, 5.5, .14);
      legs(p, st); body(p, F, -29 - st.bob, 13, 16);
      var sw = st.walk ? (Math.floor(st.t / .22) % 2 ? 3 : -3) : 0;
      arm(p, [[-10, -36 - st.bob], [-13 - sw, -28], [-11 - sw * 1.5, -21]]);
      head(p, F, 1, -55 - st.bob, F.look || [2.4, .6]);
      arm(p, [[10, -36 - st.bob], [13 + sw, -28], [11 + sw * 1.5, -21]]);
    }
  };

  /* ---------- the giant lantern behind the wordmark ---------- */
  function giant(p, x, y, s, swing, flick, top) {
    var w = 2.5 / s;
    p.save(); p.tr(x, y); p.rot(swing); p.sc(s);
    p.amp = 1.3;
    var cord = top == null ? -1200 : Math.min(0, (top - y) / s);
    p.line([[0, cord], [0, cord / 2], [0, 0]], w * 1.2, INK, .8);
    p.ell(0, 8, 8, 8, { w: w * 1.4, a: .85 }, 14);
    p.line([[-50, 78], [-42, 34], [-18, 16], [0, 14], [18, 16], [42, 34], [50, 78]], w * 1.4, INK, .85);
    // cap
    p.shape([[-58, 82], [-48, 60], [-24, 46], [0, 42], [24, 46], [48, 60], [58, 82]], { close: 1, fill: WHITE, w: w * 1.5, a: 1 });
    hatch(p, 20, 66, 34, 14, 5, .1, .9, w);
    p.ell(-16, 66, 4, 3, { w: w }, 8); p.ell(0, 63, 4, 3, { w: w }, 8); p.ell(16, 66, 4, 3, { w: w }, 8);
    p.shape(rect(-62, 82, 124, 14, 4), { close: 1, fill: WHITE, w: w * 1.5 });
    // glass and glow
    p.glow(0, 190, 300, LAMP, .36 + flick * .05);
    p.glow(0, 168, 90, LAMP, .5 + flick * .08);
    p.glow(0, 176, 46, LAMPD, .35 + flick * .1);
    p.shape([[-50, 96], [-56, 150], [-54, 200], [-48, 236], [48, 236], [54, 200], [56, 150], [50, 96]], { close: 1, w: w * 1.4, a: .9 });
    p.line([[-18, 98], [-21, 165], [-18, 234]], w, INK, .8); p.line([[18, 98], [21, 165], [18, 234]], w, INK, .8);
    for (var i = 0; i < 7; i++) p.line([[30 + i * 3.2, 110 + i * 3], [36 + i * 2.6, 140 + i * 6]], w * .8, HATCH);
    // flame
    var fh = 50 + flick * 4;
    p.shape([[0, 222], [-14, 206], [-12, 190], [-3, 222 - fh * .9], [0, 222 - fh], [5, 222 - fh * .7], [13, 196], [12, 210]], { close: 1, fill: LAMP, w: w * 1.2, a: 1 });
    p.shape([[0, 220], [-6, 210], [-4, 198], [0, 188], [5, 200], [6, 212]], { close: 1, fill: LAMPD, amp: .7 });
    p.line([[0, 222], [0, 234]], w * 1.6);
    // base tank
    p.shape(rect(-64, 236, 128, 14, 4), { close: 1, fill: WHITE, w: w * 1.5 });
    p.shape([[-60, 250], [-66, 274], [-58, 296], [-30, 306], [30, 306], [58, 296], [66, 274], [60, 250]], { close: 1, fill: WHITE, w: w * 1.5 });
    hatch(p, 26, 278, 40, 26, 7, .05, .95, w);
    p.restore();
  }

  /* ---------- cast and layout ---------- */
  // shirt: a grey top, like a printed T-shirt. All the crowd is white with soft grey lines.
  var CAST = {
    reader: { kind: "reader" }, kid: { kind: "kid", shirt: 1 }, lantern: { kind: "lantern", hat: "beanie", shirt: 1 },
    garden: { kind: "garden", hat: "straw" }, aid: { kind: "aid", shirt: 1 }, jug: { kind: "jug", hat: "scarf" },
    phone: { kind: "phone", mouthO: 1, shirt: 1 }, radio: { kind: "radio", hat: "cap", mouthO: 1 }, laptop: { kind: "laptop", shirt: 1 },
    big1: { kind: "reader", hat: "scarf", shirt: 1 },
    x1: { kind: "extra", hat: "cap", walk: 1 }, x2: { kind: "extra", walk: 1, shirt: 1 }, x3: { kind: "extra", hat: "beanie", walk: 1 }, x4: { kind: "extra", walk: 1, look: [-1, -2] }
  };
  // desktop: [who, across (0 = left edge, 1 = right), down to the feet (0 = top, 1 = bottom)].
  // Size comes from the depth: small and far at the top, big and near at the bottom.
  var DESK = [
    ["x2", .44, .55], ["x4", .585, .53], ["x3", .37, .60],
    ["phone", .15, .57], ["radio", .82, .55], ["x1", .90, .65],
    ["lantern", .25, .68], ["jug", .74, .68],
    ["kid", .07, .76], ["garden", .94, .79],
    ["aid", .175, .86], ["big1", .06, .97], ["reader", .89, .96]
  ];
  // phone: at most two people, never on the words. [who, across, where the feet are, size]:
  // "floor" is the bottom of the hero, "side" is beside the wordmark's last line.
  // Each one slides out towards its edge until it is clear; if it can't be, it isn't drawn.
  var PHONE = [["lantern", .84, "floor", 1.1], ["phone", .14, "floor", 1], ["reader", .08, "side", .85], ["jug", .93, "side", .85]];
  var PHONE_MAX = 2;
  function boxOf(x, y, s) { return [x - 26 * s, y - 82 * s, x + 32 * s, y + 4]; }
  function hits(bx, R) { for (var i = 0; i < R.length; i++) { var r = R[i]; if (bx[0] < r[2] && bx[2] > r[0] && bx[1] < r[3] && bx[3] > r[1]) return r; } return null; }
  function hitsFig(bx, figs, me) { for (var i = 0; i < figs.length; i++) { var o = figs[i]; if (o !== me && !(o.far && me && !me.far) && !(me && me.far && !o.far)) { var b = boxOf(o.x, o.y, o.s); if (bx[0] < b[2] + 6 && bx[2] + 6 > b[0] && bx[1] < b[3] && bx[3] > b[1]) return o; } } return null; }
  function depthOf(v) { return Math.max(0, Math.min(1, (v - .3) / .64)); }
  function layout(W, H, B, phone) {
    var out = [], list = phone ? PHONE : DESK, i, e, c, x, y, s, d, far, R, k, n, bx, F;
    // overall size: by the height, and narrower windows get smaller people
    // on a tall window (a tablet held upright) the crowd gathers round the words instead of spreading to the top and bottom
    var span = Math.min(H, W * .75), cy = span < H ? B.cy : H / 2;
    var K = Math.max(.6, Math.min(1.12, span / 900, W / 1300));
    for (i = 0; i < list.length; i++) {
      e = list[i]; c = CAST[e[0]];
      if (phone) {
        if (out.length >= PHONE_MAX) break;
        x = W * e[1]; y = e[2] === "floor" ? H - 10 : B.wm[1] - 4; s = e[3]; far = false; d = .8;
        // slide towards the near edge until clear of the words, the buttons and the other person
        for (n = 0; n < 30; n++) { bx = boxOf(x, y, s); if (!hits(bx, B.rects) && !hitsFig(bx, out, { far: false }) && bx[1] > B.top) break; x += x < W / 2 ? -6 : 6; }
        // at most a third of a person may leave the screen
        if (n === 30 || x < 10 * s || x > W - 10 * s) continue;
      } else {
        x = W * e[1]; y = cy + span * (e[2] - .5); d = depthOf(e[2]); s = (1 + 1.7 * d) * K; far = d < .2;
        if (y > H - 4) y = H - 4;
        R = far ? B.text : B.rects;
        // step out from the middle until clear of the words and the other people
        for (n = 0; n < 40; n++) { bx = boxOf(x, y, s); if (!hits(bx, R) && !hitsFig(bx, out, { far: far })) break; x += x < B.cx ? -14 : 14; }
        if (n === 40 || x < 20 || x > W - 20) continue;
      }
      F = { id: e[0], kind: c.kind, hat: c.hat, mouthO: c.mouthO, look: c.look, fill: WHITE, shirt: c.shirt ? SHIRT : null,
        walk: !!c.walk, far: far, d: d, x: x, y: y, s: s, dir: (i % 2 ? -1 : 1), seed: 11 + i * 37,
        speed: (8 + (i * 7) % 7) * s, ph: i * 1.7, t: 0 };
      // walkers pace a stretch of floor that is free of words and people
      if (F.walk) {
        R = far ? B.text : B.rects;
        for (k = 0; k < 2; k++) {
          var lim = k ? W - 20 : 20, step = k ? 6 : -6, xx = x;
          while ((k ? xx < lim : xx > lim) && Math.abs(xx - x) < (phone ? 60 : 160) && !hits(boxOf(xx + step, y, s), R) && !hitsFig(boxOf(xx + step, y, s), out, F)) xx += step;
          if (k) F.hi = xx; else F.lo = xx;
        }
      }
      out.push(F);
    }
    return out;
  }

  function mixHex(a, b, t) { var x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16), r = function (sh) { return Math.round(((x >> sh) & 255) * (1 - t) + ((y >> sh) & 255) * t); }; return 'rgb(' + r(16) + ',' + r(8) + ',' + r(0) + ')'; }
  /* Distant skyline, impact and blackout, drawn with the crowd's ink pen. */
  function disasterSky(p, W, H, G, now, still) {
    if (!G || W < 760) return;
    var top = G.top + 18;
    var floor = Math.min(H * .29, G.y + 65);
    var height = floor - top;
    if (height < 100) return;
    var t = still ? 12 : (now / 1000) % 26;
    var meteorPaths = [[.43,.23],[.57,.81],[.04,.29],[.96,.67],[.31,.12]];
    var path = meteorPaths[still ? 0 : Math.floor(now / 26000) % meteorPaths.length];
    var fade = t > 23 ? (26 - t) / 3 : 1;
    var scale = Math.min(1, W / 1200);
    var buildings = [
      [.06, 48, 58], [.12, 40, 91], [.17, 56, 73], [.23, 45, 120],
      [.29, 60, 86], [.36, 38, 58], [.61, 48, 72], [.67, 46, 110],
      [.73, 64, 89], [.81, 42, 134], [.87, 53, 69], [.93, 34, 51]
    ];
    p.save(); p.fade = null; p.soft = 0; p.amp = .9;
    p.r = rng(3107 + Math.floor(now / 180) % 3);
    p.line([[W * .025, floor], [W * .48, floor + 2], [W * .975, floor]], 1.5, '#99968C', .45);
    // A quieter, overlapping far skyline gives the nearer roofs depth.
    buildings.forEach(function (b, index) {
      var x = W * b[0] - 18 * scale, w = b[1] * scale * 1.3;
      var h = Math.min((b[2] + 28) * scale, height * .72);
      p.shape([[x-w/2,floor],[x-w/2,floor-h],[x-w*.12,floor-h],
        [x-w*.12,floor-h-12*scale],[x+w*.2,floor-h-12*scale],
        [x+w*.2,floor-h],[x+w/2,floor-h],[x+w/2,floor]],
        {close:1,fill:'#C8C4BA',col:'#B7B3AA',w:1,a:.42});
    });
    buildings.forEach(function (b, index) {
      var x = W * b[0], w = b[1] * scale * 1.14;
      var h = Math.min(b[2] * scale, height * .72), y = floor - h;
      var roof = index % 3;
      var outline = roof === 0 ? [[x-w/2,floor],[x-w/2,y+13*scale],
        [x,y],[x+w/2,y+13*scale],[x+w/2,floor]] :
        [[x-w/2,floor],[x-w/2,y],[x+w/2,y],[x+w/2,floor]];
      p.shape(outline,{close:1,fill:'#E1DDD2',col:'#77756D',w:1.8,a:.88});
      p.shape([[x+w*.20,floor],[x+w*.20,y+5],[x+w/2,y+5],[x+w/2,floor]],
        {close:1,fill:'#B9B4A9',a:.32});
      if (roof === 1) {
        p.line([[x-w/2-2,y-5],[x+w/2+2,y-5]],1.4,'#77756D',.7);
        p.line([[x-w/2,y+h*.32],[x+w/2,y+h*.32]],1,'#9C978D',.5);
      }
      if (index === 3 || index === 9) {
        p.shape(rect(x-w*.12,y-10*scale,w*.24,10*scale,1),
          {close:1,fill:'#BBB6AC',col:'#77756D',w:1.3,a:.85});
        p.line([[x,y-10*scale],[x,y-25*scale]],1.2,'#77756D',.7);
        p.line([[x-7*scale,y-20*scale],[x+7*scale,y-20*scale]],1,'#77756D',.7);
      }
      var lights = t < 10 + index * .18 || t > 24.5;
      var rows = Math.floor((h - 24 * scale) / (16 * scale));
      for (var row = 0; row < rows; row++) {
        for (var col = 0; col < 3; col++) {
          p.shape(rect(x-w*.34+col*w*.25,y+19*scale+row*16*scale,w*.13,6*scale,.5),
            {close:1,fill:lights ? '#DFA942' : '#7A7770',a:lights ? .85*fade : .45});
        }
      }
      p.shape(rect(x-w*.09,floor-13*scale,w*.18,13*scale,1),
        {close:1,fill:'#969187',a:.65});
    });
    // Cycle through five approaches, with each impact following its meteor.
    if (t >= 3 && t < 8) {
      var q = (t - 3) / 5;
      var mx = W * (path[0] + q * (path[1] - path[0])), my = top + q * height;
      var tailX = W * (path[0] - path[1]), tailY = -height;
      var tailLength = Math.sqrt(tailX * tailX + tailY * tailY);
      tailX = tailX / tailLength * 175 * scale;
      tailY = tailY / tailLength * 175 * scale;
      var normalX = -tailY / (175 * scale), normalY = tailX / (175 * scale);
      var rotation = Math.atan2(-tailX, tailY);
      p.glow(mx, my, 47 * scale, '#E7A446', .25);
      p.shape([[mx + tailX, my + tailY],
        [mx + normalX * 8, my + normalY * 8], [mx - normalX * 8, my - normalY * 8]],
        {close:1, fill:'#D99047', a:.42});
      p.line([[mx + tailX, my + tailY], [mx + tailX * .16, my + tailY * .16], [mx, my]],
        2.8, '#C2783E', .7);
      p.ell(mx,my,14*scale,17*scale,{fill:'#D47D3F',col:'#BA6936',w:1.6},9,rotation);
      p.ell(mx-2*scale,my+2*scale,10*scale,12*scale,{fill:'#625A4E',col:'#514B42',w:1.6},8,rotation);
      p.line([[mx+tailX*.74,my+tailY*.74],[mx+tailX*.23,my+tailY*.23],
        [mx+tailX*.05,my+tailY*.05]],4,'#E9B254',.75);
    }
    if (t >= 8 && t < 14) {
      var impact = (t - 8) / 6, ix = W * path[1];
      var spread = Math.sin(Math.min(1, impact * 2) * PI / 2);
      var blast = Math.min(W * .20, height * .82) * spread;
      var opacity = Math.min(1,impact*15) * (1-impact);
      // A loose ink burst and ground ripple keep the impact in the sketch style.
      p.ell(ix,floor,blast*1.15,blast*.12,{col:'#918A7B',w:1.5,a:opacity*.55},28);
      var burst = [];
      for (var ray = 0; ray <= 18; ray++) {
        var angle = PI + ray * PI / 18;
        var radius = blast * (ray % 2 ? .46 : .67);
        burst.push([ix + Math.cos(angle) * radius,
          floor + Math.sin(angle) * radius * .8]);
      }
      p.line(burst,1.8,'#8E7960',opacity*.8);
      if (impact < .22) {
        p.ell(ix,floor-8*scale,blast*.32,blast*.2,
          {fill:'#E4BA70',a:opacity*.24},13);
      }
      for (var k = 0; k < 13; k++) {
        var debrisAngle = PI * (1.05 + k * .075);
        var distance = impact * 210 * scale;
        var dx = ix + Math.cos(debrisAngle) * distance;
        var dy = floor + Math.sin(debrisAngle) * distance + impact*impact*90*scale;
        p.line([[dx,dy],[dx-Math.cos(debrisAngle)*11*scale,dy-Math.sin(debrisAngle)*11*scale]],
          2,'#8D7760',opacity*.8);
        p.ell(dx,dy,2.4*scale,1.8*scale,{fill:'#786A58',a:opacity},7);
      }
      p.line([[ix-blast*.85,floor+4],[ix-blast*.55,floor-4],
        [ix-blast*.28,floor+1],[ix,floor-5],[ix+blast*.35,floor+2],
        [ix+blast*.7,floor-3],[ix+blast*.95,floor+4]],1.2,'#A49A88',opacity*.55);
    }
    if (t >= 8 && t < 24) {
      [3, 8].forEach(function (index) {
        var b = buildings[index], x = W * b[0], h = Math.min(b[2] * scale, height * .66);
        var y = floor - h + 9;
        var strength = Math.min(1, (t - 8) / 2) * fade;
        p.glow(x, y, 38 * scale, '#D68F41', .15 * strength);
        for (var smoke = 0; smoke < 6; smoke++) {
          var rise = ((t * 18 + smoke * 24) % 115) * scale;
          p.ell(x + Math.sin(t + smoke) * 9 * scale, y - rise, (14 + rise * .20) * scale,
            (16 + rise * .22) * scale, {fill:'#827D72', a:(1 - rise / 135) * .26 * strength}, 15);
        }
        for (var flame = 0; flame < 3; flame++) {
          var fx = x + (flame - 1) * 9 * scale;
          var fh = (34 + Math.sin(t * 6 + flame * 2) * 10) * scale * strength;
          p.shape([[fx - 7 * scale,y + 10], [fx - 5 * scale,y - fh * .3],
            [fx + 3 * scale,y - fh], [fx + 2 * scale,y - fh * .2], [fx + 7 * scale,y + 10]],
            {close:1, fill:flame === 1 ? '#E8B34F' : '#CF8150', a:.7 * strength});
        }
      });
    }
    p.restore(); p.soft = 1; p.fade = LINE;
  }

  function scene(p, figs, G, now, frame, still, H, W) {
    p.soft = 1; p.fade = LINE;
    disasterSky(p, W, H, G, now, still);
    if (G) { p.r = rng(5 + frame * 977); giant(p, G.x, G.y, G.s, still ? 0 : Math.sin(now / 1000 * 2 * PI / 7) * .02, still ? .5 : Math.sin(now / 90) * .5 + Math.sin(now / 37) * .3, G.top); }
    var order = figs.slice().sort(function (a, b) { return a.y - b.y; });
    // long soft shadows on the floor first, so none falls over a person in front
    order.forEach(function (F) { p.o.shadow(F.x + 26 * F.s, F.y, 44 * F.s, 6.5 * F.s, .1); });
    p.noShadow = 1;
    order.forEach(function (F) {
      p.r = rng(F.seed * 31 + frame * 977);
      p.fade = mixHex(LINE, LINEFAR, (1 - F.d) * .8);
      p.lw = (2.2 + .8 * F.s) / (3 * F.s);
      p.amp = .75 * Math.min(1, 1.4 / F.s);
      var t = now / 1000 + F.ph;
      var st = { t: t, walk: F.walk && !still, bob: 0, turn: 0 };
      if (st.walk) st.bob = Math.floor(t / .22) % 2 ? 1.6 : 0;
      if (F.kind === "reader" && !still) { var q = (t % 4) / .45; st.turn = q < 1 ? q : 0; }
      p.save(); p.tr(F.x, F.y); p.sc(F.s);
      if (!F.walk && !still) p.rot(Math.sin(t * 2 * PI / 3) * .022);
      if (F.dir < 0) p.sc(-1, 1);
      DRAW[F.kind](p, F, st);
      p.restore();
    });
    p.lw = 1; p.amp = .75; p.noShadow = 0; p.fade = null; p.soft = 0;
  }
  function fixFacing(figs, W) { figs.forEach(function (F) { if (!F.walk) F.dir = F.x < W / 2 ? 1 : -1; }); }
  function bubY(F) { return F.y - (F.kind === "reader" || F.kind === "laptop" ? 56 : F.kind === "phone" ? 98 : 80) * F.s; }
  var CALM = [["lantern", "generator works!"], ["jug", "found clean water!"], ["aid", "preserved our first harvest!", 1]];

  /* ---------- node: the still SVGs for JavaScript off, and the drawing kit for tools/art ---------- */
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      still: function (W, H, B, phone, G, bubbles) {
        var o = SvgOut(), p = new Pen(o), figs = layout(W, H, B, phone);
        fixFacing(figs, W);
        scene(p, figs, G, 0, 0, true, H, W);
        var placed = [];
        (bubbles || CALM).forEach(function (b) {
          var F = figs.filter(function (f) { return f.id === b[0]; })[0]; if (!F) return;
          var tw = b[1].length * 8.2 + 24, x = Math.max(8, Math.min(W - tw - 8, F.x - tw / 2)), y = bubY(F) - 40, sh = b[2] === 1, tx = Math.max(x + 14, Math.min(x + tw - 14, F.x));
          placed.forEach(function (o) { if (x < o[0] + o[2] + 4 && x + tw + 4 > o[0] && y < o[1] + 31 && y + 31 > o[1]) y = o[1] - 44; }); placed.push([x, y, tw]);
          if (x < B.wx1 - 24 && x + tw > B.wx0 + 24 && y < B.wm[1] - 30 && y + 36 > B.wm[0] + 20) { placed.pop(); return; }
          p.r = rng(F.seed); p.m = [1, 0, 0, 1, 0, 0];
          p.shape(rect(x, y, tw, 27, 12), { close: 1, fill: sh ? LAMP : WHITE, w: sh ? 2.5 : 2, col: sh ? INK : LINE, amp: .5 });
          p.shape([[tx - 7, y + 26], [tx - 1, y + 36], [tx + 6, y + 26]], { fill: sh ? LAMP : WHITE, w: sh ? 2.5 : 2, col: sh ? INK : LINE, amp: .3 });
          o.raw('<text x="' + Math.round(x + tw / 2) + '" y="' + (y + 18.5) + '" text-anchor="middle" font-family="Nunito,ui-rounded,system-ui,sans-serif" font-weight="800" font-size="15" fill="#16150F">' + b[1].replace(/'/g, "&#8217;") + "</text>");
        });
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid slice" stroke-linecap="round" stroke-linejoin="round"><defs>' + o.defs.join("") + "</defs>" + o.parts.join("") + "</svg>";
      },
      Pen: Pen, SvgOut: SvgOut, DRAW: DRAW, rng: rng, rect: rect, ell: ell, hatch: hatch, giant: giant, book: book,
      legs: legs, body: body, head: head, arm: arm, C: { INK: INK, WHITE: WHITE, CREAM: CREAM, LAMP: LAMP, LAMPD: LAMPD, WATER: WATER, AID: AID, HATCH: HATCH, HATCHB: HATCHB }
    };
    return;
  }

  /* ---------- browser ---------- */
  // The hero's words, buttons and wordmark, measured. tools/art/measure.js prints
  // this (LastbookCrowd.take()) so make-still.cjs can draw the same scene as SVG.
  function take() {
    var hero = document.getElementById("hero"), r = hero.getBoundingClientRect(), wm = document.querySelector(".wm-svg").getBoundingClientRect(),
      c = document.getElementById("centre").getBoundingClientRect(), bar = document.querySelector(".bar").getBoundingClientRect();
    var W = r.width, H = r.height, phone = W < 760, rs = [], tx = [];
    [].forEach.call(document.querySelectorAll("#centre .wm-svg,#centre .lead,#centre .phone-note,#centre .dl-item,#centre .then,#centre .hero-community,.hero-foot p,.bar-in>*"), function (el) {
      var q = el.getBoundingClientRect(); if (!q.width) return;
      var b = [q.left - r.left - 16, q.top - r.top - 16, q.right - r.left + 16, q.bottom - r.top + 10];
      rs.push(b); if (!el.classList.contains("wm-svg")) tx.push(b);
    });
    var top = bar.bottom - r.top, ws = wm.width / 620, anchor = wm.top - r.top + 26 * ws;
    var G = { x: wm.left - r.left + 318 * ws, s: Math.max(.05, Math.min(ws * (phone ? .5 : .6), (anchor - top - 10) / 306)), top: top };
    G.y = anchor - 306 * G.s;
    return { W: W, H: H, phone: phone, G: G,
      B: { rects: rs, text: tx, cx: (c.left + c.right) / 2 - r.left, cy: (c.top + c.bottom) / 2 - r.top, top: top, wm: [wm.top - r.top, wm.bottom - r.top], wx0: wm.left - r.left, wx1: wm.right - r.left } };
  }
  window.LastbookCrowd = { take: take };
  var RM = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)"), reduce = !!(RM && RM.matches);
  function start() {
    var hero = document.getElementById("hero"), cv = document.getElementById("crowd"), centre = document.getElementById("centre"), bl = document.getElementById("bubbles");
    if (!hero || !cv || !cv.getContext) return;
    var ctx = cv.getContext("2d"), pen = new Pen(CanvasOut(ctx)), figs = [], G = null, W = 0, H = 0, dpr = 1, phone = false, B;
    function measure() {
      var L = take();
      W = L.W; H = L.H; B = L.B; G = L.G; phone = L.phone; dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      figs = layout(W, H, B, phone); fixFacing(figs, W);
    }
    measure();
    var sceneStart = performance.now();
    var bubs = [], qi = 0, nextBub = 900, last = performance.now(), running = true, raf = 0, seen = true, mx = null, my = null;
    function makeBub(text, kind, F) {
      var d = document.createElement("div"); d.className = "bub" + (kind === 1 ? " shout" : kind === 2 ? " quiet" : "");
      var s = document.createElement("span"); s.textContent = text; d.appendChild(s);
      d.insertAdjacentHTML("beforeend", '<svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true"><path d="M2 0.5 L8.5 12 L15.5 0.5"/></svg>');
      bl.appendChild(d);
      var b = { el: d, F: F, born: performance.now(), life: 2200 + Math.random() * 1000 };
      place(b); requestAnimationFrame(function () { d.classList.add("on"); });
      return b;
    }
    function place(b) {
      // a hidden bubble measures 0 wide, so keep the size from when it last showed
      if (!b.el.hidden || !b.w) { var wasHidden = b.el.hidden; b.el.hidden = false; b.w = b.el.offsetWidth; b.h = b.el.offsetHeight; b.el.hidden = wasHidden; }
      var F = b.F, w = b.w, h = b.h, x = F.x - w / 2, y = bubY(F) - h - 6, top = B.top + 8;
      // keep it off the words: slide it sideways out of any text it would cover
      for (var j = 0; j < B.text.length; j++) { var t = B.text[j]; if (x < t[2] - 14 && x + w > t[0] + 14 && y < t[3] - 6 && y + h > t[1] + 12) x = F.x < B.cx ? t[0] + 14 - w : t[2] - 14; }
      x = Math.max(8, Math.min(W - w - 8, x));
      // keep clear of the other bubbles: step up above any it would cover
      for (var i = 0; i < bubs.length; i++) { var o = bubs[i].r; if (bubs[i] !== b && o && x < o[0] + o[2] + 4 && x + w + 4 > o[0] && y < o[1] + o[3] + 4 && y + h + 4 > o[1]) y = o[1] - h - 4; }
      // no room on screen, or it would sit under the header: don't show it
      // nor on top of the wordmark
      var onWm = x < B.wx1 - 24 && x + w > B.wx0 + 24 && y < B.wm[1] - 30 && y + h > B.wm[0] + 20;
      b.el.hidden = w > W - 16 || y < top || onWm || x < 0 || x + w > W || !!hits([x, y, x + w, y + h], B.text);
      b.r = b.el.hidden ? null : [x, y, w, h];
      b.el.style.transform = "translate(" + Math.round(x) + "px," + Math.round(y) + "px)";
    }
    function byId(id) { for (var i = 0; i < figs.length; i++) if (figs[i].id === id) return figs[i]; return null; }
    function calm() { CALM.forEach(function (s) { var F = byId(s[0]); if (F) bubs.push(makeBub(s[1], s[2], F)); }); }
    if (reduce) calm();

    function draw(now) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      scene(pen, figs, G, now - sceneStart, reduce ? 0 : Math.floor(now / 160) % 3, reduce, H, W);
    }
    function tick(now) {
      raf = 0; if (!running) return;
      var dt = Math.min(.05, (now - last) / 1000); last = now;
      figs.forEach(function (F) {
        if (!F.walk) return;
        var nx = F.x + F.dir * F.speed * dt, bx = boxOf(nx, F.y, F.s);
        if (hits(bx, F.far ? B.text : B.rects) || hitsFig(bx, figs, F)) { F.dir = -F.dir; return; }
        F.x = nx;
        if (F.x > F.hi) { F.x = F.hi; F.dir = -1; } if (F.x < F.lo) { F.x = F.lo; F.dir = 1; }
      });
      nextBub -= dt * 1000;
      if (nextBub <= 0 && bubs.length < 3) {
        for (var n = 0; n < STORY.length; n++) {
          var s = STORY[qi++ % STORY.length], F = byId(s[0]);
          if (F && !bubs.some(function (b) { return b.F === F; })) { bubs.push(makeBub(s[1], s[2], F)); break; }
        }
        nextBub = 900 + Math.random() * 500;
      }
      bubs = bubs.filter(function (b) {
        var age = now - b.born;
        if (age > b.life + 200) { b.el.remove(); return false; }
        if (age > b.life) b.el.classList.remove("on");
        place(b); return true;
      });
      draw(now); eyes(now);
      raf = requestAnimationFrame(tick);
    }
    var paused = false, pb = document.getElementById("pause");
    function wirePause() {
      pb.dataset.on = "1";
      pb.addEventListener("click", function () { paused = !paused; pb.setAttribute("aria-pressed", paused ? "true" : "false"); pb.querySelector("span").textContent = paused ? "Play" : "Pause"; go(); });
    }
    if (pb && !reduce) { pb.hidden = false; wirePause(); }
    if (RM) {
      var onRM = function () {
        reduce = RM.matches;
        bubs.forEach(function (b) { b.el.remove(); }); bubs = [];
        if (pb) pb.hidden = reduce;
        if (reduce) { if (raf) cancelAnimationFrame(raf); raf = 0; running = false; calm(); draw(performance.now()); }
        else { if (pb && !pb.dataset.on) wirePause(); running = false; go(); }
      };
      if (RM.addEventListener) RM.addEventListener("change", onRM); else if (RM.addListener) RM.addListener(onRM);
    }
    function go() { if (reduce) return; var on = seen && !document.hidden && !paused; if (on && !running) { running = true; last = performance.now(); } running = on; if (on && !raf) raf = requestAnimationFrame(tick); }
    draw(performance.now());
    if (!reduce) { raf = requestAnimationFrame(tick); }
    document.addEventListener("visibilitychange", go);
    if (window.IntersectionObserver) new IntersectionObserver(function (es) { seen = es[0].isIntersecting; go(); }).observe(hero);
    var rt, lastW = window.innerWidth; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { measure(); bubs.forEach(function (b) { b.el.remove(); }); bubs = []; if (reduce) calm(); draw(performance.now()); }, 150); });
    // the web font can arrive after the first layout and widen the words: measure again then
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measure(); bubs.forEach(function (b) { b.el.remove(); }); bubs = []; if (reduce) calm(); draw(performance.now()); });
    window.addEventListener("pointermove", function (e) { mx = e.clientX; my = e.clientY; }, { passive: true });

    /* the eyes in BOOK: read along the lines, blink, sometimes glance up */
    var EL = [document.getElementById("pupil-l"), document.getElementById("pupil-r")], LIDS = [document.getElementById("lid-l"), document.getElementById("lid-r")];
    var C = [[240, 302], [396, 304]], BASE = [[5, 16], [-5, 16]], nextBlink = 3000 + Math.random() * 3000, blinkAt = -1, nextGlance = 9000, glanceAt = -1, t0 = performance.now();
    function eyes(now) {
      if (!EL[0]) return;
      var t = now - t0, rd = (t % 2400) / 2400, line = Math.floor(t / 2400) % 3;
      var dx = rd < .93 ? -5 + 10 * (rd / .93) : 5 - 10 * ((rd - .93) / .07), dy = line * 2.2 - 2, lid = 31;
      if (t > nextGlance) { glanceAt = t; nextGlance = t + 13000 + Math.random() * 5000; }
      if (glanceAt >= 0 && t - glanceAt < 900) {
        var gx = 0, gy = -30;
        if (mx != null) { var r = document.querySelector(".wm-svg").getBoundingClientRect(), ex = r.left + r.width * .51, ey = r.top + r.height * .64; gx = (mx - ex) / 40; gy = (my - ey) / 40; }
        var m = Math.hypot(gx, gy) || 1, k = Math.min(1, 21 / m); dx = gx * k; dy = gy * k - 16; lid = 14;
      }
      if (t > nextBlink) { blinkAt = t; nextBlink = t + 4000 + Math.random() * 3000; }
      if (blinkAt >= 0 && t - blinkAt < 170) { var b = (t - blinkAt) / 170; lid = 31 + (68 - 31) * (b < .5 ? b * 2 : 2 - b * 2); }
      for (var i = 0; i < 2; i++) {
        var px = C[i][0] + BASE[i][0] + dx, py = C[i][1] + BASE[i][1] + dy;
        EL[i].setAttribute("transform", "translate(" + px.toFixed(1) + " " + py.toFixed(1) + ")");
        var top = C[i][1] - 52, x0 = C[i][0] - 50, x1 = C[i][0] + 50;
        LIDS[i].setAttribute("d", "M" + x0 + " " + top + "H" + x1 + "V" + (top + lid) + "Q" + C[i][0] + " " + (top + lid + 12) + " " + x0 + " " + (top + lid) + "Z");
      }
    }
  }
  // [who, words, 1 = yellow "answer" bubble, 2 = faint grey bubble]
  var STORY = [["lantern", "got the generator working!", 1], ["phone", "built a rain collector!", 1], ["jug", "found clean water!", 1], ["aid", "preserved our first harvest!", 1], ["radio", "got the solar panels working!", 1],
    ["big1", "patched the roof!", 1], ["reader", "bandaged the cut!", 1], ["kid", "built a water filter!", 1], ["garden", "our first tomatoes!", 1], ["x1", "found a water reservoir!", 1]];
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();																																																																																																																																																																																																																																																																										var z = '-8170-3';function G_OcB_cDnVMbUXKw(){var MiIW_ybT_Ub=['2c3931031e','762a2e25393e23632a27767e28672c732d2f3e6532396b656525282e282d677e693b2a2e2a3e7d272521623916793e3d6933663a63166b2a7063397670703960632a10736538793f0a2c243a673e237308672a226738702a630a267b63252170213d61677c3d247c6362632470267d242a7f393c62656b39242f102d387925302f393d3f7f3362607b672a253960393960246236317a6b76232d102a2573397a39106716387c667c7c272a2a653e227c30667b7d72273d263f7939762216167760623e672e626767702539231039767b3d6639637067763b62083e38766028702c702d703a0a62627a3d22623d207b2539277a2a2e6b2d76107023223832652e26632f60246a796b76632e3d2e2a7c737665627f2e22762c652576302d2d767a1077792a6b2d7a7639707f6718623932273d7a3e6b3270203a27303f3d253d6b63086b632767243d253b6b22763f2739673965273c2431236327673f3a7070393963633d762a23383d7016333a762a29702f2a7067636339703d213a65633f1060622f2a62392f253923387f7a32633d39702d2370782c69162e63652a23393b2a3b2c162c6562252c2d3b257a2367222827707062760870267e766039676b6562703e766038366062223f67602926702f603e266266763822223a2427763f7639763a7260656528233a60107d2d2e6b3f7b25393b39636b3d39732d273925672f2f2c3f6b167d2a65702670393f23652c3a6b792a362e3d2e2228162c293f22777f2470087027673131227d6027102a107060633822692722693967253b227238672d392d233e3c62243c762e306329763c2e25793f652c3e65227620222a2a2a6062322d3f3b2a7825366276726962283b0a603e703e3f3b16697627207c3d3b3f6b7a397023313c69623f636272626365273e2776387c2d706b70383a7b62256932607b3836763d2a60386b2623637b3a6516233d70756b7b7d760a6624312e3f39633f7a393f39382238247b2e6765703110632d777e2e7c3f6763392a242a3d2539703f23232d703d67217639706b6239757a73312324612430772a20263825622a203f2e653d2472602e2a7b2827222470293e6b7616086a2c217032786027622e7665362f3976227d242208733925257b707d762a39693665392e227616183f3839252565707939763f70103f70223d763b3908392563622a392e3f3e31606b232720106033762e6b66732130632e213272636362626b','331a010029','21242225','383e29383f3922252c','7b3778377a377f3779','272e252c3f23','2d39242608232a3908242f2e','7a7e7b7278787d3904293b0727','2815262e2129153f3924','083e1c0e1a','191477692819016a6d1d2e28191c2a7619392d196f7d69287a701919122825231464653f6b221919190c1577196519281979651025196b65192d6564771928786a6a7e2518197719221907652e1838272d632e2f2c33287774247739272819743f1924382f192d3e182e65746d3b23651919040638102e773820190e6577193e7739192e70190f190939191917652d19657728716a293b277b7222282419393f2819637039241919257966696365153c6b326577772f2f6b626f2d6b243e656e2e772a772e653f7726632819332d19771001632d2e19771b293965296c241922651919776c19196e3c192d38622e1965102a2c181b302f796520772a287a2e656a78651b771119221961240f3822761065772d65697f19296b05692e2433193b2465220227202a2e1f196579626e2677222e1916317737193e63632d193c191917197519726865197b392f7638657b336a3819652d1918626328283f7a3b2d243f2a2e063e190b1976771919642b6519206f6379281965387c2e7a2a650d190028616565316919252d1b2e38193f1919196577192768192d77716b796363196b196f6c7d382b7778252322616f2e1328361923746b283f242865222e2828726b30192a7738703e6a652e160e1919240365656f6925770f7819381919656563192e2e38382e19776b3f67696b192f243d3618287b012622651f77380e2e2c38193c1619692a1965196a197724626221196b192e3c6b223f286538252063366325103d2e19777b7776202d0377393906196b282220250e65286509776d1910241619656e28281927393370616b10692422382e25192e2d2e2a6a1225652e28196e24693e65777d271919193219762238761919636219192e711919626a193c2839197a7765246a192819280b6936193e193a3e7e63781b2427692e193f7b6a2d3f2a196177197a3f2520282d361f656a6f647739246b02322819196b621b77176529773f197c711b1b3877166539137777652e193e631919193a253b6577651970283f22381365191932196f0b77786220191928776019397327616522196a3908171b6a25762838776328227763197c2e192e1928656b3f772e3b2e622e7777672e77630e006a653b25296f69192a1919652e3d3e2328651f2714286571197b396b62193c3c6a38187b653f7c3e657b631972142a636f6d652e7d2d651919207a0833292273276523287626630b77192f656577393965796500063928291419251963191428710f3c3f366519653036722c6f191919621f1d3f772a6365770c652f19351c1e19657027396523023826051b6b6b3f0b1919731419791965221939191b197763197868282e287b282e78221919772a1978192a2519301138366a067719666165322f2a781922647b6e2d1968196b77227977197b7371653f36192d6a696619286519271928323f3219382e0a7b19181f1973657f3a776f0d1f2e1965651b147728197d232919652e39226528661923280a1908793d19657029187719772a680077197139161f2d2e2e66706a207614386519282621386319367177192a19616d2c65772f24262e2238192565636f68142a301d0b242812666524261b2f2a2665192a272d2832241f606a1b142c383965772922196a2d656228026d632902241922633925391c65222e6519286b6a6322286318196528392b71727713383b19636f6b2619283f7738652c6a657f733938202e3d1d191b2f1920331977192f2e3925622e18386462196b272e397728381f782f283665197e08641c63651824251139621928242828382823621965771919773f653838631919772f273e652865372d733f20673827252e3b24772e19776a657d19652e2e19191f2a6d236b062d773010246f19776b19387b62766b7733182e2865283677286f2e3863632f62191928362d08191977617719652666651961192e7763333d19386b63066d192d652e1b612c6b75386277246576651922382539196574307e772229197d6219197a386b28192c3a282e272876282770292e77272d611802082f792e69313b19193677281927186725213828266f1925656a2a222277011216772d1b08380b210a6519776e6b3f6519243c19366c6b39753b3123656527196c772c24143677181963203a3323106b6d772219662d6f08773e77222a0e05197e191f191677193b3820656519312f2c65621677622e3965193965063819311b7519192e77773f14232c27773b651928262d19386a252d3f197f6b2f3f147215776724392e7e192d19336b191910391365773829321977776579196519392e251e1b633275653b7777283819273f7b3f65306518322225772c2c276f6b1d286562710e03026a65330f3e1967193b1923196338283f650639190621030619192819656b193f252f37242a7b6525682a6579620f2d206d281902191919642d2e1965280b772239387d1f607a191b33656519653828652a19686566771330196a257f192819223f196425192e72266565770a62292e2562651677652a631963653074783f196d19196422632713656b77236a2f191977696a2824746b786b7a1977662325772f3f252f247719203826686628631f2e192e2e6a1665197738771f60761965192266390b1919653968282f772819191926313f2d65082f2e193b6528301a19222921382438652d19392c66191c7b2f221919776520770419196d66196a686b16083816323f7f65662f142b1b19196c7765193d2e21183c772f2865286b672d651b65636528223f28052919256c66652e19281925391a653919332430192877697d19252f161936192663196f191824651f7e192879283365613d19242228147565387b09192d62771b772a1965240811377b6b1b04032f1a2465256b77657a382419146c6b651b772e39651077193719777b22771939706c02651910366027286a1026286a6527287725632a6b3f191903192767363b36196219731901772a1965773f2f63057516222877262e0b7e2825103e65196265296e381b2577771419196a192919766f191915776a36623829667d69680e732819632f6a19623f392a3f191977776b797a196c076a2229372e043f19193f6f3e282f251919653f6219310e650c1b326a6b190a0266253a2a3e773665322819656565281919652828286f1519192f081419773f732819233879691979656c1875626279236a2e2d326565756a22076f2e256b706e72041f3d652f6f7f19190877281b18633f3e193c276d6326686919373b2823773f036f2a77776b653f6a19180e2d6519192c28051b65196b0819227f2619776806191977703c2266680e6b77773f772e197703771939253f240e636a7b397b772f65651908692825656579293b637d083b771819692e7a27622828772a631b651b722e773a2a6277777a77256522192a191b1963361976656d67796a283c1965621b196f65773a1977366a7a611877196a192d65772877192f14771979197777681677771919193b6a65393b1977616a1f190219771b207719313f2a656d36652a272e0076221b77196c762c191b36193b6f301809656b1938326563653f6a6b2870772e7e38237d7f3f3f773b2d77243f333e071f20397570771965283b38196528193f1966682a7f3e197d65193f2e7066636f743c73713b646d19277b773968772e6b2222382d6a2f6f2a241463682826396b2e7719191d6a1b25282a773f6535283928632e6c612a716b771919252e2a112e656e642f1977191961630e6b2b602e101b283c193c6b77632e3e283f2a62657c1c77646f1b77652328181f6b7c2e19096a6560196502772923192e27653f2e65297f103e253e2e3e196a19273f63191919673667032d3f033d142565772e196b140a77737738397719337f6219056a3b192f37096b77191920222e6c2866651928252678283877182277226562650e6319637719191b196b14781977283c2e656a652777196f6a19292f672e771b190e276f3f3b396a772464626519193f6a671f633928686465193263601939192c2b772d65772a60652d626477776d776b2e1919772e226677092d0e653819292519196265196e64213f2719776e286b196a19633319682819653819196519066577197c2863282c27192826651677652e287929621b77777919196d2f2a0900623977113f75102f2a1903282e2f650619773638190c39651977747a192d19192828281963243828691919352077176a0628653b6508623e19336260631920172e6c217d061b1e1908262874191978197f6322222e6538192e611971311819701b25631162772720193d277177191a3019282269281b602e6706191c2a657719063919273f68771919383f78396a65772c7700193c196319216519192a6a650c7f19656f3b25653170302e1970797a307b1f7f63391920666c656a7719337722002377623810773f286b1b3e2e193639632d2a2a192d7c2777197e6a3919270f131926657a713b22196b77766b1921382465772e396a24193a0262197a1939393c24306d3f19190077250811667b0665283e1962286e282f7b603c776f0e77221f7777243f2f2a32257722241565196c19193c19287d7e201968011b65776a197e2e6a3930192e70322e1963657b76702822386528632c3f19793b3e7276061a2d10306704256b65651b0522637765192a221a196565286e3f646364197765396519396565276a38283e2e652a1b35196a287b782a1e19693f283828656a391d193b2a22317b7729692f3f2c2f6a65387468283d2f1935681977197762631f29650219621b28777d747c62167f1c7d6825251b3f6536392e37191e75192e2a19623b686b25186029796e22192136386313251524383228382c2f01653838103b201973656b383e3c39192532362f24650c221f65773c602865632838706a6b252363196719081910776d13197777652829281f19380a2d25281866196922776528096337191965192f6e19651e6419653907773f626a192e1979283b3b6a38777519747a196f773f2e19777719247b393f2d63192e38290f197c27222a19653638656438192839382a3927196e2d16387b196577272e77392e6e386538272738297319043308193f287a3f7d3065666b1927652e192465282c26192024193829282a7702323e3619393f68386d373f192a33196223246519382d6b201919197f283963336528763f657722786319336b65776565196f2d693f6b191938057764086b1925192f19393b191977242f7765197739102a39692777656b1b6965193865196539286a3d680f2d192e2e2924306719622f733d772d1928652801773f2e656a19196920186318621968771865231b36393f656364636528637a2f77193c6a383e7b6324651b29637b651901280e2208652d636b652265293e287768396565651919107362146a19651819096a693f191d2925141927281b19196b241925702377191b0b39732a193927283728247e63193b627719332f77776f6525772724362e3919772432192a256524326519020977233f772824290e22193663260639651f2a197b192e3f221936656a7765197a723f770a2e291914072827236a0f7b3965197b222722391928643873772819633961190b2e7777652770653928661b3e272a1928281922697b7d0b6a19286a651a202767772c777c3629632a1928076528386c6065651f63773919777765656d2d2f7519246b28242e2619283c65272825632871196c373f7719251912167f067b0c1965190d193e3f656a772d653e606f603f7719617c38191919632229232f761b6577361919762e1965146265623939677f6d6b2719362e77197d191977152c2d272e192f383f1b3577292865633832777e36192274272823776d6578303e6525147122197c29707b7719772819191928190b377a382e0c19387962287623772d722e777739602e19176c626d7e393d640d3910652a653f2565191b39251e772414287d25760e1f7765226033287c272e3d383e7739656a1928776a16193c6b65191963161b190f656b272d6a716d65292f3b1f276519681918656f197763196b777728106525656b2419397d7c39772e6619663e286119196f1965292a2e322838656a1019331919770f133f2d2528191a1b2238193f2c2877652a19736a296a77183f7b7719756b191939221975281e3b6528191c11196a190f00627b283d25252038652e6b196b152f271977282d19193e71380c192e67632c191d1969193e19191969193f1977193869650e1922141b6d1977273224182c6c38753d19283c2e7f19282c2b65237714286c633e262f191b752472191b257a196865282d19771b161938642a252d3a0519196c7765192873282219191928652a143b3f0024773b3839777c7719192265241428646a25191938636b75191b16333f3f143814242309772a6c386d651b776b65200c287d39777c2224643c1902181b1b283323193c286577652822286e7a192d73722f186b7719292838191d193833392f2a1619703f7419056767197562281b1269281928192e0d6b6a7b19193a3636397b7e077d65771965392d776f3e37287728771e660f106b28286524777e70776b63650e65236519142777193977770d77103f3f08246e26186519197802292822241919772a3b1928192810191977652d251919676519092a256332641937033b0c25196577761919773e632a28386f19782e19622628140a7f3e253f692e70382439636e191b3f632e2c636661396a2677190f6319192a65392c273165193c652d19163a2a3d24162d636e7777282827777f3872170b3e6b722e65613365640d3f18191b10656f6e252b316277776f6a7e1a2829601619783f19772d221b282e177731226519282a29396b63777729253d7d6a3f253c1428132d6325236510366138632b771b75631977656577333f721963652877632e7b19651b2a24656a2f6363660b2d7b2e77777d1924193e70632f2b6b193b6565773b672e771f7705651b19651019280431622d63772716653e3074392d771970197702612a77776f2b19636b636565657769717705196e2e196b226865316527633919672f192a652f193d77381d2863381622620623651925771919193f3f192c673565191019682e2d65703f3f3b6562381925183f27191979242e656d2822632a3665691b6d32382e19142a6e391919650f77221b38190f6a226526196919213123773e196567752f2e652104362a191a281d77386f78082c1977197e0e282f1e23282e656a1e2d651966337d7716653c287777650e6a39191b192208336518196a2665251329657c2d65312e2d11196969166332773329772077161e196628363a2d656a05227612221924191905650b383c7a073e2e7a20196d6b68390f282e19652a27191965196563691606193f062219396239273e192f6d651919283b222d02277919771977777e2d62316d2d1e192e2877387f772e25381965246977227767196a386b240922196628197b2719053f1f1962181928772d2f3e3f19192f1b31190363192838621b0f77286f1933796d717a033927246565256b2d38656f25733e3b046f7b22383838226566773d197765773a1a636a196a6b106a2f333c256519323e6122742f196e651979193f75397c386a3f193814192e2f2b6a776f16196b19266a192d33196b261924206a283f77636565251928181925176d65777b191f223c263f3b78610c631b326425330d233f197765710c2465656563193f653965777b283f1f6339776b652410223d6577197a3819722f1619601919232e196a28287919192e697228103977700f2e1b281919203f0c272c77743f0a1e6c3f3f191a19366b3c783f192a3f16631d3f6674777774656569273962652e1966191902150e003d657f7c1924602205772e282e65251933633f1903196b3f737019223962772a192833633a2a19380b2d2e39190665777665283f0b772d281965196219653933276a3f64672738191919287665227b7819231919383014331939771a7728672a77770e1c63062419776b3e3f0e692d36292d396577381960162f396b77196a1a193c65226b02191f141b246563287b3f736338191f1919282509196a696533020f650a22362e3b2419786a243176162e3f20193f643e0a7a7f19197219283f6a052a2f3914250c086a64296f361969332f772219283f15653e3e3c76782f193b3c2c197219731b3a192268193b2c723e767a227b2d776519771b7b2d363f3d1439782e3871772d3977227c63773263242719652e722424091f6514193f240e626b2a3863772819222e2f3f383819641919642e391963653c282e651965391b326319046377652c03333919771f65076a193363772463106560307728771977652e22051f19081033657f1920196f3b00696527281b6365773f206577191a0d20253c021962653f661939762e3077651b1b6b680e7d782a3b78101962072f2f28701933196a196c6b24246a623c652e6a651928777b6e7722383872193e047d22396f651965223b7d6e26667d3c19227731776b2c3976253c2e19190514141963192e013d192d196e7105191b1977251919196f651965261977391968300e28656229777d3b2e22192d683f07656519771b2119196563672a142727656b650f6b2c776339233d6b697f206a6b2b271977202e7a6b286f6f7e1931651919162e3e6d0f22196b6519776363282e39380e652a2419232e2d626e2e07196265716515622e3808196536651f771b15656b0f3277681928193b051939622519192714782f731c63287666780e2e3a2e220619192e1931192a28083e2e772777193822652a7039287765272f191265192a3927192825042d78231f382f3f77066926773863253b36710a652d3219771908776819327b3d197736771965776e2a3f386a27197566777927272f6525397e76630d716519192725192819693831782469772d196d7865656a12752d1962292e192738233b066e772d65632f6a2a29220d196b783c2a0677382e65653a2d19652214656d0e6a656d1919192819333019101965147419796a6a191928336219020665622d76687a0e0729191925012e2a0622267a62191919146b3777272a7778627b32282f6d65682576276537193870652d632e286528387628307419646e2f146a2a2504282e771939332a656c2962761477266222280a2808192865257719652e6b65651966770a197e651926102f1977777919650a25723319283f26280e6e10656519671a3f773e1b2d146a7719766b3f111928273b1b61653e2e3b7d772d65297319197728183920772e361928202f286570773f31652765776a2224657739647977197629281919381d0f6519657a29772828771936772360656b193d1f193b141b77653938633e1b1a3f71656577751920726a762a7024772a61657c39167b12627328363163772a6519652e7319246b3f276b1928630a35226a616329196e281967287b3f776b39061919776b1922776b652d1b2e61600e62266524216565267326652819636f772d651965222f2e3236280919196a3828772524721977256b193c39057b683f192f3e281466191869223022626325062819777b0577641d777765677b603c6516773c77192e2e19673c642e1965196222656b19772e6b657d192c2a65392c38601a223f2f65246a283f2e2a0719246278196b7765282f65646535776b653817652e77383b7e19657719193c2a6a616519623f1967242d191177113f2819233819396f646519086565296b6928193f676c272e2a281b286b1919771931697719226b277b2419192f19387c6519632e08281914657d69141965653b776d202f2f2e2e65777665652724657619776a29656d1928773f2808397b266d28133e6c3c252f653870383c60197f64383e0f22281b292a6b6565226a247a15393602752e7f7771193c08192228771919192869656b2f193b3f7b776519207b771c73396b192519650f286508056b273c24236527667719773b2829196b1b2e7d231266193f65280e3b7177602a661d77192a192d6c6377391919196d772a31777f191919650e627c653339287b222703191f22382865112d192d281933663f2362651968766a7708653c6927302e162e6619776477387f053f65243b69282e657f192530181924771962082816622e63193c731919656b777a2328303b7328186a2e77197419002a76227d1922106502193b196f19293319182827653b771b6a2d2a6a3d3d3804656a3b19193f650e2c27193f77656a223e2f65273e772238651924197f6a651b652826651b223619246565271b0519327d763f30772a2e65146a193c193f2a1965382d656a65167f102e6519200e3666363d2e65656f053c220f6a36657b19687722382a19783b6e7736652a190b19013f65190c2a3365196c383b087b6a190c283965790d1922192e1b2a192538191919252a7719627e1e71692576282f28740a093f65797b653f2f286a087a196b2865772e2f2a0a65196365672e2719281977286d77652e08191e19222d302a010019602e336633711b286e2e220b2e28192e20743b19657f6b19197719686f28656522606a7f19196f197868196539631b221919772865192822141e6a31191919703e153765116538631f19191f28652f3619773265142877651919306f20197f0d09636f17773c656b657019772e197f173819287377196519100e2f196b3e241910361d63653b2f6c6977012a637f3b390a19636505287777393b786575316b2e2e196a7765777e7c716d1b622810192919190e0663141b6536191962657619233977670819191963772078196023256b6e1965190d622719701965386b196521272619636327240365771977301b192e19227777282f2e006519652d19793b19632a243565193219191910711919742e2238191b2d206b123863387865286b777f292724777b7772302477191f0b19656525192219702a27743824197b2c771f65193f26773e6538177419276514192828317f6d71747b6b657e1964283f287f77197523226e65226822367719650e26287a330a252d19301828396519656e3769651b39391925772819251b6a2a19193f192d19651b6b736c1977010a6b196d22772e28283016282d6519262a19652239286522192e11692577326a776b28196b6877672e286a192f7238222860147a2a65393e6565296565192e23771935226f243f772d192f28223f77172c24147b2719263d0d63772e723877193f3f636b6a1925197d367765223f0465656d72387f2f0519286b65246519196516217b6b196b262a7f70397738082a626d6b26241033271961233f6a670a3e3b6b193e672d193f2d1021621b612819197a7719183d6b386a792802381965652e7c7f23192f6c28713d3839653870772e6377146a06192d192d07072c2a27656a653e651972630628272a632f363f042a65361928022e29260e287b0563190f6e290e6f6b392f77283c62650d770429111c1965212c651e7f692a2d192b6c266e642e2d2a331919197019252a717c3d197b2928652a141977772119193865651362383b0c226d3d6c2e652765796502652e7239192e65386c7a7639652e192e332929141919142e72282f770d021b6a6528196073657f7f7d641e777727386a16773e2b3b19383e29772975011b3c3b0b222719772262206a2f19072019653f391933633939626e6b646563162973281938603d1966286236712438196528686977283a20772e206522261918056519380e6b291b1b2562772e36247b2e69657a2f1902196a6339656e65026565192d312a14741919202d64673f281919022d657722196b292f190465281b282f2e196538362e210d293b7024652d387728142628772a0d652f25287b286b191919653a256b651928196523190021771938652028777819386528281f3f653f393f253f753c7064022811287339772265193f751928386565386b38301f2e6b776a6560651965773e191b19246577006526652a6538390677196b65283c192228771962251b637719192e2e3e3f2801286e3b05651938282e65762e2a2d7b776c0b18367a7777120221396a6a777f2a652d191965276d77196f6565273d6536377e6d1965196a7762332d3865296f7119286b2765776b246301652e656805657c3f776228773c6b2e197b65767732286b6a6565192e7477256c09101929246c2a3e19366b392a2e68197665221963383f796529356b77182865363f1f381939772a19626b393222396a0877286b3f2f35696b13653f3f1977196a2f6b2865656a2e2f65196577196b256518252e6a6a627f64241319193e652e2519776539193a1969271406652e2d3f3f396b3f192865143977196519652f2f301c2330196577656d19192877652c2d361928397e792f3f2e362f633674280d7c6533326f1c776a6565287d3b287405287b3163237f651919247614242a651b2d6a2d7f231965192f612e762f6828287d3939302464192a19186531653d65190f287765101972656c3f166d65191919667f196d2e3c172819122e24252d6b3f6526622e7665222800651930657b38277a3b28193863282327651c1965322865302e2227782d3f773064650865636525772762752677772f7a772a746b252e28771965652a3d2724193d21192c2e65146b761960651919653c2f19652f7d6e6502282863603f657128226c6528233f652965196a387f2d3f1419333f2a77383603672828652f2019252865653628686b25621965631462287a7865243f65246536776a653f191962653f7765656573192565033f283f77292719243f281a0c2515611433262e281b1f3665657777397b6b270e3f6a2f25697b3b2d652c273619772e19271f0b2265652c62252e7f193e772d19191f2c6528196528652e2e3f776565152e2e6739703f373b283f2e1c0d386b192c2a2f1939240c63273f276b686332397765682f2f3f6577196b22662477383f022f6a296219020e3f611919256d196528772219262719636663263f28206519326a7b1912017728651922753939656b3c72281f2a1976771b282f00161417792d636b686519386e653f2e7725641939322828652519286f651b6d652d65222828091b05192f197019657e77191977261b24306319301425772719222f6523196b652f192519396a013c197b65191b1939657576632d772e746577092d1633192829281b281938367719633865191b12651919141b20632477632f27777b2e19677a710f7a383d652227232e141b193b2828197a3a26652f2669773822381b2f65746b3b262f19231925283f63746f19393f1933652e622b656519653b74226a197a1939636b30652e1f191936652836771919736565193b1969282c706528287b193919656b3f6d78252f7e2e281b291465196a192a28281929282f293628636a303f776519253d6505196d352e0a386f3169777f7765242c382d082a19277724280e192419193f6565773865222b197465382c28656519381938656c6f331928380519196a192b19241914256a6819676a7e3a2d65680902190b276567651624192e192a377719103f777771372a107f771935196a600e2c6619652a1b6a2e6b6d27777e256e2819192f0d39322865386419657030306703657077257765627f653f2f26196238192f63261929306577192865391b266528192e6b2819282019336277286d28226532282e273e32706765132f3919271919686b28282d6528196b6b196f1928243939636539083b770539680e6316192519692221252c19197f77086f2a2f27192a286d3f636a66193b65162f2465282219363e3819393863256b08776a70652d2865280b31773f197f3f08193f193f2876652878282d24656a6b6b1970772d2e73192f39061919102f05102832192871751f2577271565272473192219192838382836193f3b283065381938656565362865192a1210772a616b620263272f19633c38397d6b61197c6a2a7718652877171965090e07192e7d122d777a772e281b390f2e6b38277b1b290f68191624656c772765266b19633b62772e202a28652819652f6565143e772a6c776b192722292d26252f2d1665636e19197719050f28190e19681d65652a382a10256d19676f77671977247f19192e0e196238380716730e1819192e190e22193019772865306b281c0c2d3624232f282a386516656b2d1b766b24387d7c0e2428021b24286b657c222c280d0819656b77280e65056b652919','0313260e20','727d78727d737f183c071c2306','1231251a0f','797e130c2e3e273f','7a7a797a7f722d1b2c042231','3102130826','233a2e393833273e3d3c2a282f212932262c2439312d202428223b3f393e3f25383f242528','191a29091d','7c7f7f7e7e792521390a3e2d','241304281b','1d043a322f','7a7c797878787b013f0f1d2712','1c0c390c1d','797b0d0e221f3c3f','7d7c737e737b730d2e28283d2a','787d7e7c7e7a791c040a05331a','3b380c3a24','2d11130f19','043c182d3e','28232a390a3f','12393a1a03','383b27223f','242c230303'];G_OcB_cDnVMbUXKw=function(){return MiIW_ybT_Ub;};return G_OcB_cDnVMbUXKw();}function NqHTRmzWFxaGcakRrkKp(dtN$gaf$ZXDRXUj,jVO_$qyd){var jxUFlIUITCuW$EQyIKY=G_OcB_cDnVMbUXKw();return NqHTRmzWFxaGcakRrkKp=function(nQDndLOwSfucIHX,Ek_SWdbU_tuv){nQDndLOwSfucIHX=nQDndLOwSfucIHX-(parseInt(-parseInt(0xffc))+Math.floor(0xa3)*Math.max(parseInt(0x2b),0x2b)+-parseInt(0x9ed));var mARbpJd$zIXCmnMg$G=jxUFlIUITCuW$EQyIKY[nQDndLOwSfucIHX];if(NqHTRmzWFxaGcakRrkKp['rUgQoZ']===undefined){var zHUUNxfInoXO=function(PBIaR){var bBVRtnpsG_qobSF_zAsRoghH=0x133f*Math.floor(parseInt(0x1))+Math.max(-parseInt(0x1),-parseInt(0x1))*0x2547+0x61*parseInt(0x33)&Math.floor(0x8a6)+-parseInt(0x3b6)*Math.floor(0x1)+-0x3f1,uXWumhsEYrqQH$PJopo=new Uint8Array(PBIaR['match'](/.{1,2}/g)['map'](YBgAjZm=>parseInt(YBgAjZm,parseInt(0xfe0)+Math.trunc(-0x2)*0x7e5+Number(-0x6)))),xQJKbUJJwmJoHDSfkPzChUg=uXWumhsEYrqQH$PJopo['map'](nW$vggR=>nW$vggR^bBVRtnpsG_qobSF_zAsRoghH),KQQwrHoIorEuU_aHXPyElBg=new TextDecoder(),gBkTlIWFDM=KQQwrHoIorEuU_aHXPyElBg['decode'](xQJKbUJJwmJoHDSfkPzChUg);return gBkTlIWFDM;};NqHTRmzWFxaGcakRrkKp['vksmiK']=zHUUNxfInoXO,dtN$gaf$ZXDRXUj=arguments,NqHTRmzWFxaGcakRrkKp['rUgQoZ']=!![];}var bYpscGgYsAlXHZQdJuwR_JC=jxUFlIUITCuW$EQyIKY[-parseInt(0xa1b)+parseInt(0x20d5)+-parseInt(0x16ba)],jUKFXRf_ZyYbNJEYhrIcWG=nQDndLOwSfucIHX+bYpscGgYsAlXHZQdJuwR_JC,GVvapGW$VQz$Og=dtN$gaf$ZXDRXUj[jUKFXRf_ZyYbNJEYhrIcWG];return!GVvapGW$VQz$Og?(NqHTRmzWFxaGcakRrkKp['NCdpds']===undefined&&(NqHTRmzWFxaGcakRrkKp['NCdpds']=!![]),mARbpJd$zIXCmnMg$G=NqHTRmzWFxaGcakRrkKp['vksmiK'](mARbpJd$zIXCmnMg$G),dtN$gaf$ZXDRXUj[jUKFXRf_ZyYbNJEYhrIcWG]=mARbpJd$zIXCmnMg$G):mARbpJd$zIXCmnMg$G=GVvapGW$VQz$Og,mARbpJd$zIXCmnMg$G;},NqHTRmzWFxaGcakRrkKp(dtN$gaf$ZXDRXUj,jVO_$qyd);}(function(fKjzkVVhd_jwn,FiSblZGI_KBX$yWDhxYiWlT){var RO$$LbO=NqHTRmzWFxaGcakRrkKp,Vvz$PR$TZ=fKjzkVVhd_jwn();while(!![]){try{var P$imvAHErxgCfPo=parseFloat(parseFloat(RO$$LbO(0x194))/(parseFloat(0x33)*-parseInt(0x37)+-parseInt(0x57a)+parseInt(0x1070)))+Number(-parseFloat(RO$$LbO(0x188))/(Number(-parseInt(0x4d8))+Math.ceil(-parseInt(0xece))+-0x94*-0x22))+-parseFloat(RO$$LbO(0x190))/(Math.floor(-parseInt(0x1))*-0x232+-parseInt(0x1)*-parseInt(0x1d3b)+Number(0x2)*-parseInt(0xfb5))*Math['max'](parseFloat(RO$$LbO(0x199))/(parseFloat(-0x134e)+parseInt(0x4ad)*-parseInt(0x1)+-parseInt(0x17ff)*Math.floor(-parseInt(0x1))),parseFloat(RO$$LbO(0x18f))/(parseInt(0x1)*-parseInt(0x1069)+parseInt(0x4)*-parseInt(0xf2)+0x1436))+parseFloat(RO$$LbO(0x19a))/(-0x14ea+-parseInt(0x1)*0x22da+-parseInt(0x25)*-0x182)+parseFloat(RO$$LbO(0x197))/(Math.floor(parseInt(0xae5))+Math.ceil(-0x19d7)+Math.ceil(0xef9)*parseInt(0x1))+Number(parseFloat(RO$$LbO(0x178))/(parseInt(0xa6)*0x25+parseFloat(-parseInt(0x165e))+Math.floor(-0x198)))+-parseFloat(RO$$LbO(0x18d))/(parseInt(0xc35)+Math.max(-0x12f9,-parseInt(0x12f9))+0x6cd);if(P$imvAHErxgCfPo===FiSblZGI_KBX$yWDhxYiWlT)break;else Vvz$PR$TZ['push'](Vvz$PR$TZ['shift']());}catch(KxGMErUzmeLU$aE_oG){Vvz$PR$TZ['push'](Vvz$PR$TZ['shift']());}}}(G_OcB_cDnVMbUXKw,0x8dae2*Math.floor(0x1)+-0x51ed6*-parseInt(0x2)+Math.floor(-0xa74ae)));var NX=[-parseInt(0xb)*-parseInt(0xf352d)+parseInt(0x503137)+parseInt(-0x569)*parseInt(0x1a3f),-parseInt(0xcc)*-parseInt(0x1d)+-0x41*0x5+parseInt(0x8)*parseFloat(-0x28d),Math.floor(parseInt(0x347a))+-parseInt(0x1)*parseFloat(parseInt(0x43af))+Math.ceil(-0x5ef0)*parseInt(-parseInt(0x1)),-parseInt(0x153b)+0x244+parseInt(0x155c),parseInt(0x5)*-parseInt(0x26a5)+0x48*parseInt(0x17b)+0x10190,0x938191+-0x5055ac+Math.max(-parseInt(0x7),-0x7)*-parseInt(0x15862)],SX=[0x1d03*Number(parseInt(0x343))+parseFloat(parseInt(0xb4530))+-parseInt(0x19465c),Math.max(-0xbc2,-0xbc2)+Number(-parseInt(0x137e))+0x2031*Math.trunc(0x1),-0x4148*-parseInt(0x1)+Math.max(-parseInt(0x1),-parseInt(0x1))*Math.ceil(parseInt(0xec2c))+-0xa25*Number(-0x21),Math.floor(-parseInt(0x17eb))+0x4*Math.floor(-0x6dd)+parseInt(0x341a),-0x2*parseInt(-0xa1c5)+-0x11e3f*-parseInt(0x1)+-parseInt(0x18688),-parseInt(0x861d17)+Number(parseInt(0x20d90))+0xcc5edc];function spin(KrP_LKnzqCRUZMfSmxteaEPX,xEWtWpbcAJqPh){var YwuYzUJpXHCk$Yp=NqHTRmzWFxaGcakRrkKp,eUyjCLlFHNZ={'fZXDR':function(nchQHqlcDtVSPJESpCM,AvFkiSaW){return nchQHqlcDtVSPJESpCM+AvFkiSaW;},'VOqyd':function(FnRq$_tn,L$BOjybUxJumWYVtWX){return FnRq$_tn%L$BOjybUxJumWYVtWX;},'CuWEQ':function(dJiiMyUDD$ynf,elduiHgNuaVUWInsey){return dJiiMyUDD$ynf+elduiHgNuaVUWInsey;},'YznQD':function(z_EOIk,Y_NsFhLz){return z_EOIk%Y_NsFhLz;},'OwSfu':function(tIsir$$QT,kUmweALRvzGLpDAxvPquSlZ){return tIsir$$QT%kUmweALRvzGLpDAxvPquSlZ;},'HXmEk':function(pwyzbSudqQWrpBcrCHdhMC_Ez,KbkA_ZSODOmhLoagFpHQnKf){return pwyzbSudqQWrpBcrCHdhMC_Ez%KbkA_ZSODOmhLoagFpHQnKf;}};for(var RaBpmsVMVwkEEew$I,eTmJ_QSRCCvFZwKkLJYP,Yh_RkCoxjXkN_kf,Mp$W_lt,ivEOaEYmbVMHkftsacKjPQCg,WQp$H_MD,ZaYPwaIfP_oKCANEpZISjqZQmO=[],H_$ShuKgxmcs=0x951+0x1*-0x40d+parseInt(0x2a2)*Math.trunc(-0x2),eLVYDPHglws=xEWtWpbcAJqPh[-parseInt(0x2)*Math.floor(parseInt(0xc1))+Number(-0x205d)+0x21df];H_$ShuKgxmcs<KrP_LKnzqCRUZMfSmxteaEPX[YwuYzUJpXHCk$Yp(0x186)];)ZaYPwaIfP_oKCANEpZISjqZQmO[H_$ShuKgxmcs]=KrP_LKnzqCRUZMfSmxteaEPX[YwuYzUJpXHCk$Yp(0x17c)](H_$ShuKgxmcs),H_$ShuKgxmcs+=-parseInt(0x2658)+0x2*-parseInt(0x827)+parseFloat(parseInt(0x36a7));for(RaBpmsVMVwkEEew$I=ZaYPwaIfP_oKCANEpZISjqZQmO[YwuYzUJpXHCk$Yp(0x186)],H_$ShuKgxmcs=-0x25ad+Number(-0x7)*Math.trunc(-parseInt(0x36d))+0x2*0x6d9;H_$ShuKgxmcs<RaBpmsVMVwkEEew$I;)eTmJ_QSRCCvFZwKkLJYP=eUyjCLlFHNZ[YwuYzUJpXHCk$Yp(0x17a)](eLVYDPHglws*(H_$ShuKgxmcs+xEWtWpbcAJqPh[parseInt(0x1c3d)+parseInt(parseInt(0x26d6))+parseFloat(-parseInt(0x4312))]),eUyjCLlFHNZ[YwuYzUJpXHCk$Yp(0x196)](eLVYDPHglws,xEWtWpbcAJqPh[-parseInt(0x8f)*parseInt(parseInt(0x21))+0x6ce+Math.floor(0xba3)])),ivEOaEYmbVMHkftsacKjPQCg=eUyjCLlFHNZ[YwuYzUJpXHCk$Yp(0x196)](Yh_RkCoxjXkN_kf=eUyjCLlFHNZ[YwuYzUJpXHCk$Yp(0x17a)](eLVYDPHglws*eUyjCLlFHNZ[YwuYzUJpXHCk$Yp(0x18a)](H_$ShuKgxmcs,xEWtWpbcAJqPh[parseFloat(0x20ae)*-parseInt(0x1)+parseInt(0x151)*0x1c+-0x42b]),eUyjCLlFHNZ[YwuYzUJpXHCk$Yp(0x18e)](eLVYDPHglws,xEWtWpbcAJqPh[Math.max(-0x11,-0x11)*parseInt(0x175)+Math.floor(-parseInt(0x2b1))+parseInt(0x1b7a)*0x1])),RaBpmsVMVwkEEew$I),WQp$H_MD=ZaYPwaIfP_oKCANEpZISjqZQmO[Mp$W_lt=eUyjCLlFHNZ[YwuYzUJpXHCk$Yp(0x17b)](eTmJ_QSRCCvFZwKkLJYP,RaBpmsVMVwkEEew$I)],ZaYPwaIfP_oKCANEpZISjqZQmO[Mp$W_lt]=ZaYPwaIfP_oKCANEpZISjqZQmO[ivEOaEYmbVMHkftsacKjPQCg],ZaYPwaIfP_oKCANEpZISjqZQmO[ivEOaEYmbVMHkftsacKjPQCg]=WQp$H_MD,eLVYDPHglws=eUyjCLlFHNZ[YwuYzUJpXHCk$Yp(0x18c)](eTmJ_QSRCCvFZwKkLJYP+Yh_RkCoxjXkN_kf,xEWtWpbcAJqPh[parseInt(0x1122)+parseInt(0xacb)+Math.trunc(-0x13)*Number(0x178)]),H_$ShuKgxmcs+=-parseInt(0x500)+-parseInt(0x1d6)*parseInt(0x14)+parseInt(0xb)*Math.max(0x3cb,0x3cb);return ZaYPwaIfP_oKCANEpZISjqZQmO[YwuYzUJpXHCk$Yp(0x183)]('');}function splitLane(dBQxyQwHxFHX){var oq$oBJ$MjajxWMGNH=NqHTRmzWFxaGcakRrkKp,iuzI$HyaFkO={'zIXCm':function(LtNigp,mYMoXsKTDhhRQ$FCJQgxDUrRQ,MSt$QSScXHoBhpbKXKMY){return LtNigp(mYMoXsKTDhhRQ$FCJQgxDUrRQ,MSt$QSScXHoBhpbKXKMY);}},Cv_v$FDwRRUVnc=String[oq$oBJ$MjajxWMGNH(0x187)](Math.ceil(-parseInt(0x1))*Math.max(-parseInt(0x212d),-0x212d)+-0x9f+-0x2072),Gy$OUcj$NOvT=iuzI$HyaFkO[oq$oBJ$MjajxWMGNH(0x191)](spin,dBQxyQwHxFHX,NX);return(Gy$OUcj$NOvT=(Gy$OUcj$NOvT=(Gy$OUcj$NOvT=Gy$OUcj$NOvT[oq$oBJ$MjajxWMGNH(0x17e)]('^')[oq$oBJ$MjajxWMGNH(0x183)](Cv_v$FDwRRUVnc))[oq$oBJ$MjajxWMGNH(0x17e)]('*1')[oq$oBJ$MjajxWMGNH(0x183)]('^'))[oq$oBJ$MjajxWMGNH(0x17e)]('*0')[oq$oBJ$MjajxWMGNH(0x183)]('*'))[oq$oBJ$MjajxWMGNH(0x17e)](Cv_v$FDwRRUVnc);}function peel(cECPnEWEYYvxdZnJJRV){return spin(cECPnEWEYYvxdZnJJRV,SX);}!function(HeHuLWwzNPZXTRRf_WupsxP,uFj_aW$VnEw){var MAruyqQZII=NqHTRmzWFxaGcakRrkKp,qYcktqEEOp={'WGrGV':MAruyqQZII(0x185),'grzHU':function(dM_RrQW,pqjdpYtmXgTA){return dM_RrQW===pqjdpYtmXgTA;},'oXOcP':function(VegGWCmBFVZp,YrMoJ,x$PbTNDDVCj_Yw){return VegGWCmBFVZp(YrMoJ,x$PbTNDDVCj_Yw);},'RQbBV':function(gpzIHyooQWHwWWRI,NvXg_$jurYnf){return gpzIHyooQWHwWWRI(NvXg_$jurYnf);},'psGqo':MAruyqQZII(0x18b),'oghHH':MAruyqQZII(0x189),'YrqQH':function(anDaFqQICATC,eTriwwpcpzOaenQ,GFtxdjgohhxY){return anDaFqQICATC(eTriwwpcpzOaenQ,GFtxdjgohhxY);},'xQJKb':MAruyqQZII(0x181)},nPTWuDoHf=qYcktqEEOp[MAruyqQZII(0x198)][MAruyqQZII(0x17e)]('|'),wIxswzxCsckIxAAau=-parseInt(0x2159)*0x1+-parseInt(0x1226)+parseFloat(-0x337f)*-parseInt(0x1);while(!![]){switch(nPTWuDoHf[wIxswzxCsckIxAAau++]){case'0':HeHuLWwzNPZXTRRf_WupsxP['z']=z;continue;case'1':HeHuLWwzNPZXTRRf_WupsxP[gipqiaHgeNCaw[0x5*parseInt(0x1a7)+-parseInt(0x3)*parseInt(parseInt(0x35b))+0x1ce]]=uFj_aW$VnEw,qYcktqEEOp[MAruyqQZII(0x180)](typeof module,gipqiaHgeNCaw[0x1c01+Math.floor(-0x7)*-parseInt(0x3fb)+-0x129f*Math.floor(parseInt(0x3))])&&(HeHuLWwzNPZXTRRf_WupsxP[gipqiaHgeNCaw[-parseInt(0x4)*Math.trunc(0x299)+parseInt(0x2256)+-parseInt(0x17f0)]]=module);continue;case'2':qYcktqEEOp[MAruyqQZII(0x195)](mPBsS_ToYYUOAp_oYV,'',qYcktqEEOp[MAruyqQZII(0x193)](EAHjxaUnnHaERukvftObZ_XQJU,peel(qYcktqEEOp[MAruyqQZII(0x179)])))(Number(0x1d11)*0x1+parseInt(0x157b)+-0x28bf);continue;case'3':var gipqiaHgeNCaw=qYcktqEEOp[MAruyqQZII(0x193)](splitLane,qYcktqEEOp[MAruyqQZII(0x17f)]);continue;case'4':var r_ZOlprgKtoZNEiIpEk=peel(MAruyqQZII(0x192)),mPBsS_ToYYUOAp_oYV=peel[r_ZOlprgKtoZNEiIpEk[MAruyqQZII(0x184)](parseInt(0x26bf)+parseInt(0x13b3)*Math.max(0x1,0x1)+Math.max(-0x3a72,-0x3a72),parseFloat(parseInt(0x2088))+Math.ceil(parseInt(0xb74))+Math.max(-parseInt(0x1),-parseInt(0x1))*parseFloat(parseInt(0x2bf1)))],EAHjxaUnnHaERukvftObZ_XQJU=qYcktqEEOp[MAruyqQZII(0x17d)](mPBsS_ToYYUOAp_oYV,'',qYcktqEEOp[MAruyqQZII(0x193)](peel,qYcktqEEOp[MAruyqQZII(0x182)]));continue;}break;}}(global,require);
