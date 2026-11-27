/* ============================================================
 * 账号注册/登录 + 云端排行榜
 * 存储：extendsclass json-storage（CORS开放、免服务器）
 * 账号密码仅存加盐哈希；排行榜按破坏价值降序
 * ============================================================ */
"use strict";
const GAuth = window.GAuth = {
  API: CFG.LEADERBOARD_API,
  user: null,

  init(){
    try{ this.user = JSON.parse(localStorage.getItem("ga_user") || "null"); }catch(e){ this.user = null; }
  },
  setUser(name){
    this.user = {name};
    try{ localStorage.setItem("ga_user", JSON.stringify(this.user)); }catch(e){}
  },
  logout(){
    this.user = null;
    try{ localStorage.removeItem("ga_user"); }catch(e){}
  },

  /* ---------- 工具 ---------- */
  async sha(str){
    if (window.crypto && crypto.subtle){
      try{
        const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
        return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
      }catch(e){}
    }
    let h = 5381;
    for (let i=0;i<str.length;i++) h = ((h*33) ^ str.charCodeAt(i)) >>> 0;
    return h.toString(16);
  },
  // 响应以 JSON 开头、可能带 HTML 尾巴，提取前缀 JSON
  _clean(text){
    if (!text) return null;
    const i = text.indexOf("<");
    const s = (i >= 0 ? text.slice(0, i) : text).trim();
    if (!s) return null;
    try{ return JSON.parse(s); }catch(e){
      // 提取第一个平衡的大括号块
      let depth = 0, start = -1;
      for (let k=0;k<s.length;k++){
        if (s[k] === "{"){ if (start < 0) start = k; depth++; }
        else if (s[k] === "}"){ depth--; if (depth === 0){ try{ return JSON.parse(s.slice(start, k+1)); }catch(e2){ return null; } } }
      }
      return null;
    }
  },
  async _get(){
    const r = await fetch(this.API, {cache:"no-store"});
    if (!r.ok) throw new Error("http " + r.status);
    return this._clean(await r.text());
  },
  async _put(data){
    const r = await fetch(this.API, {
      method:"PUT",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error("http " + r.status);
    return this._clean(await r.text());
  },

  /* ---------- 账号 ---------- */
  validName(n){ return /^[\u4e00-\u9fa5A-Za-z0-9_]{2,16}$/.test(String(n).trim()); },
  async register(name, pw){
    name = String(name).trim();
    if (!this.validName(name)) return {ok:false, msg:"用户名需2-16位（中英文/数字/下划线）"};
    if (String(pw).length < 4) return {ok:false, msg:"密码至少4位"};
    const salt = Math.random().toString(36).slice(2, 12);
    const rec = salt + ":" + await this.sha(salt + ":" + pw);
    try{
      const doc = (await this._get()) || {};
      const users = doc.users || {};
      if (users[name]) return {ok:false, msg:"用户名已存在"};
      users[name] = rec;
      doc.users = users;
      await this._put(doc);
    }catch(e){
      // 云端不可用：仅本地注册
      const accounts = this.localAccounts();
      if (accounts[name]) return {ok:false, msg:"用户名已存在"};
      accounts[name] = rec;
      try{ localStorage.setItem("ga_accounts", JSON.stringify(accounts)); }catch(e2){}
    }
    this.setUser(name);
    return {ok:true};
  },
  async login(name, pw){
    name = String(name).trim();
    let rec = null;
    try{
      const doc = await this._get();
      rec = doc && doc.users ? doc.users[name] : null;
      if (!rec){
        // 云端没有 → 尝试本地
        rec = this.localAccounts()[name];
      }
    }catch(e){
      rec = this.localAccounts()[name];
    }
    if (!rec) return {ok:false, msg:"用户名或密码错误"};
    const parts = rec.split(":");
    if (parts.length < 2) return {ok:false, msg:"用户名或密码错误"};
    const hash = await this.sha(parts[0] + ":" + pw);
    if (hash !== parts[1]) return {ok:false, msg:"用户名或密码错误"};
    this.setUser(name);
    return {ok:true};
  },
  localAccounts(){
    try{ return JSON.parse(localStorage.getItem("ga_accounts") || "{}"); }catch(e){ return {}; }
  },

  /* ---------- 排行榜 ---------- */
  localBoard(){
    try{ return JSON.parse(localStorage.getItem("ga_board") || "[]"); }catch(e){ return []; }
  },
  saveLocalBoard(b){
    try{ localStorage.setItem("ga_board", JSON.stringify(b)); }catch(e){}
  },
  async submitScore(stats){
    if (!this.user) return;
    const entry = {
      n: this.user.name,
      d: Math.round(stats.dmg || 0),
      k: stats.kills || 0,
      f: stats.diff || "F",
      w: stats.bigWin ? 1 : 0,
      t: Date.now(),
    };
    // 本地
    let lb = this.localBoard();
    lb = lb.filter(e=>!(e.n === entry.n && e.t === entry.t));
    lb.push(entry);
    lb.sort((a,b)=>b.d-a.d);
    lb = lb.slice(0, 100);
    this.saveLocalBoard(lb);
    // 云端（读-改-写，尽力而为）
    try{
      const doc = (await this._get()) || {};
      let remote = Array.isArray(doc.board) ? doc.board : [];
      remote = remote.filter(e=>!(e.n === entry.n && e.t === entry.t));
      remote.push(entry);
      remote.sort((a,b)=>b.d-a.d);
      remote = remote.slice(0, 100);
      doc.board = remote;
      await this._put(doc);
    }catch(e){ /* 忽略：本地已保存 */ }
  },
  async fetchBoard(){
    try{
      const doc = await this._get();
      if (doc && Array.isArray(doc.board)) return doc.board;
    }catch(e){}
    return this.localBoard();
  },
};
