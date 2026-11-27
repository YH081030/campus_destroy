/* ============================================================
 * 输入 —— 键盘/鼠标/指针锁定 + 手机触控
 * 触控：左摇杆移动（固定）、右摇杆瞄准+推到底自动开火（固定）、按钮
 * ============================================================ */
"use strict";
const Input = {
  keys: {}, pressed: {},
  vkeys: {}, vpressed: {},   // 虚拟按键（触屏按钮）
  mouseDX: 0, mouseDY: 0,
  fireDown: false, fireEdge: false, adsDown: false, adsEdge: false,
  wheelDelta: 0,
  locked: false,
  canvas: null,
  onLock: null, onUnlock: null,
  isTouch: false,
  // 触控状态
  vj: {x:0, z:0}, aj: {x:0, y:0},
  autoFire: false,
  _aimFired: false, _joyFull: false, _aimFiring: false, _aimWasFiring: false,
  _moveId: null, _aimId: null, _mo: null, _ao: null,

  init(canvas){
    this.canvas = canvas;
    this.isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) ||
      (new URLSearchParams(location.search).get("mobile") === "1");
    window.addEventListener("keydown", e => {
      if (!this.keys[e.code]) this.pressed[e.code] = true;
      this.keys[e.code] = true;
      if (["Space","Tab","KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code)) e.preventDefault();
    });
    window.addEventListener("keyup", e => { this.keys[e.code] = false; });
    window.addEventListener("blur", () => { this.keys = {}; this.fireDown = false; });
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.locked){ this.onLock && this.onLock(); } else { this.onUnlock && this.onUnlock(); }
    });
    document.addEventListener("mousemove", e => {
      if (this.locked){ this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    });
    document.addEventListener("mousedown", e => {
      if (!this.locked) return;
      if (e.button === 0){ this.fireDown = true; this.fireEdge = true; }
      if (e.button === 2){ this.adsDown = true; this.adsEdge = true; }
    });
    document.addEventListener("mouseup", e => {
      if (e.button === 0) this.fireDown = false;
      if (e.button === 2) this.adsDown = false;
    });
    document.addEventListener("contextmenu", e => e.preventDefault());
    document.addEventListener("wheel", e => { this.wheelDelta += e.deltaY; }, {passive:true});
    // 防双击缩放/长按菜单
    canvas.addEventListener("touchstart", e=>{ if (e.touches.length > 1) e.preventDefault(); }, {passive:false});
    document.addEventListener("dblclick", e=>{ if (this.isTouch) e.preventDefault(); }, {passive:false});

    if (this.isTouch) this.initTouch();
  },

  /* ---------- 触控（固定摇杆 + 按钮） ---------- */
  initTouch(){
    const J = this;
    const closeMenus = ()=>{
      const f = document.getElementById("func-menu");
      const s = document.getElementById("skill-menu");
      if (f) f.classList.add("hidden");
      if (s) s.classList.add("hidden");
    };
    const toggleMenu = (id)=>{
      const el = document.getElementById(id);
      if (!el) return;
      const other = id === "func-menu" ? "skill-menu" : "func-menu";
      const o = document.getElementById(other);
      if (o) o.classList.add("hidden");
      el.classList.toggle("hidden");
    };
    const bindBtn = (id, code, onDown, onUp)=>{
      const el = document.getElementById(id);
      if (!el) return;
      const down = (e)=>{
        e.preventDefault();
        Audio.init(); Audio.resume();
        if (code){
          if (!J.vkeys[code]) J.vpressed[code] = true;
          J.vkeys[code] = true;
        }
        if (onDown) onDown();
      };
      const up = (e)=>{
        e.preventDefault();
        if (code) J.vkeys[code] = false;
        if (onUp) onUp();
      };
      el.addEventListener("touchstart", down, {passive:false});
      el.addEventListener("touchend", up, {passive:false});
      el.addEventListener("touchcancel", up, {passive:false});
      el.addEventListener("mousedown", down);
      el.addEventListener("mouseup", up);
      el.addEventListener("mouseleave", up);
    };
    bindBtn("tb-fire", null, ()=>{ J.fireDown = true; J.fireEdge = true; }, ()=>{ J.fireDown = false; });
    bindBtn("tb-func", null, ()=>toggleMenu("func-menu"));
    bindBtn("tb-skill", null, ()=>toggleMenu("skill-menu"));
    bindBtn("tb-ads", null, ()=>{ J.adsDown = !J.adsDown; J.adsEdge = true; closeMenus(); }, null);
    bindBtn("tb-jump", "Space");
    bindBtn("tb-prone", "ControlLeft");
    bindBtn("tb-hover", "Tab");
    bindBtn("tb-teleport", "Backquote", ()=>closeMenus());
    bindBtn("tb-grenade", "KeyG");
    bindBtn("tb-use", "KeyF");
    bindBtn("tb-mount", "KeyE");
    bindBtn("tb-cycle", "KeyQ");
    bindBtn("tb-shop", "KeyB", ()=>closeMenus());
    bindBtn("tb-pause", "Escape", ()=>closeMenus());
    bindBtn("tb-hide", "KeyH");
    bindBtn("tb-show", "KeyH");
    J._closeMenus = closeMenus;

    // 开火键：短按=单发，长按=连发
    const fireEl = document.getElementById("tb-fire");
    if (fireEl){
      let fireActive = false, fireTimer = 0, fireHeld = false;
      fireEl.addEventListener("pointerdown", (e)=>{
        e.preventDefault();
        Audio.init(); Audio.resume();
        fireActive = true;
        fireHeld = false;
        J.fireEdge = true; // 单发
        fireTimer = setTimeout(()=>{ if (fireActive){ fireHeld = true; J.fireDown = true; } }, 220); // 长按→连发
        try{ fireEl.setPointerCapture(e.pointerId); }catch(err){}
      });
      const fireUp = ()=>{
        if (!fireActive) return;
        fireActive = false;
        clearTimeout(fireTimer);
        J.fireDown = false;
      };
      fireEl.addEventListener("pointerup", fireUp);
      fireEl.addEventListener("pointercancel", fireUp);
    }

    // 摇杆：视觉固定，实际以"触摸起点"为原点（全半屏响应）
    // 左半屏任意处按住拖动=移动；右半屏任意处按住拖动=转动视角（拖出60px=自动开火）
    window.addEventListener("pointerdown", (e)=>{
      if (e.target && e.target.closest && e.target.closest(".tbtn, .panel, .overlay")) return; // 按钮/面板自处理
      if (G.state !== "run" || G.paused) return;
      if (e.clientX < innerWidth*0.5){
        if (J._moveId !== null && J._moveId !== undefined) return;
        J._moveId = e.pointerId;
        J._mo = {x:e.clientX, y:e.clientY};
        J._setKnob("joyknob", 0, 0);
      } else {
        if (J._aimId !== null && J._aimId !== undefined) return;
        J._aimId = e.pointerId;
        J._ao = {x:e.clientX, y:e.clientY, lx:e.clientX, ly:e.clientY};
      }
    });
    window.addEventListener("pointermove", (e)=>{
      if (e.pointerId === J._moveId){
        const dx = e.clientX - J._mo.x, dy = e.clientY - J._mo.y;
        const d = Math.hypot(dx, dy);
        const max = 62;
        const cx = d > max ? dx/d*max : dx, cy = d > max ? dy/d*max : dy;
        J.vj.x = cx/max;
        J.vj.z = -cy/max;   // 上=前进 下=后退 左=左移 右=右移（相对镜头朝向）
        J._setKnob("joyknob", cx, cy);
      } else if (e.pointerId === J._aimId){
        J.mouseDX += (e.clientX - J._ao.lx) * 2.6;
        J.mouseDY += (e.clientY - J._ao.ly) * 2.6;
        J._ao.lx = e.clientX; J._ao.ly = e.clientY;
        const d0 = Math.hypot(e.clientX - J._ao.x, e.clientY - J._ao.y);
        J._aimFiring = d0 > 60;
        const dx = e.clientX - J._ao.x, dy = e.clientY - J._ao.y;
        const d = Math.hypot(dx, dy);
        const max = 62;
        const cx = d > max ? dx/d*max : dx, cy = d > max ? dy/d*max : dy;
        J._setKnob("ajoyknob", cx, cy);
      }
    });
    const stickUp = (e)=>{
      if (e.pointerId === J._moveId){
        J._moveId = null;
        J.vj.x = 0; J.vj.z = 0;
        J._setKnob("joyknob", 0, 0);
      } else if (e.pointerId === J._aimId){
        J._aimId = null;
        J._aimFiring = false;
        J._setKnob("ajoyknob", 0, 0);
      }
    };
    window.addEventListener("pointerup", stickUp);
    window.addEventListener("pointercancel", stickUp);
  },
  _setKnob(id, dx, dy){
    const k = document.getElementById(id);
    if (k) k.style.transform = `translate(${dx}px, ${dy}px)`;
  },
  /* 每帧轮询：连发开关、瞄准拖出开火、满推冲刺 */
  poll(dt){
    if (!this.isTouch) return;
    if (this.autoFire) this.fireDown = true;
    if (this._aimFiring){
      if (!this._aimWasFiring) this.fireEdge = true;
      this.fireDown = true;
    } else if (!this.autoFire){
      this.fireDown = false; // 松开瞄准拖拽后停止开火
    }
    this._aimWasFiring = !!this._aimFiring;
    const mv = Math.hypot(this.vj.x, this.vj.z);
    this._joyFull = mv > 0.92;
  },
  updateFireBtn(){
    const el = document.getElementById("tb-fire");
    if (!el) return;
    el.classList.toggle("auto-on", this.autoFire);
    el.textContent = this.autoFire ? "连发" : "开火";
  },

  requestLock(){
    if (this.isTouch) return;
    if (!this.locked && Game.state==="run"){
      this.canvas.requestPointerLock && this.canvas.requestPointerLock();
    }
  },
  endFrame(){
    this.mouseDX = 0; this.mouseDY = 0;
    this.fireEdge = false; this.adsEdge = false;
    this.wheelDelta = 0;
    this.pressed = {};
    this.vpressed = {};
  },
  key(code){ return !!(this.keys[code] || this.vkeys[code]); },
  keyPressed(code){ return !!(this.pressed[code] || this.vpressed[code]); },
  sprintHeld(){ return this.key("ShiftLeft") || this._joyFull; },
  axisZ(){
    let v = (this.key("KeyW")?1:0) - (this.key("KeyS")?1:0);
    if (this.vj.z !== 0) v = this.vj.z;
    return v;
  },
  axisX(){
    let v = (this.key("KeyD")?1:0) - (this.key("KeyA")?1:0);
    if (this.vj.x !== 0) v = this.vj.x;
    return v;
  },
};
