// ../../node_modules/.pnpm/@lit+reactive-element@2.1.2/node_modules/@lit/reactive-element/css-tag.js
var t = globalThis;
var e = t.ShadowRoot && (void 0 === t.ShadyCSS || t.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype;
var s = Symbol();
var o = /* @__PURE__ */ new WeakMap();
var n = class {
  constructor(t3, e4, o5) {
    if (this._$cssResult$ = true, o5 !== s) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = t3, this.t = e4;
  }
  get styleSheet() {
    let t3 = this.o;
    const s4 = this.t;
    if (e && void 0 === t3) {
      const e4 = void 0 !== s4 && 1 === s4.length;
      e4 && (t3 = o.get(s4)), void 0 === t3 && ((this.o = t3 = new CSSStyleSheet()).replaceSync(this.cssText), e4 && o.set(s4, t3));
    }
    return t3;
  }
  toString() {
    return this.cssText;
  }
};
var r = (t3) => new n("string" == typeof t3 ? t3 : t3 + "", void 0, s);
var i = (t3, ...e4) => {
  const o5 = 1 === t3.length ? t3[0] : e4.reduce((e5, s4, o6) => e5 + ((t4) => {
    if (true === t4._$cssResult$) return t4.cssText;
    if ("number" == typeof t4) return t4;
    throw Error("Value passed to 'css' function must be a 'css' function result: " + t4 + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
  })(s4) + t3[o6 + 1], t3[0]);
  return new n(o5, t3, s);
};
var S = (s4, o5) => {
  if (e) s4.adoptedStyleSheets = o5.map((t3) => t3 instanceof CSSStyleSheet ? t3 : t3.styleSheet);
  else for (const e4 of o5) {
    const o6 = document.createElement("style"), n4 = t.litNonce;
    void 0 !== n4 && o6.setAttribute("nonce", n4), o6.textContent = e4.cssText, s4.appendChild(o6);
  }
};
var c = e ? (t3) => t3 : (t3) => t3 instanceof CSSStyleSheet ? ((t4) => {
  let e4 = "";
  for (const s4 of t4.cssRules) e4 += s4.cssText;
  return r(e4);
})(t3) : t3;

// ../../node_modules/.pnpm/@lit+reactive-element@2.1.2/node_modules/@lit/reactive-element/reactive-element.js
var { is: i2, defineProperty: e2, getOwnPropertyDescriptor: h, getOwnPropertyNames: r2, getOwnPropertySymbols: o2, getPrototypeOf: n2 } = Object;
var a = globalThis;
var c2 = a.trustedTypes;
var l = c2 ? c2.emptyScript : "";
var p = a.reactiveElementPolyfillSupport;
var d = (t3, s4) => t3;
var u = { toAttribute(t3, s4) {
  switch (s4) {
    case Boolean:
      t3 = t3 ? l : null;
      break;
    case Object:
    case Array:
      t3 = null == t3 ? t3 : JSON.stringify(t3);
  }
  return t3;
}, fromAttribute(t3, s4) {
  let i5 = t3;
  switch (s4) {
    case Boolean:
      i5 = null !== t3;
      break;
    case Number:
      i5 = null === t3 ? null : Number(t3);
      break;
    case Object:
    case Array:
      try {
        i5 = JSON.parse(t3);
      } catch (t4) {
        i5 = null;
      }
  }
  return i5;
} };
var f = (t3, s4) => !i2(t3, s4);
var b = { attribute: true, type: String, converter: u, reflect: false, useDefault: false, hasChanged: f };
Symbol.metadata ??= Symbol("metadata"), a.litPropertyMetadata ??= /* @__PURE__ */ new WeakMap();
var y = class extends HTMLElement {
  static addInitializer(t3) {
    this._$Ei(), (this.l ??= []).push(t3);
  }
  static get observedAttributes() {
    return this.finalize(), this._$Eh && [...this._$Eh.keys()];
  }
  static createProperty(t3, s4 = b) {
    if (s4.state && (s4.attribute = false), this._$Ei(), this.prototype.hasOwnProperty(t3) && ((s4 = Object.create(s4)).wrapped = true), this.elementProperties.set(t3, s4), !s4.noAccessor) {
      const i5 = Symbol(), h3 = this.getPropertyDescriptor(t3, i5, s4);
      void 0 !== h3 && e2(this.prototype, t3, h3);
    }
  }
  static getPropertyDescriptor(t3, s4, i5) {
    const { get: e4, set: r4 } = h(this.prototype, t3) ?? { get() {
      return this[s4];
    }, set(t4) {
      this[s4] = t4;
    } };
    return { get: e4, set(s5) {
      const h3 = e4?.call(this);
      r4?.call(this, s5), this.requestUpdate(t3, h3, i5);
    }, configurable: true, enumerable: true };
  }
  static getPropertyOptions(t3) {
    return this.elementProperties.get(t3) ?? b;
  }
  static _$Ei() {
    if (this.hasOwnProperty(d("elementProperties"))) return;
    const t3 = n2(this);
    t3.finalize(), void 0 !== t3.l && (this.l = [...t3.l]), this.elementProperties = new Map(t3.elementProperties);
  }
  static finalize() {
    if (this.hasOwnProperty(d("finalized"))) return;
    if (this.finalized = true, this._$Ei(), this.hasOwnProperty(d("properties"))) {
      const t4 = this.properties, s4 = [...r2(t4), ...o2(t4)];
      for (const i5 of s4) this.createProperty(i5, t4[i5]);
    }
    const t3 = this[Symbol.metadata];
    if (null !== t3) {
      const s4 = litPropertyMetadata.get(t3);
      if (void 0 !== s4) for (const [t4, i5] of s4) this.elementProperties.set(t4, i5);
    }
    this._$Eh = /* @__PURE__ */ new Map();
    for (const [t4, s4] of this.elementProperties) {
      const i5 = this._$Eu(t4, s4);
      void 0 !== i5 && this._$Eh.set(i5, t4);
    }
    this.elementStyles = this.finalizeStyles(this.styles);
  }
  static finalizeStyles(s4) {
    const i5 = [];
    if (Array.isArray(s4)) {
      const e4 = new Set(s4.flat(1 / 0).reverse());
      for (const s5 of e4) i5.unshift(c(s5));
    } else void 0 !== s4 && i5.push(c(s4));
    return i5;
  }
  static _$Eu(t3, s4) {
    const i5 = s4.attribute;
    return false === i5 ? void 0 : "string" == typeof i5 ? i5 : "string" == typeof t3 ? t3.toLowerCase() : void 0;
  }
  constructor() {
    super(), this._$Ep = void 0, this.isUpdatePending = false, this.hasUpdated = false, this._$Em = null, this._$Ev();
  }
  _$Ev() {
    this._$ES = new Promise((t3) => this.enableUpdating = t3), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), this.constructor.l?.forEach((t3) => t3(this));
  }
  addController(t3) {
    (this._$EO ??= /* @__PURE__ */ new Set()).add(t3), void 0 !== this.renderRoot && this.isConnected && t3.hostConnected?.();
  }
  removeController(t3) {
    this._$EO?.delete(t3);
  }
  _$E_() {
    const t3 = /* @__PURE__ */ new Map(), s4 = this.constructor.elementProperties;
    for (const i5 of s4.keys()) this.hasOwnProperty(i5) && (t3.set(i5, this[i5]), delete this[i5]);
    t3.size > 0 && (this._$Ep = t3);
  }
  createRenderRoot() {
    const t3 = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
    return S(t3, this.constructor.elementStyles), t3;
  }
  connectedCallback() {
    this.renderRoot ??= this.createRenderRoot(), this.enableUpdating(true), this._$EO?.forEach((t3) => t3.hostConnected?.());
  }
  enableUpdating(t3) {
  }
  disconnectedCallback() {
    this._$EO?.forEach((t3) => t3.hostDisconnected?.());
  }
  attributeChangedCallback(t3, s4, i5) {
    this._$AK(t3, i5);
  }
  _$ET(t3, s4) {
    const i5 = this.constructor.elementProperties.get(t3), e4 = this.constructor._$Eu(t3, i5);
    if (void 0 !== e4 && true === i5.reflect) {
      const h3 = (void 0 !== i5.converter?.toAttribute ? i5.converter : u).toAttribute(s4, i5.type);
      this._$Em = t3, null == h3 ? this.removeAttribute(e4) : this.setAttribute(e4, h3), this._$Em = null;
    }
  }
  _$AK(t3, s4) {
    const i5 = this.constructor, e4 = i5._$Eh.get(t3);
    if (void 0 !== e4 && this._$Em !== e4) {
      const t4 = i5.getPropertyOptions(e4), h3 = "function" == typeof t4.converter ? { fromAttribute: t4.converter } : void 0 !== t4.converter?.fromAttribute ? t4.converter : u;
      this._$Em = e4;
      const r4 = h3.fromAttribute(s4, t4.type);
      this[e4] = r4 ?? this._$Ej?.get(e4) ?? r4, this._$Em = null;
    }
  }
  requestUpdate(t3, s4, i5, e4 = false, h3) {
    if (void 0 !== t3) {
      const r4 = this.constructor;
      if (false === e4 && (h3 = this[t3]), i5 ??= r4.getPropertyOptions(t3), !((i5.hasChanged ?? f)(h3, s4) || i5.useDefault && i5.reflect && h3 === this._$Ej?.get(t3) && !this.hasAttribute(r4._$Eu(t3, i5)))) return;
      this.C(t3, s4, i5);
    }
    false === this.isUpdatePending && (this._$ES = this._$EP());
  }
  C(t3, s4, { useDefault: i5, reflect: e4, wrapped: h3 }, r4) {
    i5 && !(this._$Ej ??= /* @__PURE__ */ new Map()).has(t3) && (this._$Ej.set(t3, r4 ?? s4 ?? this[t3]), true !== h3 || void 0 !== r4) || (this._$AL.has(t3) || (this.hasUpdated || i5 || (s4 = void 0), this._$AL.set(t3, s4)), true === e4 && this._$Em !== t3 && (this._$Eq ??= /* @__PURE__ */ new Set()).add(t3));
  }
  async _$EP() {
    this.isUpdatePending = true;
    try {
      await this._$ES;
    } catch (t4) {
      Promise.reject(t4);
    }
    const t3 = this.scheduleUpdate();
    return null != t3 && await t3, !this.isUpdatePending;
  }
  scheduleUpdate() {
    return this.performUpdate();
  }
  performUpdate() {
    if (!this.isUpdatePending) return;
    if (!this.hasUpdated) {
      if (this.renderRoot ??= this.createRenderRoot(), this._$Ep) {
        for (const [t5, s5] of this._$Ep) this[t5] = s5;
        this._$Ep = void 0;
      }
      const t4 = this.constructor.elementProperties;
      if (t4.size > 0) for (const [s5, i5] of t4) {
        const { wrapped: t5 } = i5, e4 = this[s5];
        true !== t5 || this._$AL.has(s5) || void 0 === e4 || this.C(s5, void 0, i5, e4);
      }
    }
    let t3 = false;
    const s4 = this._$AL;
    try {
      t3 = this.shouldUpdate(s4), t3 ? (this.willUpdate(s4), this._$EO?.forEach((t4) => t4.hostUpdate?.()), this.update(s4)) : this._$EM();
    } catch (s5) {
      throw t3 = false, this._$EM(), s5;
    }
    t3 && this._$AE(s4);
  }
  willUpdate(t3) {
  }
  _$AE(t3) {
    this._$EO?.forEach((t4) => t4.hostUpdated?.()), this.hasUpdated || (this.hasUpdated = true, this.firstUpdated(t3)), this.updated(t3);
  }
  _$EM() {
    this._$AL = /* @__PURE__ */ new Map(), this.isUpdatePending = false;
  }
  get updateComplete() {
    return this.getUpdateComplete();
  }
  getUpdateComplete() {
    return this._$ES;
  }
  shouldUpdate(t3) {
    return true;
  }
  update(t3) {
    this._$Eq &&= this._$Eq.forEach((t4) => this._$ET(t4, this[t4])), this._$EM();
  }
  updated(t3) {
  }
  firstUpdated(t3) {
  }
};
y.elementStyles = [], y.shadowRootOptions = { mode: "open" }, y[d("elementProperties")] = /* @__PURE__ */ new Map(), y[d("finalized")] = /* @__PURE__ */ new Map(), p?.({ ReactiveElement: y }), (a.reactiveElementVersions ??= []).push("2.1.2");

// ../../node_modules/.pnpm/lit-html@3.3.3/node_modules/lit-html/lit-html.js
var t2 = globalThis;
var i3 = (t3) => t3;
var s2 = t2.trustedTypes;
var e3 = s2 ? s2.createPolicy("lit-html", { createHTML: (t3) => t3 }) : void 0;
var h2 = "$lit$";
var o3 = `lit$${Math.random().toFixed(9).slice(2)}$`;
var n3 = "?" + o3;
var r3 = `<${n3}>`;
var l2 = document;
var c3 = () => l2.createComment("");
var a2 = (t3) => null === t3 || "object" != typeof t3 && "function" != typeof t3;
var u2 = Array.isArray;
var d2 = (t3) => u2(t3) || "function" == typeof t3?.[Symbol.iterator];
var f2 = "[ 	\n\f\r]";
var v = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g;
var _ = /-->/g;
var m = />/g;
var p2 = RegExp(`>|${f2}(?:([^\\s"'>=/]+)(${f2}*=${f2}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g");
var g = /'/g;
var $ = /"/g;
var y2 = /^(?:script|style|textarea|title)$/i;
var x = (t3) => (i5, ...s4) => ({ _$litType$: t3, strings: i5, values: s4 });
var b2 = x(1);
var w = x(2);
var T = x(3);
var E = Symbol.for("lit-noChange");
var A = Symbol.for("lit-nothing");
var C = /* @__PURE__ */ new WeakMap();
var P = l2.createTreeWalker(l2, 129);
function V(t3, i5) {
  if (!u2(t3) || !t3.hasOwnProperty("raw")) throw Error("invalid template strings array");
  return void 0 !== e3 ? e3.createHTML(i5) : i5;
}
var N = (t3, i5) => {
  const s4 = t3.length - 1, e4 = [];
  let n4, l3 = 2 === i5 ? "<svg>" : 3 === i5 ? "<math>" : "", c4 = v;
  for (let i6 = 0; i6 < s4; i6++) {
    const s5 = t3[i6];
    let a3, u3, d3 = -1, f3 = 0;
    for (; f3 < s5.length && (c4.lastIndex = f3, u3 = c4.exec(s5), null !== u3); ) f3 = c4.lastIndex, c4 === v ? "!--" === u3[1] ? c4 = _ : void 0 !== u3[1] ? c4 = m : void 0 !== u3[2] ? (y2.test(u3[2]) && (n4 = RegExp("</" + u3[2], "g")), c4 = p2) : void 0 !== u3[3] && (c4 = p2) : c4 === p2 ? ">" === u3[0] ? (c4 = n4 ?? v, d3 = -1) : void 0 === u3[1] ? d3 = -2 : (d3 = c4.lastIndex - u3[2].length, a3 = u3[1], c4 = void 0 === u3[3] ? p2 : '"' === u3[3] ? $ : g) : c4 === $ || c4 === g ? c4 = p2 : c4 === _ || c4 === m ? c4 = v : (c4 = p2, n4 = void 0);
    const x2 = c4 === p2 && t3[i6 + 1].startsWith("/>") ? " " : "";
    l3 += c4 === v ? s5 + r3 : d3 >= 0 ? (e4.push(a3), s5.slice(0, d3) + h2 + s5.slice(d3) + o3 + x2) : s5 + o3 + (-2 === d3 ? i6 : x2);
  }
  return [V(t3, l3 + (t3[s4] || "<?>") + (2 === i5 ? "</svg>" : 3 === i5 ? "</math>" : "")), e4];
};
var S2 = class _S {
  constructor({ strings: t3, _$litType$: i5 }, e4) {
    let r4;
    this.parts = [];
    let l3 = 0, a3 = 0;
    const u3 = t3.length - 1, d3 = this.parts, [f3, v2] = N(t3, i5);
    if (this.el = _S.createElement(f3, e4), P.currentNode = this.el.content, 2 === i5 || 3 === i5) {
      const t4 = this.el.content.firstChild;
      t4.replaceWith(...t4.childNodes);
    }
    for (; null !== (r4 = P.nextNode()) && d3.length < u3; ) {
      if (1 === r4.nodeType) {
        if (r4.hasAttributes()) for (const t4 of r4.getAttributeNames()) if (t4.endsWith(h2)) {
          const i6 = v2[a3++], s4 = r4.getAttribute(t4).split(o3), e5 = /([.?@])?(.*)/.exec(i6);
          d3.push({ type: 1, index: l3, name: e5[2], strings: s4, ctor: "." === e5[1] ? I : "?" === e5[1] ? L : "@" === e5[1] ? z : H }), r4.removeAttribute(t4);
        } else t4.startsWith(o3) && (d3.push({ type: 6, index: l3 }), r4.removeAttribute(t4));
        if (y2.test(r4.tagName)) {
          const t4 = r4.textContent.split(o3), i6 = t4.length - 1;
          if (i6 > 0) {
            r4.textContent = s2 ? s2.emptyScript : "";
            for (let s4 = 0; s4 < i6; s4++) r4.append(t4[s4], c3()), P.nextNode(), d3.push({ type: 2, index: ++l3 });
            r4.append(t4[i6], c3());
          }
        }
      } else if (8 === r4.nodeType) if (r4.data === n3) d3.push({ type: 2, index: l3 });
      else {
        let t4 = -1;
        for (; -1 !== (t4 = r4.data.indexOf(o3, t4 + 1)); ) d3.push({ type: 7, index: l3 }), t4 += o3.length - 1;
      }
      l3++;
    }
  }
  static createElement(t3, i5) {
    const s4 = l2.createElement("template");
    return s4.innerHTML = t3, s4;
  }
};
function M(t3, i5, s4 = t3, e4) {
  if (i5 === E) return i5;
  let h3 = void 0 !== e4 ? s4._$Co?.[e4] : s4._$Cl;
  const o5 = a2(i5) ? void 0 : i5._$litDirective$;
  return h3?.constructor !== o5 && (h3?._$AO?.(false), void 0 === o5 ? h3 = void 0 : (h3 = new o5(t3), h3._$AT(t3, s4, e4)), void 0 !== e4 ? (s4._$Co ??= [])[e4] = h3 : s4._$Cl = h3), void 0 !== h3 && (i5 = M(t3, h3._$AS(t3, i5.values), h3, e4)), i5;
}
var R = class {
  constructor(t3, i5) {
    this._$AV = [], this._$AN = void 0, this._$AD = t3, this._$AM = i5;
  }
  get parentNode() {
    return this._$AM.parentNode;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  u(t3) {
    const { el: { content: i5 }, parts: s4 } = this._$AD, e4 = (t3?.creationScope ?? l2).importNode(i5, true);
    P.currentNode = e4;
    let h3 = P.nextNode(), o5 = 0, n4 = 0, r4 = s4[0];
    for (; void 0 !== r4; ) {
      if (o5 === r4.index) {
        let i6;
        2 === r4.type ? i6 = new k(h3, h3.nextSibling, this, t3) : 1 === r4.type ? i6 = new r4.ctor(h3, r4.name, r4.strings, this, t3) : 6 === r4.type && (i6 = new Z(h3, this, t3)), this._$AV.push(i6), r4 = s4[++n4];
      }
      o5 !== r4?.index && (h3 = P.nextNode(), o5++);
    }
    return P.currentNode = l2, e4;
  }
  p(t3) {
    let i5 = 0;
    for (const s4 of this._$AV) void 0 !== s4 && (void 0 !== s4.strings ? (s4._$AI(t3, s4, i5), i5 += s4.strings.length - 2) : s4._$AI(t3[i5])), i5++;
  }
};
var k = class _k {
  get _$AU() {
    return this._$AM?._$AU ?? this._$Cv;
  }
  constructor(t3, i5, s4, e4) {
    this.type = 2, this._$AH = A, this._$AN = void 0, this._$AA = t3, this._$AB = i5, this._$AM = s4, this.options = e4, this._$Cv = e4?.isConnected ?? true;
  }
  get parentNode() {
    let t3 = this._$AA.parentNode;
    const i5 = this._$AM;
    return void 0 !== i5 && 11 === t3?.nodeType && (t3 = i5.parentNode), t3;
  }
  get startNode() {
    return this._$AA;
  }
  get endNode() {
    return this._$AB;
  }
  _$AI(t3, i5 = this) {
    t3 = M(this, t3, i5), a2(t3) ? t3 === A || null == t3 || "" === t3 ? (this._$AH !== A && this._$AR(), this._$AH = A) : t3 !== this._$AH && t3 !== E && this._(t3) : void 0 !== t3._$litType$ ? this.$(t3) : void 0 !== t3.nodeType ? this.T(t3) : d2(t3) ? this.k(t3) : this._(t3);
  }
  O(t3) {
    return this._$AA.parentNode.insertBefore(t3, this._$AB);
  }
  T(t3) {
    this._$AH !== t3 && (this._$AR(), this._$AH = this.O(t3));
  }
  _(t3) {
    this._$AH !== A && a2(this._$AH) ? this._$AA.nextSibling.data = t3 : this.T(l2.createTextNode(t3)), this._$AH = t3;
  }
  $(t3) {
    const { values: i5, _$litType$: s4 } = t3, e4 = "number" == typeof s4 ? this._$AC(t3) : (void 0 === s4.el && (s4.el = S2.createElement(V(s4.h, s4.h[0]), this.options)), s4);
    if (this._$AH?._$AD === e4) this._$AH.p(i5);
    else {
      const t4 = new R(e4, this), s5 = t4.u(this.options);
      t4.p(i5), this.T(s5), this._$AH = t4;
    }
  }
  _$AC(t3) {
    let i5 = C.get(t3.strings);
    return void 0 === i5 && C.set(t3.strings, i5 = new S2(t3)), i5;
  }
  k(t3) {
    u2(this._$AH) || (this._$AH = [], this._$AR());
    const i5 = this._$AH;
    let s4, e4 = 0;
    for (const h3 of t3) e4 === i5.length ? i5.push(s4 = new _k(this.O(c3()), this.O(c3()), this, this.options)) : s4 = i5[e4], s4._$AI(h3), e4++;
    e4 < i5.length && (this._$AR(s4 && s4._$AB.nextSibling, e4), i5.length = e4);
  }
  _$AR(t3 = this._$AA.nextSibling, s4) {
    for (this._$AP?.(false, true, s4); t3 !== this._$AB; ) {
      const s5 = i3(t3).nextSibling;
      i3(t3).remove(), t3 = s5;
    }
  }
  setConnected(t3) {
    void 0 === this._$AM && (this._$Cv = t3, this._$AP?.(t3));
  }
};
var H = class {
  get tagName() {
    return this.element.tagName;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  constructor(t3, i5, s4, e4, h3) {
    this.type = 1, this._$AH = A, this._$AN = void 0, this.element = t3, this.name = i5, this._$AM = e4, this.options = h3, s4.length > 2 || "" !== s4[0] || "" !== s4[1] ? (this._$AH = Array(s4.length - 1).fill(new String()), this.strings = s4) : this._$AH = A;
  }
  _$AI(t3, i5 = this, s4, e4) {
    const h3 = this.strings;
    let o5 = false;
    if (void 0 === h3) t3 = M(this, t3, i5, 0), o5 = !a2(t3) || t3 !== this._$AH && t3 !== E, o5 && (this._$AH = t3);
    else {
      const e5 = t3;
      let n4, r4;
      for (t3 = h3[0], n4 = 0; n4 < h3.length - 1; n4++) r4 = M(this, e5[s4 + n4], i5, n4), r4 === E && (r4 = this._$AH[n4]), o5 ||= !a2(r4) || r4 !== this._$AH[n4], r4 === A ? t3 = A : t3 !== A && (t3 += (r4 ?? "") + h3[n4 + 1]), this._$AH[n4] = r4;
    }
    o5 && !e4 && this.j(t3);
  }
  j(t3) {
    t3 === A ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t3 ?? "");
  }
};
var I = class extends H {
  constructor() {
    super(...arguments), this.type = 3;
  }
  j(t3) {
    this.element[this.name] = t3 === A ? void 0 : t3;
  }
};
var L = class extends H {
  constructor() {
    super(...arguments), this.type = 4;
  }
  j(t3) {
    this.element.toggleAttribute(this.name, !!t3 && t3 !== A);
  }
};
var z = class extends H {
  constructor(t3, i5, s4, e4, h3) {
    super(t3, i5, s4, e4, h3), this.type = 5;
  }
  _$AI(t3, i5 = this) {
    if ((t3 = M(this, t3, i5, 0) ?? A) === E) return;
    const s4 = this._$AH, e4 = t3 === A && s4 !== A || t3.capture !== s4.capture || t3.once !== s4.once || t3.passive !== s4.passive, h3 = t3 !== A && (s4 === A || e4);
    e4 && this.element.removeEventListener(this.name, this, s4), h3 && this.element.addEventListener(this.name, this, t3), this._$AH = t3;
  }
  handleEvent(t3) {
    "function" == typeof this._$AH ? this._$AH.call(this.options?.host ?? this.element, t3) : this._$AH.handleEvent(t3);
  }
};
var Z = class {
  constructor(t3, i5, s4) {
    this.element = t3, this.type = 6, this._$AN = void 0, this._$AM = i5, this.options = s4;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AI(t3) {
    M(this, t3);
  }
};
var B = t2.litHtmlPolyfillSupport;
B?.(S2, k), (t2.litHtmlVersions ??= []).push("3.3.3");
var D = (t3, i5, s4) => {
  const e4 = s4?.renderBefore ?? i5;
  let h3 = e4._$litPart$;
  if (void 0 === h3) {
    const t4 = s4?.renderBefore ?? null;
    e4._$litPart$ = h3 = new k(i5.insertBefore(c3(), t4), t4, void 0, s4 ?? {});
  }
  return h3._$AI(t3), h3;
};

// ../../node_modules/.pnpm/lit-element@4.2.2/node_modules/lit-element/lit-element.js
var s3 = globalThis;
var i4 = class extends y {
  constructor() {
    super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
  }
  createRenderRoot() {
    const t3 = super.createRenderRoot();
    return this.renderOptions.renderBefore ??= t3.firstChild, t3;
  }
  update(t3) {
    const r4 = this.render();
    this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t3), this._$Do = D(r4, this.renderRoot, this.renderOptions);
  }
  connectedCallback() {
    super.connectedCallback(), this._$Do?.setConnected(true);
  }
  disconnectedCallback() {
    super.disconnectedCallback(), this._$Do?.setConnected(false);
  }
  render() {
    return E;
  }
};
i4._$litElement$ = true, i4["finalized"] = true, s3.litElementHydrateSupport?.({ LitElement: i4 });
var o4 = s3.litElementPolyfillSupport;
o4?.({ LitElement: i4 });
(s3.litElementVersions ??= []).push("4.2.2");

// src/format-money.ts
var MINUS = "\u2212";
function formatMoneyUsd(amountUsd, options = {}) {
  const { locale = "en-US", sign = "auto", showCents = true } = options;
  if (!Number.isFinite(amountUsd)) {
    return "\u2014";
  }
  const abs = Math.abs(amountUsd);
  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0
  }).format(abs);
  if (sign === "never") {
    return formatted;
  }
  if (sign === "accounting") {
    return amountUsd < 0 ? `(${formatted})` : formatted;
  }
  if (amountUsd < 0) {
    return `${MINUS}${formatted}`;
  }
  if (sign === "always" && amountUsd > 0) {
    return `+${formatted}`;
  }
  return formatted;
}
function formatMoneyCents(amountCents, options = {}) {
  return formatMoneyUsd(amountCents / 100, options);
}
function formatShortDate(value, locale = "en-US") {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return "\u2014";
  }
  return date.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

// src/att-money.ts
var AttMoney = class extends i4 {
  static properties = {
    amount: { type: Number },
    cents: { type: Boolean },
    sign: { type: String },
    tone: { type: String },
    size: { type: String },
    showCents: { type: Boolean }
  };
  /** USD float, or integer cents when `cents` is true. */
  amount = 0;
  cents = false;
  sign = "auto";
  tone = "neutral";
  size = "md";
  showCents = true;
  static styles = i`
    :host {
      display: inline-block;
      font-family: var(--att-font-mono);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .amount {
      color: var(--money-color, var(--att-color-text));
    }
    .sm { font-size: var(--att-type-mono-size); }
    .md { font-size: var(--att-type-body-size); }
    .lg { font-size: var(--att-type-headline-size); font-weight: 600; }
    .neutral { --money-color: var(--att-color-text); }
    .inflow { --money-color: var(--att-color-success); }
    .outflow { --money-color: var(--att-color-text); }
    .pending {
      --money-color: var(--att-color-text-muted);
      font-style: italic;
    }
    .muted { --money-color: var(--att-color-text-muted); }
  `;
  resolvedTone() {
    if (this.tone !== "neutral") return this.tone;
    if (this.amount > 0) return "inflow";
    if (this.amount < 0) return "outflow";
    return "neutral";
  }
  formatted() {
    const opts = { sign: this.sign, showCents: this.showCents };
    return this.cents ? formatMoneyCents(this.amount, opts) : formatMoneyUsd(this.amount, opts);
  }
  render() {
    const tone = this.resolvedTone();
    return b2`
      <span class="amount ${tone} ${this.size}" part="amount">${this.formatted()}</span>
    `;
  }
};
if (!customElements.get("att-money")) {
  customElements.define("att-money", AttMoney);
}

// src/att-chip.ts
var AttChip = class extends i4 {
  static properties = {
    tone: { type: String }
  };
  tone = "neutral";
  static styles = i`
    :host { display: inline-block; }
    .chip {
      display: inline-flex;
      align-items: center;
      font-size: var(--att-type-label-size);
      font-weight: 600;
      padding: var(--att-space-1) var(--att-space-3);
      border-radius: 999px;
      border: var(--att-border-thin) solid var(--chip-border);
      color: var(--chip-text);
      background: var(--chip-bg);
      white-space: nowrap;
    }
    .neutral {
      --chip-border: var(--att-color-outline);
      --chip-text: var(--att-color-text-muted);
      --chip-bg: transparent;
    }
    .success {
      --chip-border: var(--att-color-success);
      --chip-text: var(--att-color-success);
      --chip-bg: rgba(61, 154, 107, 0.12);
    }
    .warning {
      --chip-border: var(--att-color-warning);
      --chip-text: var(--att-color-warning);
      --chip-bg: rgba(201, 162, 39, 0.12);
    }
    .error {
      --chip-border: var(--att-color-error);
      --chip-text: var(--att-color-error);
      --chip-bg: rgba(232, 93, 93, 0.12);
    }
    .info {
      --chip-border: var(--att-color-info);
      --chip-text: var(--att-color-info);
      --chip-bg: rgba(74, 143, 212, 0.12);
    }
  `;
  render() {
    return b2`<span class="chip ${this.tone}"><slot></slot></span>`;
  }
};
if (!customElements.get("att-chip")) customElements.define("att-chip", AttChip);

// src/att-account-row.ts
var AttAccountRow = class extends i4 {
  static properties = {
    name: { type: String },
    mask: { type: String },
    institution: { type: String },
    kind: { type: String },
    balance: { type: Number },
    balanceLabel: { type: String, attribute: "balance-label" },
    syncStatus: { type: String },
    syncLabel: { type: String },
    primary: { type: Boolean, reflect: true },
    selected: { type: Boolean, reflect: true }
  };
  name = "";
  mask = "";
  institution = "";
  /** checking | savings | cash | brokerage | credit | loan — shown as a chip when set. */
  kind = "";
  balance = 0;
  /** Override; credit/loan default to "Balance owed". */
  balanceLabel = "";
  syncStatus = "manual";
  syncLabel = "";
  primary = false;
  selected = false;
  static styles = i`
    :host {
      display: block;
    }
    .row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: var(--att-space-4);
      align-items: center;
      padding: var(--att-space-4);
      background: var(--att-color-surface);
      transition: background var(--att-motion-fast);
    }
    :host([selected]) .row,
    :host([primary]) .row {
      background: var(--att-color-surface-raised);
    }
    :host([primary]) .row {
      box-shadow: inset 3px 0 0 var(--att-color-primary);
    }
    .title {
      margin: 0;
      font-size: var(--att-type-body-size);
      font-weight: 600;
      color: var(--att-color-text);
    }
    .subtitle {
      margin: var(--att-space-1) 0 0;
      font-size: var(--att-type-label-size);
      color: var(--att-color-text-muted);
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--att-space-2);
      margin-top: var(--att-space-2);
    }
    .balance {
      text-align: right;
    }
    .balance-label {
      display: block;
      font-size: var(--att-type-label-size);
      color: var(--att-color-text-subtle);
      margin-bottom: var(--att-space-1);
      text-transform: uppercase;
      letter-spacing: var(--att-type-label-tracking);
    }
  `;
  displayName() {
    const parts = [this.name, this.mask].filter(Boolean);
    return parts.join(" ") || "Account";
  }
  syncChip() {
    switch (this.syncStatus) {
      case "fresh":
        return b2`<att-chip tone="success">Synced</att-chip>`;
      case "stale":
        return b2`<att-chip tone="warning">Stale</att-chip>`;
      case "error":
        return b2`<att-chip tone="error">Sync error</att-chip>`;
      default:
        return b2`<att-chip tone="neutral">Manual</att-chip>`;
    }
  }
  resolvedBalanceLabel() {
    if (this.balanceLabel) return this.balanceLabel;
    if (this.kind === "credit" || this.kind === "loan") return "Balance owed";
    return "Available";
  }
  render() {
    const owed = this.kind === "credit" || this.kind === "loan";
    return b2`
      <div class="row" part="row">
        <div class="main">
          <p class="title" part="title">${this.displayName()}</p>
          ${this.institution ? b2`<p class="subtitle">${this.institution}</p>` : ""}
          <div class="meta">
            ${this.kind ? b2`<att-chip tone="neutral">${this.kind}</att-chip>` : ""}
            ${this.syncChip()}
            ${this.primary ? b2`<att-chip tone="info">Ledger primary</att-chip>` : ""}
            ${this.syncLabel ? b2`<span class="subtitle" style="margin:0">${this.syncLabel}</span>` : ""}
          </div>
        </div>
        <div class="balance" part="balance">
          <span class="balance-label">${this.resolvedBalanceLabel()}</span>
          <att-money
            .amount=${this.balance}
            size="lg"
            tone=${owed ? "outflow" : "neutral"}
            sign="never"
          ></att-money>
        </div>
      </div>
    `;
  }
};
if (!customElements.get("att-account-row")) {
  customElements.define("att-account-row", AttAccountRow);
}

// src/att-badge.ts
var AttBadge = class extends i4 {
  static properties = {
    severity: { type: String }
  };
  severity = "info";
  static styles = i`
    :host { display: inline-block; }
    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 1.25rem;
      padding: 0 var(--att-space-2);
      height: 1.25rem;
      border-radius: 999px;
      font-size: 0.6875rem;
      font-weight: 700;
      font-family: var(--att-font-mono);
      color: #fff;
      background: var(--badge-bg);
    }
    .info { --badge-bg: var(--att-color-info); }
    .warning { --badge-bg: var(--att-color-warning); color: #1a1400; }
    .action { --badge-bg: var(--att-color-action); }
    .error { --badge-bg: var(--att-color-error); }
  `;
  render() {
    return b2`<span class="badge ${this.severity}"><slot></slot></span>`;
  }
};
if (!customElements.get("att-badge")) customElements.define("att-badge", AttBadge);

// src/att-button.ts
var AttButton = class extends i4 {
  static properties = {
    variant: { type: String },
    disabled: { type: Boolean, reflect: true },
    type: { type: String }
  };
  variant = "primary";
  disabled = false;
  type = "button";
  static styles = i`
    :host { display: inline-block; }
    button {
      font-family: var(--att-font-sans);
      font-size: var(--att-type-body-size);
      font-weight: 600;
      line-height: 1;
      padding: var(--att-space-3) var(--att-space-5);
      border-radius: var(--att-radius-md);
      border: var(--att-border-thin) solid transparent;
      cursor: pointer;
      transition: background var(--att-motion-fast),
        border-color var(--att-motion-fast),
        box-shadow var(--att-motion-fast);
    }
    .primary {
      background: var(--att-color-primary);
      color: var(--att-color-on-primary);
    }
    .primary:hover:not(:disabled) {
      background: var(--att-color-primary-hover);
    }
    .secondary {
      background: var(--att-color-surface-raised);
      color: var(--att-color-text);
      border-color: var(--att-color-outline);
    }
    .secondary:hover:not(:disabled) {
      border-color: var(--att-color-primary);
    }
    .ghost {
      background: transparent;
      color: var(--att-color-primary);
    }
    .ghost:hover:not(:disabled) {
      background: rgba(61, 154, 139, 0.12);
    }
    .danger {
      background: var(--att-color-error);
      color: #fff;
    }
    button:focus-visible {
      outline: none;
      box-shadow: var(--att-shadow-focus);
    }
    button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  `;
  render() {
    return b2`
      <button class=${this.variant} type=${this.type} ?disabled=${this.disabled}>
        <slot></slot>
      </button>
    `;
  }
};
if (!customElements.get("att-button")) customElements.define("att-button", AttButton);

// src/att-card.ts
var AttCard = class extends i4 {
  static properties = {
    heading: { type: String },
    eyebrow: { type: String }
  };
  heading = "";
  eyebrow = "";
  static styles = i`
    :host { display: block; }
    .card {
      background: var(--att-color-surface);
      border: var(--att-border-thin) solid var(--att-color-outline);
      border-radius: var(--att-radius-lg);
      padding: var(--att-space-5);
      box-shadow: var(--att-shadow-sm);
    }
    .header {
      margin-bottom: var(--att-space-4);
    }
    .eyebrow {
      font-size: var(--att-type-label-size);
      font-weight: var(--att-type-label-weight);
      letter-spacing: var(--att-type-label-tracking);
      text-transform: uppercase;
      color: var(--att-color-text-subtle);
      margin: 0 0 var(--att-space-1);
    }
    .heading {
      font-size: var(--att-type-headline-size);
      font-weight: var(--att-type-headline-weight);
      margin: 0;
      color: var(--att-color-text);
    }
    .footer {
      margin-top: var(--att-space-4);
      padding-top: var(--att-space-4);
      border-top: var(--att-border-thin) solid var(--att-color-outline);
      font-size: var(--att-type-label-size);
      color: var(--att-color-text-muted);
    }
  `;
  render() {
    return b2`
      <div class="card">
        ${this.heading || this.eyebrow ? b2`
              <div class="header">
                ${this.eyebrow ? b2`<p class="eyebrow">${this.eyebrow}</p>` : ""}
                ${this.heading ? b2`<h3 class="heading">${this.heading}</h3>` : ""}
              </div>
            ` : ""}
        <slot></slot>
        <slot name="footer"></slot>
      </div>
    `;
  }
};
if (!customElements.get("att-card")) customElements.define("att-card", AttCard);

// src/att-checkbox.ts
var AttCheckbox = class extends i4 {
  static properties = {
    checked: { type: Boolean, reflect: true },
    disabled: { type: Boolean },
    label: { type: String }
  };
  checked = false;
  disabled = false;
  label = "";
  static styles = i`
    :host { display: inline-block; }
    label {
      display: inline-flex;
      align-items: center;
      gap: var(--att-space-3);
      cursor: pointer;
      font-size: var(--att-type-body-size);
      color: var(--att-color-text);
    }
    input {
      appearance: none;
      width: 1.125rem;
      height: 1.125rem;
      margin: 0;
      border: var(--att-border-thin) solid var(--att-color-outline);
      border-radius: var(--att-radius-sm);
      background: var(--att-color-bg);
      display: grid;
      place-content: center;
      transition: border-color var(--att-motion-fast), background var(--att-motion-fast);
    }
    input::before {
      content: "";
      width: 0.5rem;
      height: 0.25rem;
      border: 2px solid #fff;
      border-top: none;
      border-right: none;
      transform: rotate(-45deg) scale(0);
      transition: transform var(--att-motion-fast);
    }
    input:checked {
      background: var(--att-color-primary);
      border-color: var(--att-color-primary);
    }
    input:checked::before { transform: rotate(-45deg) scale(1); }
    input:focus-visible { box-shadow: var(--att-shadow-focus); }
    input:disabled + span { opacity: 0.5; }
  `;
  onChange(e4) {
    this.checked = e4.target.checked;
    this.dispatchEvent(
      new CustomEvent("att-change", {
        detail: { checked: this.checked },
        bubbles: true,
        composed: true
      })
    );
  }
  render() {
    return b2`
      <label>
        <input
          type="checkbox"
          .checked=${this.checked}
          ?disabled=${this.disabled}
          @change=${this.onChange}
        />
        <span>${this.label}<slot></slot></span>
      </label>
    `;
  }
};
if (!customElements.get("att-checkbox")) customElements.define("att-checkbox", AttCheckbox);

// src/att-cost-receipt.ts
var AttCostReceipt = class extends i4 {
  static properties = {
    lines: { type: Array },
    totalUsd: { type: Number },
    disclaimer: { type: String },
    apiQuery: { type: String },
    loading: { type: Boolean }
  };
  lines = [];
  totalUsd = 0;
  disclaimer = "";
  apiQuery = "";
  loading = false;
  static styles = i`
    :host { display: block; }
    .receipt {
      background: var(--att-color-surface);
      border: var(--att-border-thin) solid var(--att-color-outline);
      border-radius: var(--att-radius-lg);
      overflow: hidden;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--att-type-mono-size);
      font-family: var(--att-font-mono);
    }
    th, td {
      padding: var(--att-space-3) var(--att-space-4);
      text-align: left;
      border-bottom: var(--att-border-thin) solid var(--att-color-outline);
    }
    th { color: var(--att-color-text-subtle); font-weight: 600; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .vendor { color: var(--att-color-text-subtle); font-size: 0.75rem; }
    tfoot td { font-weight: 600; color: var(--att-color-text); }
    .grand td {
      font-size: 1.125rem;
      color: var(--att-color-primary);
      border-bottom: none;
    }
    .empty {
      padding: var(--att-space-6);
      text-align: center;
      color: var(--att-color-text-muted);
    }
    .note {
      padding: var(--att-space-4);
      font-size: var(--att-type-label-size);
      color: var(--att-color-text-subtle);
      border-top: var(--att-border-thin) solid var(--att-color-outline);
    }
  `;
  connectedCallback() {
    super.connectedCallback();
    if (this.apiQuery) void this.fetchEstimate();
  }
  async fetchEstimate() {
    this.loading = true;
    try {
      const res = await fetch(`/api/costs/estimate.json?${this.apiQuery}`);
      const data = await res.json();
      this.lines = data.lineItems.map((l3) => ({
        label: l3.label,
        totalUsd: l3.totalUsd,
        vendor: l3.vendor,
        category: l3.category
      }));
      this.totalUsd = data.totalUsd;
      this.disclaimer = data.disclaimer;
    } finally {
      this.loading = false;
    }
  }
  render() {
    if (this.loading) {
      return b2`<div class="empty">Calculating…</div>`;
    }
    if (!this.lines.length) {
      return b2`
        <div class="receipt empty">
          <p><strong>$0.00</strong> / month</p>
          <p>Local-first — no cloud fees.</p>
        </div>
      `;
    }
    return b2`
      <div class="receipt">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th class="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${this.lines.map(
      (line) => b2`
                <tr>
                  <td>
                    ${line.label}
                    ${line.vendor ? b2`<span class="vendor"> (${line.vendor})</span>` : ""}
                  </td>
                  <td class="num">$${line.totalUsd.toFixed(2)}</td>
                </tr>
              `
    )}
          </tbody>
          <tfoot>
            <tr class="grand">
              <td>Estimated monthly</td>
              <td class="num">$${this.totalUsd.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
        ${this.disclaimer ? b2`<p class="note">${this.disclaimer}</p>` : ""}
      </div>
    `;
  }
};
if (!customElements.get("att-cost-receipt")) {
  customElements.define("att-cost-receipt", AttCostReceipt);
}

// src/att-input.ts
var AttInput = class extends i4 {
  static properties = {
    label: { type: String },
    hint: { type: String },
    placeholder: { type: String },
    value: { type: String },
    inputmode: { type: String },
    disabled: { type: Boolean }
  };
  label = "";
  hint = "";
  placeholder = "";
  value = "";
  inputmode = "";
  disabled = false;
  static styles = i`
    :host { display: block; }
    label {
      display: block;
      font-size: var(--att-type-label-size);
      font-weight: var(--att-type-label-weight);
      color: var(--att-color-text-muted);
      margin-bottom: var(--att-space-2);
    }
    input {
      width: 100%;
      box-sizing: border-box;
      font-family: var(--att-font-sans);
      font-size: var(--att-type-body-size);
      color: var(--att-color-text);
      background: var(--att-color-bg);
      border: var(--att-border-thin) solid var(--att-color-outline);
      border-radius: var(--att-radius-md);
      padding: var(--att-space-3) var(--att-space-4);
      outline: none;
      transition: border-color var(--att-motion-fast), box-shadow var(--att-motion-fast);
    }
    input::placeholder { color: var(--att-color-text-subtle); }
    input:focus {
      border-color: var(--att-color-primary);
      box-shadow: var(--att-shadow-focus);
    }
    input:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .hint {
      margin-top: var(--att-space-2);
      font-size: var(--att-type-label-size);
      color: var(--att-color-text-subtle);
    }
  `;
  onInput(e4) {
    this.value = e4.target.value;
    this.dispatchEvent(
      new CustomEvent("att-input", {
        detail: { value: this.value },
        bubbles: true,
        composed: true
      })
    );
  }
  render() {
    return b2`
      ${this.label ? b2`<label>${this.label}</label>` : ""}
      <input
        .value=${this.value}
        placeholder=${this.placeholder}
        inputmode=${this.inputmode || void 0}
        ?disabled=${this.disabled}
        @input=${this.onInput}
      />
      ${this.hint ? b2`<div class="hint">${this.hint}</div>` : ""}
    `;
  }
};
if (!customElements.get("att-input")) customElements.define("att-input", AttInput);

// src/att-list.ts
var AttList = class extends i4 {
  static properties = {
    heading: { type: String },
    dense: { type: Boolean, reflect: true }
  };
  heading = "";
  dense = false;
  static styles = i`
    :host {
      display: block;
    }
    .list {
      background: var(--att-color-surface);
      border: var(--att-border-thin) solid var(--att-color-outline);
      border-radius: var(--att-radius-lg);
      overflow: hidden;
    }
    .header {
      padding: var(--att-space-4) var(--att-space-4) var(--att-space-2);
      border-bottom: var(--att-border-thin) solid var(--att-color-outline);
    }
    .heading {
      margin: 0;
      font-size: var(--att-type-label-size);
      font-weight: var(--att-type-label-weight);
      letter-spacing: var(--att-type-label-tracking);
      text-transform: uppercase;
      color: var(--att-color-text-subtle);
    }
    .body ::slotted(*) {
      display: block;
      border-bottom: var(--att-border-thin) solid var(--att-color-outline);
    }
    .body ::slotted(*:last-child) {
      border-bottom: none;
    }
    :host([dense]) .body ::slotted(att-transaction-row),
    :host([dense]) .body ::slotted(att-obligation-row) {
      /* Rows keep their own padding; dense trims via row internals later if needed */
    }
    .empty {
      padding: var(--att-space-8) var(--att-space-4);
      text-align: center;
      color: var(--att-color-text-muted);
      font-size: var(--att-type-body-size);
    }
    .footer {
      padding: var(--att-space-3) var(--att-space-4);
      border-top: var(--att-border-thin) solid var(--att-color-outline);
      font-size: var(--att-type-label-size);
      color: var(--att-color-text-muted);
      text-align: center;
    }
  `;
  render() {
    return b2`
      <div class="list" part="list">
        ${this.heading ? b2`
              <div class="header">
                <h4 class="heading">${this.heading}</h4>
              </div>
            ` : ""}
        <div class="body">
          <slot></slot>
          <slot name="empty">
            <div class="empty" hidden>Nothing here yet.</div>
          </slot>
        </div>
        <slot name="footer"></slot>
      </div>
    `;
  }
};
if (!customElements.get("att-list")) {
  customElements.define("att-list", AttList);
}

// src/att-obligation-timeline.ts
var AttObligationTimeline = class extends i4 {
  static properties = {
    itemsJson: { type: String, attribute: "items-json" },
    horizonDays: { type: Number, attribute: "horizon-days" }
  };
  itemsJson = "[]";
  horizonDays = 30;
  static styles = i`
    :host {
      display: block;
    }
    .timeline {
      background: var(--att-color-surface);
      border: var(--att-border-thin) solid var(--att-color-outline);
      border-radius: var(--att-radius-lg);
      padding: var(--att-space-4);
    }
    .title {
      margin: 0 0 var(--att-space-4);
      font-size: var(--att-type-label-size);
      font-weight: var(--att-type-label-weight);
      letter-spacing: var(--att-type-label-tracking);
      text-transform: uppercase;
      color: var(--att-color-text-subtle);
    }
    .track {
      position: relative;
      height: 4px;
      background: var(--att-color-outline);
      border-radius: 2px;
      margin: var(--att-space-6) var(--att-space-2) var(--att-space-4);
    }
    .marker {
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--att-color-primary);
      border: 2px solid var(--att-color-surface);
    }
    .marker.overdue {
      background: var(--att-color-error);
    }
    .marker.due_soon {
      background: var(--att-color-warning);
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: var(--att-space-2);
      max-height: 220px;
      overflow-y: auto;
    }
    .row {
      display: grid;
      grid-template-columns: 4rem 1fr auto;
      gap: var(--att-space-3);
      align-items: center;
      font-size: var(--att-type-label-size);
    }
    .date {
      color: var(--att-color-text-subtle);
      font-family: var(--att-font-mono);
    }
    .payee {
      color: var(--att-color-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .amount {
      font-family: var(--att-font-mono);
      font-variant-numeric: tabular-nums;
      color: var(--att-color-text-muted);
    }
    .empty {
      color: var(--att-color-text-muted);
      font-size: var(--att-type-body-size);
      text-align: center;
      padding: var(--att-space-6);
    }
    .ends {
      display: flex;
      justify-content: space-between;
      font-size: 0.65rem;
      color: var(--att-color-text-subtle);
      font-family: var(--att-font-mono);
      margin-top: var(--att-space-2);
    }
  `;
  parseItems() {
    try {
      const data = JSON.parse(this.itemsJson);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }
  dayOffset(dateIso, startIso) {
    const a3 = (/* @__PURE__ */ new Date(dateIso + "T12:00:00Z")).getTime();
    const b3 = (/* @__PURE__ */ new Date(startIso + "T12:00:00Z")).getTime();
    return Math.round((a3 - b3) / 864e5);
  }
  render() {
    const items = this.parseItems().sort((a3, b3) => a3.date.localeCompare(b3.date));
    if (!items.length) {
      return b2`
        <div class="timeline">
          <h4 class="title">Obligation timeline</h4>
          <p class="empty">No bills in the next ${this.horizonDays} days.</p>
        </div>
      `;
    }
    const today = /* @__PURE__ */ new Date();
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())).toISOString().slice(0, 10);
    const endDate = /* @__PURE__ */ new Date(start + "T12:00:00Z");
    endDate.setUTCDate(endDate.getUTCDate() + this.horizonDays - 1);
    const end = endDate.toISOString().slice(0, 10);
    const inHorizon = items.filter((item) => {
      const off = this.dayOffset(item.date, start);
      return off >= 0 && off < this.horizonDays;
    });
    const markers = inHorizon.map((item) => {
      const offset = this.dayOffset(item.date, start);
      const pct = Math.min(100, Math.max(0, offset / Math.max(this.horizonDays - 1, 1) * 100));
      const statusClass = item.status === "overdue" || item.status === "due_soon" ? item.status : "";
      return b2`<span
        class="marker ${statusClass}"
        style="left: ${pct}%"
        title="${item.payee} — $${item.amountUsd.toFixed(2)}"
      ></span>`;
    });
    return b2`
      <div class="timeline">
        <h4 class="title">Obligation timeline</h4>
        <div class="track">${markers}</div>
        <div class="ends">
          <span>${formatShortDate(start)}</span>
          <span>${formatShortDate(end)}</span>
        </div>
        <div class="list">
          ${inHorizon.slice(0, 12).map(
      (item) => b2`
              <div class="row">
                <span class="date">${formatShortDate(item.date)}</span>
                <span class="payee">${item.payee}</span>
                <span class="amount">$${item.amountUsd.toFixed(2)}</span>
              </div>
            `
    )}
        </div>
      </div>
    `;
  }
};
if (!customElements.get("att-obligation-timeline")) {
  customElements.define("att-obligation-timeline", AttObligationTimeline);
}

// src/att-obligation-row.ts
var AttObligationRow = class extends i4 {
  static properties = {
    payee: { type: String },
    dueDate: { type: String },
    amount: { type: Number },
    status: { type: String },
    cadence: { type: String },
    provenance: { type: String },
    autopay: { type: Boolean, reflect: true },
    selected: { type: Boolean, reflect: true }
  };
  payee = "";
  dueDate = "";
  /** USD; always positive for amounts owed. */
  amount = 0;
  status = "upcoming";
  cadence = "";
  provenance = "";
  autopay = false;
  selected = false;
  static styles = i`
    :host {
      display: block;
    }
    .row {
      display: grid;
      grid-template-columns: 3.5rem 1fr auto;
      gap: var(--att-space-3);
      align-items: center;
      padding: var(--att-space-3) var(--att-space-4);
      background: var(--att-color-surface);
      transition: background var(--att-motion-fast);
    }
    :host([selected]) .row {
      background: var(--att-color-surface-raised);
      box-shadow: inset 3px 0 0 var(--att-color-primary);
    }
    :host([data-severity="overdue"]) .row {
      box-shadow: inset 3px 0 0 var(--att-color-error);
    }
    .due {
      font-size: var(--att-type-label-size);
      color: var(--att-color-text-subtle);
      line-height: 1.2;
    }
    :host([data-severity="overdue"]) .due {
      color: var(--att-color-error);
      font-weight: 600;
    }
    .payee {
      margin: 0;
      font-size: var(--att-type-body-size);
      font-weight: 500;
      color: var(--att-color-text);
    }
    :host([data-severity="paid"]) .payee {
      color: var(--att-color-text-muted);
      text-decoration: line-through;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--att-space-2);
      align-items: center;
      margin-top: var(--att-space-1);
    }
    .cadence {
      font-size: var(--att-type-label-size);
      color: var(--att-color-text-muted);
    }
    .amount {
      text-align: right;
    }
  `;
  connectedCallback() {
    super.connectedCallback();
    this.syncSeverity();
  }
  updated(changed) {
    if (changed.has("status")) {
      this.syncSeverity();
    }
  }
  syncSeverity() {
    const severity = this.status === "overdue" ? "overdue" : this.status === "paid" ? "paid" : "default";
    this.dataset.severity = severity;
  }
  statusChip() {
    switch (this.status) {
      case "overdue":
        return b2`<att-chip tone="error">Overdue</att-chip>`;
      case "due_soon":
        return b2`<att-chip tone="warning">Due soon</att-chip>`;
      case "paid":
        return b2`<att-chip tone="success">Paid</att-chip>`;
      case "scheduled":
        return b2`<att-chip tone="info">Scheduled</att-chip>`;
      default:
        return "";
    }
  }
  dueLabel() {
    if (!this.dueDate) return "\u2014";
    if (/^\d{4}-\d{2}-\d{2}/.test(this.dueDate)) {
      return formatShortDate(this.dueDate);
    }
    return this.dueDate;
  }
  render() {
    const moneyTone = this.status === "paid" ? "muted" : this.status === "overdue" ? "outflow" : "neutral";
    return b2`
      <div class="row" part="row">
        <div class="due" part="due">${this.dueLabel()}</div>
        <div class="main">
          <p class="payee" part="payee">${this.payee || "Obligation"}</p>
          <div class="meta">
            ${this.statusChip()}
            ${this.autopay ? b2`<att-chip tone="info">Autopay</att-chip>` : ""}
            ${this.cadence ? b2`<span class="cadence">${this.cadence}</span>` : ""}
            ${this.provenance ? b2`<att-chip tone="neutral">${this.provenance}</att-chip>` : ""}
          </div>
        </div>
        <div class="amount" part="amount">
          <att-money
            .amount=${this.amount}
            .tone=${moneyTone}
            sign="never"
          ></att-money>
        </div>
      </div>
    `;
  }
};
if (!customElements.get("att-obligation-row")) {
  customElements.define("att-obligation-row", AttObligationRow);
}

// src/att-runway-chart.ts
var AttRunwayChart = class extends i4 {
  static properties = {
    seriesJson: { type: String, attribute: "series-json" },
    runwayDays: { type: Number, attribute: "runway-days" },
    height: { type: Number }
  };
  seriesJson = "[]";
  runwayDays = 30;
  height = 160;
  static styles = i`
    :host {
      display: block;
    }
    .chart-wrap {
      background: var(--att-color-surface);
      border: var(--att-border-thin) solid var(--att-color-outline);
      border-radius: var(--att-radius-lg);
      padding: var(--att-space-4);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: var(--att-space-3);
    }
    .title {
      margin: 0;
      font-size: var(--att-type-label-size);
      font-weight: var(--att-type-label-weight);
      letter-spacing: var(--att-type-label-tracking);
      text-transform: uppercase;
      color: var(--att-color-text-subtle);
    }
    .runway {
      font-size: var(--att-type-label-size);
      color: var(--att-color-text-muted);
      font-family: var(--att-font-mono);
    }
    svg {
      width: 100%;
      height: var(--chart-h, 160px);
      display: block;
    }
    .empty {
      padding: var(--att-space-8);
      text-align: center;
      color: var(--att-color-text-muted);
      font-size: var(--att-type-body-size);
    }
    .axis-label {
      font-size: 10px;
      fill: var(--att-color-text-subtle);
      font-family: var(--att-font-mono);
    }
  `;
  parseSeries() {
    try {
      const data = JSON.parse(this.seriesJson);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }
  renderChart(series) {
    const w2 = 600;
    const h3 = this.height;
    const pad = { t: 8, r: 12, b: 28, l: 48 };
    const innerW = w2 - pad.l - pad.r;
    const innerH = h3 - pad.t - pad.b;
    const balances = series.map((p3) => p3.balanceUsd);
    const minB = Math.min(0, ...balances);
    const maxB = Math.max(...balances, 1);
    const range = maxB - minB || 1;
    const x2 = (i5) => pad.l + i5 / Math.max(series.length - 1, 1) * innerW;
    const y3 = (v2) => pad.t + innerH - (v2 - minB) / range * innerH;
    const points = series.map((p3, i5) => `${x2(i5)},${y3(p3.balanceUsd)}`).join(" ");
    const zeroY = y3(0);
    const dueMarkers = series.map(
      (p3, i5) => p3.obligationsDueUsd > 0 ? b2`<circle cx="${x2(i5)}" cy="${y3(p3.balanceUsd)}" r="3" fill="var(--att-color-warning)" />` : ""
    );
    const firstLabel = series[0]?.date.slice(5) ?? "";
    const lastLabel = series[series.length - 1]?.date.slice(5) ?? "";
    return b2`
      <svg viewBox="0 0 ${w2} ${h3}" role="img" aria-label="30-day runway projection">
        <line
          x1="${pad.l}"
          y1="${zeroY}"
          x2="${w2 - pad.r}"
          y2="${zeroY}"
          stroke="var(--att-color-error)"
          stroke-opacity="0.35"
          stroke-dasharray="4 4"
        />
        <polyline
          points="${points}"
          fill="none"
          stroke="var(--att-color-primary)"
          stroke-width="2"
          stroke-linejoin="round"
        />
        ${dueMarkers}
        <text class="axis-label" x="${pad.l}" y="${h3 - 6}">${firstLabel}</text>
        <text class="axis-label" x="${w2 - pad.r}" y="${h3 - 6}" text-anchor="end">${lastLabel}</text>
        <text class="axis-label" x="${pad.l - 6}" y="${pad.t + 4}" text-anchor="end">
          $${Math.round(maxB).toLocaleString()}
        </text>
      </svg>
    `;
  }
  render() {
    const series = this.parseSeries();
    if (!series.length) {
      return b2`
        <div class="chart-wrap">
          <p class="empty">Add a funding account to see your runway.</p>
        </div>
      `;
    }
    const solvent = this.runwayDays >= series.length;
    const runwayLabel = solvent ? `${series.length}d+ solvent` : `${this.runwayDays}d runway`;
    return b2`
      <div class="chart-wrap" style="--chart-h: ${this.height}px">
        <div class="header">
          <h4 class="title">30-day projection</h4>
          <span class="runway">${runwayLabel}</span>
        </div>
        ${this.renderChart(series)}
      </div>
    `;
  }
};
if (!customElements.get("att-runway-chart")) {
  customElements.define("att-runway-chart", AttRunwayChart);
}

// src/att-select.ts
var AttSelect = class extends i4 {
  static properties = {
    label: { type: String },
    value: { type: String }
  };
  label = "";
  value = "";
  static styles = i`
    :host { display: block; }
    label {
      display: block;
      font-size: var(--att-type-label-size);
      font-weight: var(--att-type-label-weight);
      color: var(--att-color-text-muted);
      margin-bottom: var(--att-space-2);
    }
    select {
      width: 100%;
      box-sizing: border-box;
      font-family: var(--att-font-sans);
      font-size: var(--att-type-body-size);
      color: var(--att-color-text);
      background: var(--att-color-bg);
      border: var(--att-border-thin) solid var(--att-color-outline);
      border-radius: var(--att-radius-md);
      padding: var(--att-space-3) var(--att-space-4);
      outline: none;
    }
    select:focus {
      border-color: var(--att-color-primary);
      box-shadow: var(--att-shadow-focus);
    }
  `;
  onChange(e4) {
    this.value = e4.target.value;
    this.dispatchEvent(
      new CustomEvent("att-change", {
        detail: { value: this.value },
        bubbles: true,
        composed: true
      })
    );
  }
  render() {
    return b2`
      ${this.label ? b2`<label>${this.label}</label>` : ""}
      <select .value=${this.value} @change=${this.onChange}>
        <slot></slot>
      </select>
    `;
  }
};
if (!customElements.get("att-select")) customElements.define("att-select", AttSelect);

// src/att-stat.ts
var AttStat = class extends i4 {
  static properties = {
    label: { type: String },
    value: { type: String },
    unit: { type: String },
    helper: { type: String },
    tone: { type: String }
  };
  label = "";
  value = "";
  unit = "";
  helper = "";
  tone = "neutral";
  static styles = i`
    :host {
      display: block;
    }
    .stat {
      padding: var(--att-space-4) var(--att-space-5);
      background: var(--att-color-surface);
      border: var(--att-border-thin) solid var(--att-color-outline);
      border-radius: var(--att-radius-lg);
      box-shadow: var(--att-shadow-sm);
    }
    .label {
      margin: 0;
      font-size: var(--att-type-label-size);
      font-weight: var(--att-type-label-weight);
      letter-spacing: var(--att-type-label-tracking);
      text-transform: uppercase;
      color: var(--att-color-text-subtle);
    }
    .value-row {
      display: flex;
      align-items: baseline;
      gap: var(--att-space-2);
      margin-top: var(--att-space-2);
    }
    .value {
      font-size: var(--att-type-display-size);
      font-weight: var(--att-type-display-weight);
      line-height: 1;
      color: var(--stat-color, var(--att-color-text));
      font-variant-numeric: tabular-nums;
    }
    .unit {
      font-size: var(--att-type-body-size);
      color: var(--att-color-text-muted);
      font-weight: 500;
    }
    .helper {
      margin: var(--att-space-2) 0 0;
      font-size: var(--att-type-label-size);
      color: var(--att-color-text-muted);
    }
    .neutral { --stat-color: var(--att-color-text); }
    .good { --stat-color: var(--att-color-success); }
    .warn { --stat-color: var(--att-color-warning); }
    .bad { --stat-color: var(--att-color-error); }
  `;
  render() {
    return b2`
      <div class="stat ${this.tone}" part="stat">
        <p class="label" part="label">${this.label}</p>
        <div class="value-row">
          <span class="value ${this.tone}" part="value">${this.value}</span>
          ${this.unit ? b2`<span class="unit" part="unit">${this.unit}</span>` : ""}
        </div>
        ${this.helper ? b2`<p class="helper" part="helper">${this.helper}</p>` : ""}
      </div>
    `;
  }
};
if (!customElements.get("att-stat")) {
  customElements.define("att-stat", AttStat);
}

// src/att-toggle.ts
var AttToggle = class extends i4 {
  static properties = {
    checked: { type: Boolean, reflect: true },
    disabled: { type: Boolean },
    label: { type: String }
  };
  checked = false;
  disabled = false;
  label = "";
  static styles = i`
    :host { display: inline-block; }
    label {
      display: inline-flex;
      align-items: center;
      gap: var(--att-space-3);
      cursor: pointer;
      font-size: var(--att-type-body-size);
      color: var(--att-color-text);
    }
    .track {
      width: 2.5rem;
      height: 1.375rem;
      border-radius: 999px;
      background: var(--att-color-outline);
      position: relative;
      transition: background var(--att-motion-fast);
    }
    .thumb {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 1rem;
      height: 1rem;
      border-radius: 50%;
      background: #fff;
      transition: transform var(--att-motion-fast);
    }
    input {
      position: absolute;
      opacity: 0;
      width: 0;
      height: 0;
    }
    input:checked + .track {
      background: var(--att-color-primary);
    }
    input:checked + .track .thumb {
      transform: translateX(1.125rem);
    }
    input:focus-visible + .track {
      box-shadow: var(--att-shadow-focus);
    }
  `;
  onChange(e4) {
    this.checked = e4.target.checked;
    this.dispatchEvent(
      new CustomEvent("att-change", {
        detail: { checked: this.checked },
        bubbles: true,
        composed: true
      })
    );
  }
  render() {
    return b2`
      <label>
        <input
          type="checkbox"
          role="switch"
          .checked=${this.checked}
          ?disabled=${this.disabled}
          @change=${this.onChange}
        />
        <span class="track"><span class="thumb"></span></span>
        <span>${this.label}</span>
      </label>
    `;
  }
};
if (!customElements.get("att-toggle")) customElements.define("att-toggle", AttToggle);

// src/att-transaction-row.ts
var AttTransactionRow = class extends i4 {
  static properties = {
    payee: { type: String },
    date: { type: String },
    amount: { type: Number },
    category: { type: String },
    account: { type: String },
    pending: { type: Boolean, reflect: true },
    selected: { type: Boolean, reflect: true }
  };
  payee = "";
  /** ISO date string or pre-formatted label. */
  date = "";
  /** USD; negative = outflow. */
  amount = 0;
  category = "";
  account = "";
  pending = false;
  selected = false;
  static styles = i`
    :host {
      display: block;
    }
    .row {
      display: grid;
      grid-template-columns: 3.5rem 1fr auto;
      gap: var(--att-space-3);
      align-items: center;
      padding: var(--att-space-3) var(--att-space-4);
      background: var(--att-color-surface);
      transition: background var(--att-motion-fast);
    }
    :host([selected]) .row {
      background: var(--att-color-surface-raised);
      box-shadow: inset 3px 0 0 var(--att-color-primary);
    }
    .date {
      font-size: var(--att-type-label-size);
      color: var(--att-color-text-subtle);
      line-height: 1.2;
    }
    .main {
      min-width: 0;
    }
    .payee {
      margin: 0;
      font-size: var(--att-type-body-size);
      font-weight: 500;
      color: var(--att-color-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--att-space-2);
      align-items: center;
      margin-top: var(--att-space-1);
    }
    .account {
      font-size: var(--att-type-label-size);
      color: var(--att-color-text-muted);
    }
    .amount {
      text-align: right;
    }
    :host([pending]) .payee {
      color: var(--att-color-text-muted);
    }
  `;
  dateLabel() {
    if (!this.date) return "\u2014";
    if (/^\d{4}-\d{2}-\d{2}/.test(this.date)) {
      return formatShortDate(this.date);
    }
    return this.date;
  }
  render() {
    return b2`
      <div class="row" part="row">
        <div class="date" part="date">${this.dateLabel()}</div>
        <div class="main">
          <p class="payee" part="payee">${this.payee || "Unknown"}</p>
          <div class="meta">
            ${this.category ? b2`<att-chip tone="neutral">${this.category}</att-chip>` : ""}
            ${this.pending ? b2`<att-chip tone="warning">Pending</att-chip>` : ""}
            ${this.account ? b2`<span class="account">${this.account}</span>` : ""}
          </div>
        </div>
        <div class="amount" part="amount">
          <att-money
            .amount=${this.amount}
            .tone=${this.pending ? "pending" : "neutral"}
            sign="auto"
          ></att-money>
        </div>
      </div>
    `;
  }
};
if (!customElements.get("att-transaction-row")) {
  customElements.define("att-transaction-row", AttTransactionRow);
}

// src/att-position-row.ts
var AttPositionRow = class extends i4 {
  static properties = {
    symbol: { type: String },
    account: { type: String },
    units: { type: Number },
    price: { type: Number },
    marketValue: { type: Number }
  };
  symbol = "";
  account = "";
  units = 0;
  price = 0;
  marketValue = 0;
  static styles = i`
    :host {
      display: block;
    }
    .row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: var(--att-space-4);
      align-items: center;
      padding: var(--att-space-3) var(--att-space-4);
      background: var(--att-color-surface);
    }
    .symbol {
      margin: 0;
      font-family: var(--att-font-mono);
      font-size: var(--att-type-body-size);
      font-weight: 600;
      color: var(--att-color-text);
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--att-space-2);
      align-items: center;
      margin-top: var(--att-space-1);
      font-size: var(--att-type-label-size);
      color: var(--att-color-text-muted);
    }
    .value {
      text-align: right;
    }
    .value-label {
      display: block;
      font-size: var(--att-type-label-size);
      color: var(--att-color-text-subtle);
      text-transform: uppercase;
      letter-spacing: var(--att-type-label-tracking);
      margin-bottom: var(--att-space-1);
    }
  `;
  render() {
    const unitsLabel = this.units === 1 ? "1 share" : `${this.units.toLocaleString("en-US")} shares`;
    return b2`
      <div class="row" part="row">
        <div>
          <p class="symbol" part="symbol">${this.symbol || "\u2014"}</p>
          <div class="meta">
            <span>${unitsLabel} @ $${this.price.toFixed(2)}</span>
            ${this.account ? b2`<att-chip tone="neutral">${this.account}</att-chip>` : ""}
          </div>
        </div>
        <div class="value" part="value">
          <span class="value-label">Market value</span>
          <att-money .amount=${this.marketValue} size="lg" tone="neutral" sign="never"></att-money>
        </div>
      </div>
    `;
  }
};
if (!customElements.get("att-position-row")) {
  customElements.define("att-position-row", AttPositionRow);
}

// src/att-cashflow-bar.ts
var AttCashflowBar = class extends i4 {
  static properties = {
    bucketsJson: { type: String, attribute: "buckets-json" },
    emptyHint: { type: String, attribute: "empty-hint" }
  };
  bucketsJson = "[]";
  emptyHint = "No posted transactions in this window.";
  static styles = i`
    :host {
      display: block;
    }
    .wrap {
      background: var(--att-color-surface);
      border: var(--att-border-thin) solid var(--att-color-outline);
      border-radius: var(--att-radius-lg);
      padding: var(--att-space-4);
    }
    .title {
      margin: 0 0 var(--att-space-4);
      font-size: var(--att-type-label-size);
      font-weight: var(--att-type-label-weight);
      letter-spacing: var(--att-type-label-tracking);
      text-transform: uppercase;
      color: var(--att-color-text-subtle);
    }
    .empty {
      padding: var(--att-space-8);
      text-align: center;
      color: var(--att-color-text-muted);
      font-size: var(--att-type-body-size);
    }
    .row {
      display: grid;
      grid-template-columns: 8rem 1fr auto;
      gap: var(--att-space-3);
      align-items: center;
      margin-bottom: var(--att-space-3);
    }
    .cat {
      font-size: var(--att-type-label-size);
      color: var(--att-color-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .track {
      height: 10px;
      background: var(--att-color-surface-raised);
      border-radius: var(--att-radius-sm);
      overflow: hidden;
    }
    .fill {
      height: 100%;
      background: var(--att-color-primary);
      border-radius: var(--att-radius-sm);
    }
    .amt {
      font-family: var(--att-font-mono);
      font-size: var(--att-type-mono-size);
      color: var(--att-color-text);
      font-variant-numeric: tabular-nums;
    }
  `;
  parseBuckets() {
    try {
      const data = JSON.parse(this.bucketsJson);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }
  render() {
    const buckets = this.parseBuckets();
    if (buckets.length === 0) {
      return b2`<div class="wrap"><p class="empty">${this.emptyHint}</p></div>`;
    }
    const maxOut = Math.max(...buckets.map((b3) => b3.outflowUsd), 1);
    return b2`
      <div class="wrap" part="chart">
        <p class="title">Outflow by category</p>
        ${buckets.map((b3) => {
      const pct = Math.max(2, Math.round(b3.outflowUsd / maxOut * 100));
      const label = b3.outflowUsd > 0 ? `$${b3.outflowUsd.toFixed(2)}` : `+$${b3.inflowUsd.toFixed(2)}`;
      return b2`
            <div class="row">
              <span class="cat" title=${b3.category}>${b3.category}</span>
              <div class="track">
                <div class="fill" style="width:${b3.outflowUsd > 0 ? pct : 0}%"></div>
              </div>
              <span class="amt">${label}</span>
            </div>
          `;
    })}
      </div>
    `;
  }
};
if (!customElements.get("att-cashflow-bar")) {
  customElements.define("att-cashflow-bar", AttCashflowBar);
}

// src/att-cashflow-trend.ts
var AttCashflowTrend = class extends i4 {
  static properties = {
    seriesJson: { type: String, attribute: "series-json" },
    emptyHint: { type: String, attribute: "empty-hint" },
    height: { type: Number }
  };
  seriesJson = "[]";
  emptyHint = "No posted spend in this window to chart.";
  height = 120;
  static styles = i`
    :host {
      display: block;
    }
    .wrap {
      background: var(--att-color-surface);
      border: var(--att-border-thin) solid var(--att-color-outline);
      border-radius: var(--att-radius-lg);
      padding: var(--att-space-4);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: var(--att-space-3);
    }
    .title {
      margin: 0;
      font-size: var(--att-type-label-size);
      font-weight: var(--att-type-label-weight);
      letter-spacing: var(--att-type-label-tracking);
      text-transform: uppercase;
      color: var(--att-color-text-subtle);
    }
    .empty {
      padding: var(--att-space-8);
      text-align: center;
      color: var(--att-color-text-muted);
      font-size: var(--att-type-body-size);
    }
    svg {
      width: 100%;
      height: var(--chart-h, 120px);
      display: block;
    }
    .axis-label {
      font-size: 10px;
      fill: var(--att-color-text-subtle);
      font-family: var(--att-font-mono);
    }
  `;
  parseSeries() {
    try {
      const data = JSON.parse(this.seriesJson);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }
  renderChart(series) {
    const w2 = 600;
    const h3 = this.height;
    const pad = { t: 8, r: 12, b: 28, l: 48 };
    const innerW = w2 - pad.l - pad.r;
    const innerH = h3 - pad.t - pad.b;
    const values = series.map((p3) => p3.outflowUsd);
    const maxB = Math.max(...values, 1);
    const x2 = (i5) => pad.l + i5 / Math.max(series.length - 1, 1) * innerW;
    const y3 = (v2) => pad.t + innerH - v2 / maxB * innerH;
    const points = series.map((p3, i5) => `${x2(i5)},${y3(p3.outflowUsd)}`).join(" ");
    const firstLabel = series[0]?.date.slice(5) ?? "";
    const lastLabel = series[series.length - 1]?.date.slice(5) ?? "";
    return b2`
      <svg viewBox="0 0 ${w2} ${h3}" role="img" aria-label="Daily outflow in this window">
        <polyline
          points="${points}"
          fill="none"
          stroke="var(--att-color-primary)"
          stroke-width="2"
          stroke-linejoin="round"
        />
        <text class="axis-label" x="${pad.l}" y="${h3 - 6}">${firstLabel}</text>
        <text class="axis-label" x="${w2 - pad.r}" y="${h3 - 6}" text-anchor="end">${lastLabel}</text>
        <text class="axis-label" x="${pad.l - 6}" y="${pad.t + 4}" text-anchor="end">
          $${Math.round(maxB).toLocaleString()}
        </text>
      </svg>
    `;
  }
  render() {
    const series = this.parseSeries();
    if (series.length === 0) {
      return b2`<div class="wrap"><p class="empty">${this.emptyHint}</p></div>`;
    }
    return b2`
      <div class="wrap" style="--chart-h: ${this.height}px" part="chart">
        <div class="header">
          <p class="title">Daily outflow</p>
        </div>
        ${this.renderChart(series)}
      </div>
    `;
  }
};
if (!customElements.get("att-cashflow-trend")) {
  customElements.define("att-cashflow-trend", AttCashflowTrend);
}

// src/att-wizard-steps.ts
var AttWizardSteps = class extends i4 {
  static properties = {
    current: { type: Number },
    total: { type: Number },
    labels: { type: String }
  };
  current = 1;
  total = 5;
  labels = "Household,Find mail,Connect,Account,Bills";
  static styles = i`
    :host {
      display: block;
    }
    ol {
      display: flex;
      gap: var(--att-space-2);
      list-style: none;
      margin: 0 0 var(--att-space-6);
      padding: 0;
    }
    li {
      flex: 1;
      text-align: center;
      font-size: var(--att-type-label-size);
      font-weight: 600;
      padding: var(--att-space-2) var(--att-space-3);
      border-radius: var(--att-radius-md);
      color: var(--att-color-text-subtle);
      background: var(--att-color-surface);
      border: var(--att-border-thin) solid var(--att-color-outline);
    }
    li.active {
      color: var(--att-color-on-primary);
      background: var(--att-color-primary);
      border-color: var(--att-color-primary);
    }
    li.done {
      color: var(--att-color-success);
      border-color: var(--att-color-success);
    }
  `;
  render() {
    const items = this.labels.split(",").map((s4) => s4.trim()).filter(Boolean);
    const total = this.total > 0 ? this.total : items.length;
    return b2`
      <ol part="steps">
        ${items.slice(0, total).map(
      (label, i5) => b2`
            <li class="${i5 + 1 === this.current ? "active" : i5 + 1 < this.current ? "done" : ""}">
              ${label}
            </li>
          `
    )}
      </ol>
    `;
  }
};
if (!customElements.get("att-wizard-steps")) {
  customElements.define("att-wizard-steps", AttWizardSteps);
}
export {
  AttAccountRow,
  AttBadge,
  AttButton,
  AttCard,
  AttCashflowBar,
  AttCashflowTrend,
  AttCheckbox,
  AttChip,
  AttCostReceipt,
  AttInput,
  AttList,
  AttMoney,
  AttObligationRow,
  AttObligationTimeline,
  AttPositionRow,
  AttRunwayChart,
  AttSelect,
  AttStat,
  AttToggle,
  AttTransactionRow,
  AttWizardSteps,
  formatMoneyCents,
  formatMoneyUsd,
  formatShortDate
};
/*! Bundled license information:

@lit/reactive-element/css-tag.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/reactive-element.js:
lit-html/lit-html.js:
lit-element/lit-element.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/is-server.js:
  (**
   * @license
   * Copyright 2022 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)
*/
