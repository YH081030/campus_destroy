/* ============================================================
 * UI —— HUD / 菜单 / 商店 / 升级 / 结算 / 小地图
 * ============================================================ */
"use strict";
const UI = window.UI = {
  shopTab: "weapon",
  shopQty: 1,
  interactText: null,
  _hudTimer: 0, _miniTimer: 0, _hitT: 0, _flashT: 0,
  _bannerT: 0,
  minimapCtx: null,

  $ (id){ return document.getElementById(id); },

  init(){
    this.bind("btn-shop", ()=>this.openShop());
    this.bind("btn-up", ()=>this.openUpg());
    this.bind("btn-help", ()=>this.openOverlay("help"));
    this.bind("btn-help-close", ()=>this.closeOverlay("help"));
    this.bind("btn-start", ()=>{ Audio.init(); Audio.resume(); Game.startRun(); });
    this.bind("btn-shop-close", ()=>this.closeShop());
    this.bind("btn-upg-close", ()=>{ this.closeOverlay("upg"); Game.resume(); });
    this.bind("btn-resume", ()=>{ this.$("pause").classList.add("hidden"); Game.resume(); });
    this.bind("btn-shop2", ()=>{ this.$("pause").classList.add("hidden"); this.openShop(); });
    this.bind("btn-up2", ()=>{ this.$("pause").classList.add("hidden"); this.openUpg(); });
    this.bind("btn-quit", ()=>{ this.$("pause").classList.add("hidden"); Game.endRun("death"); });
    this.bind("btn-surrender", ()=>{ this.$("pause").classList.add("hidden"); Game.endRun("surrender"); });
    this.bind("btn-settle-ok", ()=>{ this.$("settle").classList.add("hidden"); UI.showMenu(); });
    // 账号 / 排行榜
    this.bind("btn-auth", ()=>this.openAuth());
    this.bind("btn-board", ()=>this.openBoard());
    this.bind("btn-auth-close", ()=>this.closeOverlay("auth"));
    this.bind("btn-board-close", ()=>this.closeOverlay("board"));
    this.bind("btn-board-refresh", ()=>this.loadBoard());
    this.bind("btn-logout", ()=>{ GAuth.logout(); this.refreshAccount(); this.openAuth(); UI.toast("已退出登录"); });
    this.bind("btn-auth-submit", ()=>this.authSubmit());
    this.bind("tab-login", ()=>{ this.authMode = "login"; this.refreshAuth(); });
    this.bind("tab-reg", ()=>{ this.authMode = "reg"; this.refreshAuth(); });
    this.authMode = "login";
    // 难度选择
    const grid = this.$("diff-grid");
    grid.innerHTML = "";
    CFG.DIFFS.forEach((d, i)=>{
      const b = document.createElement("button");
      b.className = "diff-btn" + (i === G.diff ? " sel" : "");
      b.innerHTML = `<b>${d.name}</b><span class="d2">${d.lv}</span>`;
      b.onclick = ()=>{
        G.diff = i;
        grid.querySelectorAll(".diff-btn").forEach(x=>x.classList.remove("sel"));
        b.classList.add("sel");
        Audio.click();
        this.refreshMoney();
      };
      grid.appendChild(b);
    });
    // 昼夜选择（白天/黑夜/自动）
    this.bind("tod-day", ()=>{ this.setTod("day"); });
    this.bind("tod-night", ()=>{ this.setTod("night"); });
    this.bind("tod-auto", ()=>{ this.setTod("auto"); });
    this.refreshTod();
    // 导弹地图选点 / 传送选点
    const mm = this.$("missile-map");
    if (mm){
      mm.addEventListener("click", (e)=>{
        const p = this._missilePick(e.clientX, e.clientY);
        if (!p) return;
        if (this._teleportMode){
          this.closeMissileTarget();
          Game.teleportTo(p.x, p.z);
          return;
        }
        if (!this._missileW) return;
        const w = this._missileW;
        this.closeMissileTarget();
        Weapons.launchMissile(w, p.x, p.z);
      });
      // 准星跟随鼠标
      mm.addEventListener("mousemove", (e)=>{
        if (!this._missileW && !this._teleportMode) return;
        const rect = mm.getBoundingClientRect();
        const px = (e.clientX - rect.left) * (mm.width / rect.width);
        const py = (e.clientY - rect.top) * (mm.height / rect.height);
        this._missileCross(mm, {x: px, y: py});
      });
      mm.addEventListener("mouseleave", ()=>{ if (this._missileW || this._teleportMode) this._missileCross(mm, null); });
    }
    this.bind("missile-cancel", ()=>this.closeMissileTarget());
    // 商店批量购买数量
    this.bind("qty-minus", ()=>this.setQty(this.shopQty - 1));
    this.bind("qty-plus", ()=>this.setQty(this.shopQty + 1));
    const qi = this.$("qty-input");
    if (qi) qi.addEventListener("change", ()=>{ this.setQty(parseInt(qi.value,10)||1); });
    this.$("shop").querySelectorAll(".qty-preset").forEach(b=>{
      b.onclick = ()=>{ Audio.init(); Audio.resume(); this.setQty(parseInt(b.dataset.n,10)||1); };
    });
    // 帮助内容
    this.$("help-body").innerHTML = `
      <h4>目标</h4>
      消灭全部异化怪物并摧毁 12 座裂隙传送门即可达成<b>大胜</b>；也可随时通过撤离门离开并结算。<br>
      阵亡/放弃 = 失败（破坏价值按最低 10% 结算，已入账击杀奖金保留）。<br>
      <h4>操作（键鼠）</h4>
      <kbd>WASD</kbd> 移动　<kbd>Shift</kbd> 冲刺　<kbd>Ctrl</kbd> 趴下/起身（匍匐爬行）　<kbd>空格</kbd> 跳跃（贴墙=翻越围墙）　<kbd>鼠标</kbd> 视角/射击（右键瞄准）<br>
      <kbd>1-9 / 0 / Q / 滚轮</kbd> 切换武器　<kbd>R</kbd> 换弹　<kbd>G</kbd> 手榴弹<br>
      <kbd>F</kbd> 互动/上下车　<kbd>E</kbd> 骑乘附近载具/下车　<kbd>V</kbd> 部署载具　<kbd>B</kbd> 商店　<kbd>Esc</kbd> 暂停<br>
      转职技能：<kbd>T</kbd>火球术 <kbd>C</kbd>冲锋斩 <kbd>X</kbd>冰霜新星 <kbd>Z</kbd>狂暴（火球/冲锋无冷却）<br>
      高阶技能每10级解锁：<kbd>Y</kbd><kbd>U</kbd><kbd>I</kbd><kbd>O</kbd><kbd>P</kbd><kbd>J</kbd> 魔法师，<kbd>K</kbd><kbd>L</kbd><kbd>N</kbd><kbd>M</kbd><kbd>[</kbd><kbd>]</kbd> 战士；也可点击右下角技能栏释放<br>
      <h4>武器</h4>
      · <b>长剑/法杖</b>：近战，法杖更长更慢；<b>迫击炮</b>：高抛弹道，最小射程30米、最远340米，爆炸范围大；<br>
      · <b>导弹</b>：<b>射程无限（全图）</b>，发射后在地图上点选打击点，威力巨大。<br>
      · 骑乘自行车/电动车/摩托车/轿车时可正常使用随身武器射击。
      <h4>操作（手机）</h4>
      自动检测触屏：<b>左半屏任意处滑动=移动</b>（上=前进/下=后退/左=左移/右=右移，推满=冲刺），
      <b>右半屏任意处滑动=转动视角</b>（推到底=自动开火）；<br>
      红色开火键：<b>点击=切换连发</b>，<b>按住拖出后松手=单发</b>；其余按钮：锁定/跳跃/换弹/手雷/互动/上车/武器/商店/菜单。<br>
      <h4>说明</h4>
      · 空间背包无容量限制；弹药需购买；载具被摧毁即消耗。<br>
      · 传送门(裂隙)很坚固，需集火破坏；破坏后不再刷新怪物。<br>
      · 破坏一切建筑/道路/设施获得<b>破坏价值</b>，撤离时按难度奖励比例结算。<br>
      · 残骸不会自动消失，可作掩体；再次击打可彻底毁坏。<br>
      · 生命低于35%将减速，护甲可吸收伤害；升级全部为线性成长。<br>
      · 驾驶挖掘机可高效拆除建筑；坦克主炮右键；直升机空格/左Ctrl升降；轰炸机无法悬停。
    `;
    window.addEventListener("resize", ()=>{
      G.renderer.setSize(innerWidth, innerHeight);
      G.camera.aspect = innerWidth/innerHeight;
      G.camera.updateProjectionMatrix();
    });
    this.minimapCtx = this.$("minimap").getContext("2d");
  },
  bind(id, fn){
    const el = this.$(id);
    if (el) el.onclick = ()=>{ Audio.init(); Audio.resume(); fn(); };
  },

  /* ---------- 账号 / 排行榜 ---------- */
  refreshAccount(){
    const el = this.$("menu-account");
    if (!el) return;
    if (GAuth.user){
      el.innerHTML = `当前玩家：<b style="color:#7CFC9E">${GAuth.user.name}</b>　<button class="btn" id="btn-logout2">退出</button>`;
      const b = this.$("btn-logout2");
      if (b) b.onclick = ()=>{ GAuth.logout(); this.refreshAccount(); UI.toast("已退出登录"); };
    } else {
      el.innerHTML = `未登录（登录后可上传排行榜成绩）`;
    }
  },
  openAuth(){
    this.openOverlay("auth");
    this.refreshAuth();
  },
  refreshAuth(){
    const logged = !!GAuth.user;
    this.$("auth-logged").classList.toggle("hidden", !logged);
    this.$("auth-form").classList.toggle("hidden", logged);
    if (logged) this.$("auth-name").textContent = GAuth.user.name;
    const isReg = this.authMode === "reg";
    this.$("tab-login").classList.toggle("sel", !isReg);
    this.$("tab-reg").classList.toggle("sel", isReg);
    this.$("btn-auth-submit").textContent = isReg ? "注册" : "登录";
    this.$("auth-msg").textContent = "";
  },
  async authSubmit(){
    const name = this.$("auth-user").value;
    const pw = this.$("auth-pass").value;
    const msg = this.$("auth-msg");
    const btn = this.$("btn-auth-submit");
    btn.disabled = true;
    let res;
    try{
      if (this.authMode === "reg") res = await GAuth.register(name, pw);
      else res = await GAuth.login(name, pw);
    }catch(e){
      res = {ok:false, msg:"网络错误，请重试"};
    }
    btn.disabled = false;
    if (res.ok){
      msg.textContent = "";
      UI.toast(`欢迎，${GAuth.user.name}！`);
      this.refreshAccount();
      this.refreshAuth();
      this.closeOverlay("auth");
    } else {
      msg.textContent = res.msg;
    }
  },
  openBoard(){
    this.openOverlay("board");
    this.loadBoard();
  },
  async loadBoard(){
    const msg = this.$("board-msg");
    msg.textContent = "加载中…";
    let board;
    try{
      board = await GAuth.fetchBoard();
    }catch(e){
      board = GAuth.localBoard();
    }
    const tbody = this.$("board-table").querySelector("tbody");
    tbody.innerHTML = "";
    if (!board || !board.length){
      msg.textContent = "暂无成绩";
      return;
    }
    msg.textContent = "";
    board.slice(0, 30).forEach((e, i)=>{
      const tr = document.createElement("tr");
      if (GAuth.user && e.n === GAuth.user.name) tr.className = "me";
      const diffName = CFG.DIFFS.find(d=>d.id === e.f);
      tr.innerHTML = `<td>${i+1}</td><td>${String(e.n).replace(/[<>]/g,"")}${e.w?" 🏆":""}</td><td>${Eco.fmt(e.d)}</td><td>${e.k}</td><td>${diffName ? diffName.name : (e.f||"?")}</td>`;
      tbody.appendChild(tr);
    });
  },

  /* ---------- 菜单 ---------- */
  showMenu(){
    G.state = "menu";
    this.$("menu").classList.remove("hidden");
    this.$("hud").classList.add("hidden");
    this.$("settle").classList.add("hidden");
    this.$("pause").classList.add("hidden");
    this.$("shop").classList.add("hidden");
    this.$("upg").classList.add("hidden");
    this.$("auth").classList.add("hidden");
    this.$("board").classList.add("hidden");
    this.$("help").classList.add("hidden");
    this.refreshMoney();
  },
  /* 从主菜单打开弹窗时先隐藏菜单，避免被菜单遮挡 */
  openOverlay(id){
    if (G.state === "menu") this.$("menu").classList.add("hidden");
    this.$(id).classList.remove("hidden");
  },
  closeOverlay(id){
    this.$(id).classList.add("hidden");
    if (G.state === "menu") this.$("menu").classList.remove("hidden");
  },

  /* ---------- 昼夜手动选择 ---------- */
  setTod(mode){
    G.todMode = mode;
    try{ localStorage.setItem("xinglan-tod", mode); }catch(e){}
    W.applyTimeOfDay();
    this.refreshTod();
  },
  refreshTod(){
    const m = G.todMode || "auto";
    ["tod-day","tod-night","tod-auto"].forEach(id=>{
      const el = this.$(id);
      if (!el) return;
      const on = (id==="tod-day"&&m==="day")||(id==="tod-night"&&m==="night")||(id==="tod-auto"&&m==="auto");
      el.classList.toggle("sel", on);
    });
  },

  /* ---------- 导弹地图选点 ---------- */
  openMissileTarget(w){
    this._teleportMode = false;
    this._missileW = w;
    G.paused = true;
    if (Input.locked) document.exitPointerLock && document.exitPointerLock();
    const ov = this.$("missile-target");
    ov.classList.remove("hidden");
    const hint = this.$("missile-hint");
    if (hint) hint.textContent = "点击地图任意位置发射（射程无限）";
    const cv = this.$("missile-map");
    const B = CFG.LAYOUT.bounds;
    cv.width = 1100;
    cv.height = Math.round(1100 * (B.zS - B.zN) / (B.x*2));
    // 缓存基础地图（选点时 NPC/载具静止）
    if (!this._mBase){ this._mBase = document.createElement("canvas"); }
    this._mBase.width = cv.width; this._mBase.height = cv.height;
    this.drawMap(this._mBase.getContext("2d"), cv.width, cv.height);
    cv.getContext("2d").drawImage(this._mBase, 0, 0);
  },
  /* ---------- 传送地图选点（大阵保护范围外） ---------- */
  openTeleportTarget(){
    this._teleportMode = true;
    this._missileW = null;
    G.paused = true;
    if (Input.locked) document.exitPointerLock && document.exitPointerLock();
    const ov = this.$("missile-target");
    ov.classList.remove("hidden");
    const hint = this.$("missile-hint");
    if (hint) hint.textContent = "点击地图选择传送点（大阵保护范围外）";
    const cv = this.$("missile-map");
    const B = CFG.LAYOUT.bounds;
    cv.width = 1100;
    cv.height = Math.round(1100 * (B.zS - B.zN) / (B.x*2));
    if (!this._mBase){ this._mBase = document.createElement("canvas"); }
    this._mBase.width = cv.width; this._mBase.height = cv.height;
    this.drawMap(this._mBase.getContext("2d"), cv.width, cv.height);
    cv.getContext("2d").drawImage(this._mBase, 0, 0);
  },
  /* 在导弹地图上绘制准星 + 爆炸半径（p 为画布坐标，null 表示清除） */
  _missileCross(cv, p){
    const ctx = cv.getContext("2d");
    ctx.drawImage(this._mBase, 0, 0);
    if (!p) return;
    // 爆炸半径圈（仅导弹模式）
    if (!this._teleportMode){
      const B = CFG.LAYOUT.bounds;
      const scale = cv.width / (B.x*2); // 像素/米
      const radius = CFG.MISSILES[Weapons._missileType()].radius;
      ctx.strokeStyle = "rgba(255,90,50,0.95)";
      ctx.lineWidth = 2;
      ctx.fillStyle = "rgba(255,90,50,0.15)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(9, radius*scale), 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();
    }
    // 准星十字 + 中心点
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x-11, p.y); ctx.lineTo(p.x-4, p.y);
    ctx.moveTo(p.x+4, p.y); ctx.lineTo(p.x+11, p.y);
    ctx.moveTo(p.x, p.y-11); ctx.lineTo(p.x, p.y-4);
    ctx.moveTo(p.x, p.y+4); ctx.lineTo(p.x, p.y+11);
    ctx.stroke();
    ctx.fillStyle = "#ff5040";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI*2);
    ctx.fill();
  },
  closeMissileTarget(){
    this.$("missile-target").classList.add("hidden");
    if (G.state === "run") G.paused = false;
    this._missileW = null;
    this._teleportMode = false;
  },
  _missilePick(clientX, clientY){
    const cv = this.$("missile-map");
    const rect = cv.getBoundingClientRect();
    const px = clientX - rect.left, py = clientY - rect.top;
    if (px < 0 || py < 0 || px > rect.width || py > rect.height) return null;
    const B = CFG.LAYOUT.bounds;
    const x = (px/rect.width)*(B.x*2) - B.x;
    const z = (py/rect.height)*(B.zS - B.zN) + B.zN;
    return {x, z};
  },
  refreshMoney(){
    let moneyText = `资金：${Eco.fmt(Eco.money)}`;
    if (Eco._dailyMsg) moneyText += `　<span style="color:#7CFC9E;font-size:13px">今日登录奖励 +$20,000 已入账</span>`;
    this.$("menu-money").innerHTML = moneyText;
    this.$("st-money").textContent = Eco.fmt(Eco.money);
    const d = CFG.DIFFS[G.diff];
    this.$("st-ratio").textContent = `奖励比例 ${Math.round(Eco.rewardRatio()*100)}%（${d.name}）`;
    this.$("st-income").textContent = `被动收益 ${Eco.passivePerSec()}$/秒`;
  },

  /* ---------- 商店 ---------- */
  setQty(n){
    n = Math.max(1, Math.min(999, Math.floor(n)||1));
    this.shopQty = n;
    const qi = this.$("qty-input");
    if (qi) qi.value = n;
    if (this.shopTab === "ammo") this.refreshShop();
  },
  openShop(){
    this.shopTab = "weapon";
    this.openOverlay("shop");
    this.refreshShop("weapon");
    G.paused = true;
  },
  closeShop(){
    this.closeOverlay("shop");
    Game.resume();
  },
  refreshShop(tab){
    if (tab) this.shopTab = tab;
    this.$("shop-qty-row").classList.toggle("hidden", this.shopTab !== "ammo");
    const tabs = [
      ["weapon","武器"],["ammo","弹药"],["armor","护甲"],["vehicle","载具"],
    ];
    const tabsEl = this.$("shop-tabs");
    tabsEl.innerHTML = "";
    for (const [id, name] of tabs){
      const b = document.createElement("button");
      b.className = "btn" + (this.shopTab === id ? " sel" : "");
      b.textContent = name;
      b.onclick = ()=>{ this.refreshShop(id); };
      tabsEl.appendChild(b);
    }
    const list = this.$("shop-list");
    list.innerHTML = "";
    const row = (nm, ds, price, own, onClick, disabled)=>{
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `<div><div class="nm">${nm}</div><div class="ds">${ds}</div>${own?`<div class="own">${own}</div>`:""}</div><div class="pr">${price}</div><button class="btn buy">${disabled?"已拥有":"购买"}</button>`;
      const btn = div.querySelector(".buy");
      btn.disabled = !!disabled;
      btn.onclick = onClick;
      list.appendChild(div);
    };
    if (this.shopTab === "weapon"){
      for (const [id, w] of Object.entries(CFG.WEAPONS)){
        if (w.throwable) continue;
        const owned = Eco.owned.weapons.includes(id);
        const ds = w.melee ? `近战 · 伤害${w.dmg} · 攻击间隔${w.rate}s`
          : w.universal ? `万能发射器 · 可发射普通/大型/巨型导弹`
          : w.proj ? `爆炸半径${w.radius}m · 伤害${w.dmg}${w.guided?" · 自动制导":""}`
          : `伤害${w.dmg}${w.pellets?`×${w.pellets}`:""} · 弹匣${w.mag} · 射速${Math.round(1/w.rate)}发/秒`;
        row(w.name, ds, Eco.fmt(w.price), null, ()=>Eco.buy(id, "weapon"), owned);
      }
    } else if (this.shopTab === "ammo"){
      const q = this.shopQty;
      for (const [id, w] of Object.entries(CFG.WEAPONS)){
        if (w.throwable){
          row(`${w.name} ×${q}`, `爆炸半径${w.radius}m · 伤害${w.dmg} · 单价${Eco.fmt(w.price)}`, Eco.fmt(w.price*q),
            `持有 ${Eco.ammo.grenade||0}`, ()=>Eco.buy(id, "ammo", q));
        } else if (w.mag){
          const have = Eco.ammo[id]||0;
          row(`${w.name} 弹匣 ×${q}（${w.mag*q}发）`, `弹匣单价 ${Eco.fmt(w.ammoPrice)}`, Eco.fmt(w.ammoPrice*q),
            `弹药 ${have} 发`, ()=>Eco.buy(id, "ammo", q));
        }
      }
      // 轰炸机弹药
      for (const [id, b] of Object.entries(CFG.BOMBS)){
        row(`${b.name} ×${q}`, `爆炸半径${b.radius}m · 伤害${b.dmg}`, Eco.fmt(b.price*q),
          `持有 ${Eco.ammo[b.ammo]||0}`, ()=>Eco.buyBomb(id, q));
      }
      // 导弹类型弹药（万能发射器）
      for (const [id, m] of Object.entries(CFG.MISSILES)){
        row(`${m.name} ×${q}`, `爆炸半径${m.radius}m · 伤害${m.dmg}`, Eco.fmt(m.price*q),
          `持有 ${Eco.ammo[m.ammo]||0}`, ()=>Eco.buyMissile(id, q));
      }
    } else if (this.shopTab === "armor"){
      for (const [id, a] of Object.entries(CFG.ARMOR)){
        const owned = Eco.owned.armor.includes(id);
        row(a.name, `护甲 +${a.armor}${a.slow?" · 移速略降":""}`, Eco.fmt(a.price), null, ()=>Eco.buy(id, "armor"), owned);
      }
      row(CFG.REPAIR.name, `立即回复 ${CFG.REPAIR.amount} 护甲（行动中使用）`, Eco.fmt(CFG.REPAIR.price), null, ()=>Eco.buy("repair", "repair"));
    } else if (this.shopTab === "vehicle"){
      for (const [id, v] of Object.entries(CFG.VEHICLES)){
        const owned = Eco.owned.vehicles[id]||0;
        const ds = v.fly ? (v.bombs?`航弹 ${v.bombDmg}伤害 · 半径${v.bombRadius}m`:`火箭 ${v.rocketDmg}伤害 · 速度${v.speed}`)
          : (v.arm?`机械臂拆除 ${v.armDmg}伤害` : v.cannon?`主炮 ${v.cannonDmg}伤害` : v.gun?`车载机枪` : v.wheel?`速度${v.speed} · 冲撞${v.ram}`:"");
        const div = document.createElement("div");
        div.className = "item";
        div.innerHTML = `<div><div class="nm">${v.name}</div><div class="ds">生命${v.hp} · ${ds} · 被毁即消耗</div>${owned>0?`<div class="own">车库 ${owned} 辆</div>`:""}</div><div class="pr">${Eco.fmt(v.price)}</div>`;
        const btns = document.createElement("div");
        btns.style.cssText = "display:flex;gap:6px;flex-shrink:0;";
        const buyB = document.createElement("button");
        buyB.className = "btn";
        buyB.textContent = "购买";
        buyB.onclick = ()=>Eco.buy(id, "vehicle");
        btns.appendChild(buyB);
        if (owned > 0){
          const depB = document.createElement("button");
          depB.className = "btn";
          depB.textContent = "部署";
          depB.onclick = ()=>{
            if (G.state !== "run"){
              UI.toast("行动中才能部署载具（回车进入行动后商店内点部署）", "warn");
              return;
            }
            this.closeShop();
            Vehicles.deploy(id);
          };
          btns.appendChild(depB);
        }
        div.appendChild(btns);
        list.appendChild(div);
      }
    }
    this.refreshMoney();
  },

  /* ---------- 升级 ---------- */
  openUpg(){
    this.openOverlay("upg");
    this.refreshUpg();
    G.paused = true;
  },
  refreshUpg(){
    const list = this.$("upg-list");
    list.innerHTML = "";
    for (const [id, u] of Object.entries(CFG.UPGRADES)){
      const lv = Eco.upLevel(id);
      const div = document.createElement("div");
      div.className = "item";
      const maxed = lv >= u.max;
      let extra = "";
      if (id === "fly" && lv === 0) extra = `（解锁条件：战士+魔法师合计≥10级，当前${Eco.warriorLv()+Eco.mageLv()}级）`;
      div.innerHTML = `<div><div class="nm">${u.name} <span style="color:#8a94a8;font-size:12px">${u.group==="身体"?"【身体素质】":u.group==="转职"?"【转职路线】":"【收益建筑】"}</span></div>
        <div class="ds">Lv.${lv}${maxed?"（满级）":""} → ${u.fmt((lv+1)*u.per)}${extra}</div></div>
        <div class="pr">${maxed ? "MAX" : Eco.fmt(Eco.upCost(id))}</div>
        <button class="btn" ${maxed?"disabled":""}>升级</button>`;
      div.querySelector("button").onclick = ()=>Eco.buyUpgrade(id);
      list.appendChild(div);
    }
    this.refreshMoney();
  },

  /* ---------- HUD ---------- */
  refreshHud(){
    const p = G.player;
    if (!p) return;
    const setBar = (id, v, max)=>{
      const el = this.$(id);
      if (el) el.querySelector("span").style.width = Math.max(0, Math.min(100, v/max*100)) + "%";
    };
    setBar("bar-hp", p.hp, p.maxHp);
    setBar("bar-armor", p.armor, Math.max(1, p.armorMax));
    setBar("bar-sta", p.stamina, p.maxStamina);
    const w = Weapons.def();
    this.$("weapon-name").textContent = w ? w.name : "";
    if (w && !w.melee && !w.throwable && w.mag !== undefined){
      const reloading = Weapons.reloadT > 0;
      this.$("weapon-ammo").textContent = reloading ? "换弹中…" : `${Weapons.mag} / ${Eco.ammo[w.ammo]||0}`;
    } else if (w && w.throwable){
      this.$("weapon-ammo").textContent = `${Eco.ammo.grenade||0} 枚`;
    } else if (w && w.missileTarget){
      const m = CFG.MISSILES[Weapons._missileType()];
      this.$("weapon-ammo").textContent = `${m.name} ${Eco.ammo[m.ammo]||0}`;
    } else {
      this.$("weapon-ammo").textContent = "";
    }
    this.$("weapon-hint").textContent = Weapons.hintText();
    // 顶部数据（节流）
    this._hudTimer -= 1;
    if (this._hudTimer <= 0){
      this._hudTimer = 8;
      this.refreshSkillHud();
      const r = G.run;
      this.$("st-damage").textContent = Eco.fmt(r.damageValue);
      this.$("st-kills").textContent = r.kills;
      this.$("st-npc").textContent = NPCs.count();
      this.$("st-portal").textContent = `${Portals.destroyed()}/12`;
      this.refreshMoney();
    }
    // 低血量晕影
    const inj = p.hp/p.maxHp;
    this.$("vignette").style.opacity = inj < 0.35 ? (0.35-inj)*2 : 0;
    // 受伤闪红
    this._flashT = Math.max(0, this._flashT - 0.02);
    this.$("damage-flash").style.opacity = this._flashT;
    // 命中标记
    this._hitT = Math.max(0, this._hitT - 0.03);
    this.$("hitmarker").classList.toggle("hidden", this._hitT <= 0);
    // 交互提示
    const it = this.$("interact");
    if (this.interactText){
      it.textContent = this.interactText;
      it.classList.remove("hidden");
    } else {
      it.classList.add("hidden");
    }
  },
  hitmarker(){ this._hitT = 0.25; },
  damageFlash(a){ this._flashT = Math.min(0.85, 0.25 + a); },

  hintCache: null,
  refreshSkillHud(){
    const el = this.$("skill-hud");
    if (!el) return;
    const parts = [];
    const touchParts = [];
    for (const [id, s] of Object.entries(CFG.SKILLS)){
      const unlocked = Skills.unlocked(id);
      const ready = Skills.ready(id);
      const cd = Skills.cdLeft(id);
      const icon = s.cls === "mage" ? "🔮" : "⚔️";
      const keyLabel = s.keyLabel || (s.key ? s.key.replace("Key","") : "");
      if (unlocked){
        const txt = ready ? s.name : `${s.name} ${cd.toFixed(0)}s`;
        parts.push(`<button class="skill-btn ${ready?'':'cd'}" data-skill="${id}" title="${s.desc}">${icon}${txt}${keyLabel?`[${keyLabel}]`:''}</button>`);
        touchParts.push(`<button class="tbtn t-skill" data-skill="${id}">${icon}${s.name}</button>`);
      } else {
        parts.push(`<span class="skill-btn locked" title="${s.desc}（未解锁：${s.cls==="mage"?"魔法师":"战士"}≥${s.need}级）">${icon}${s.name}🔒</span>`);
      }
    }
    el.innerHTML = parts.join("");
    el.querySelectorAll("button.skill-btn").forEach(b=>{
      b.onclick = ()=>{ Audio.init(); Audio.resume(); Skills.tryCast(b.dataset.skill); };
    });
    // 触屏技能子菜单
    const sm = this.$("skill-menu");
    if (sm){
      sm.innerHTML = touchParts.join("");
      sm.querySelectorAll("button").forEach(b=>{
        b.addEventListener("touchstart", (e)=>{ e.preventDefault(); Audio.init(); Audio.resume(); Skills.tryCast(b.dataset.skill); Input._closeMenus && Input._closeMenus(); }, {passive:false});
        b.addEventListener("mousedown", ()=>{ Audio.init(); Audio.resume(); Skills.tryCast(b.dataset.skill); Input._closeMenus && Input._closeMenus(); });
      });
    }
  },
  toggleTouchUI(){
    if (Input.isTouch){
      const t = this.$("touchui");
      if (t) t.classList.toggle("hide-ui");
    } else {
      // 桌面：隐藏/显示 HUD
      const h = this.$("hud");
      if (h) h.classList.toggle("hidden");
    }
  },
  setVehHud(v){
    const el = this.$("veh-hud");
    if (!v){ el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    this.$("bar-veh").querySelector("span").style.width = Math.max(0, v.hp/v.maxHp*100)+"%";
    const d = v.def;
    let hint = "";
    if (d.fly && d.bombs) hint = "左键 投弹 · W/S 俯仰 · A/D 转向 · 无法悬停";
    else if (d.fly) hint = "左键 火箭 · 空格 上升 · 左Ctrl 下降 · W/S 俯仰 · A/D 转向";
    else if (d.arm) hint = "左键 挥臂拆除 · WASD 驾驶";
    else if (d.cannon) hint = "左键 机枪 · 右键 主炮 · WASD 驾驶";
    else if (d.gun) hint = `左键 车载机枪(${v.gunAmmo}发) · WASD 驾驶`;
    else hint = "WASD 驾驶";
    hint += " · F 下车";
    this.$("veh-hint").textContent = hint;
  },

  /* ---------- 提示 ---------- */
  toast(msg, cls){
    const box = this.$("toasts");
    const t = document.createElement("div");
    t.className = "toast " + (cls||"");
    t.textContent = msg;
    box.appendChild(t);
    while (box.children.length > 6) box.removeChild(box.firstChild);
    setTimeout(()=>{ t.style.opacity = "0"; t.style.transition = "opacity .5s"; setTimeout(()=>t.remove(), 500); }, 3200);
  },
  killfeed(msg){
    this.toast(msg);
  },
  banner(text, sub, dur){
    this.$("banner-text").textContent = text;
    this.$("banner-sub").textContent = sub||"";
    this.$("banner").classList.remove("hidden");
    this._bannerT = (dur !== undefined ? dur : 4); // 秒（时间驱动）
  },
  clearBanner(){
    this.$("banner").classList.add("hidden");
  },

  /* ---------- 结算 ---------- */
  settlement(s){
    const kind = s.kind;
    const title = kind === "death" ? "行动失败" : (kind === "surrender" ? "主动放弃" : (kind === "bigwin" ? "大胜！全面拆除完成" : "撤离成功"));
    const cls = kind === "death" ? "lose" : "win";
    const note = kind === "death" ? "（阵亡，按最低10%结算）" : (kind === "surrender" ? "（主动放弃，收益仅减5%）" : "");
    this.$("settle-title").textContent = title;
    this.$("settle-title").className = cls;
    this.$("settle-body").innerHTML = `
      <div>破坏价值：<b>${Eco.fmt(s.damageValue)}</b></div>
      <div>奖励比例：<b>${Math.round(s.ratio*100)}%</b></div>
      <div>破坏奖励：<b class="${cls}">+${Eco.fmt(s.reward)}</b>${note}</div>
      <div>击杀怪物：<b>${s.kills}</b>　击杀奖金：<b>+${Eco.fmt(s.bounty)}</b></div>
      <div>被动收益：<b>+${Eco.fmt(s.passive)}</b>　行动支出：<b>-${Eco.fmt(s.spent)}</b></div>
      <div>当前资金：<b>${Eco.fmt(Eco.money)}</b></div>
    `;
    this.$("settle").classList.remove("hidden");
    this.refreshMoney();
  },

  /* ---------- 小地图 ---------- */
  minimap(){
    this.drawMap(this.minimapCtx, 220, 110);
  },
  /* 画五角星（加油站标记/图例） */
  _drawStar(ctx, cx, cy, r, color){
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i=0;i<10;i++){
      const ang = -Math.PI/2 + i*Math.PI/5;
      const rr = i % 2 === 0 ? r : r*0.45;
      const x = cx + Math.cos(ang)*rr;
      const y = cy + Math.sin(ang)*rr;
      if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.closePath();
    ctx.fill();
  },
  drawMap(ctx, W2, H2){
    const L = CFG.LAYOUT;
    const B = L.bounds;
    const mx = (x)=>(x + B.x)/ (B.x*2) * W2;
    const mz = (z)=>(z - B.zN)/ (B.zS - B.zN) * H2;
    ctx.fillStyle = "rgba(10,14,10,0.85)";
    ctx.fillRect(0,0,W2,H2);
    // 道路
    ctx.fillStyle = "#4a4a50";
    ctx.fillRect(mx(L.roadMain.x0), mz(20), (L.roadMain.x1-L.roadMain.x0)/(B.x*2)*W2, (44-20)/(B.zS-B.zN)*H2);
    ctx.fillRect(mx(-12), mz(L.roadNorth.z0), 24/(B.x*2)*W2, (L.roadNorth.z1-L.roadNorth.z0)/(B.zS-B.zN)*H2);
    // 校内道路
    for (const r of L.internalRoads){
      ctx.fillRect(mx(r.x0), mz(r.z0), (r.x1-r.x0)/(B.x*2)*W2, (r.z1-r.z0)/(B.zS-B.zN)*H2);
    }
    // 校区
    ctx.fillStyle = "#3a4a3a";
    for (const c of [L.campusA, L.campusB]){
      ctx.fillRect(mx(c.x0), mz(c.z0), (c.x1-c.x0)/(B.x*2)*W2, (c.z1-c.z0)/(B.zS-B.zN)*H2);
    }
    // 建筑标记（被摧毁的建筑从地图消失）
    for (const bld of (Buildings.list || [])){
      if (bld.destroyed) continue;
      if (!bld.parts.some(p => !p.dead)) continue;
      const b = bld.spec;
      const bx = mx(b.cx), bz = mz(b.cz);
      const col = b.kind === "teaching" ? "#5a9ad8" :
                  b.kind === "dorm" ? "#b080d0" :
                  b.kind === "dining" ? "#e8a040" :
                  b.kind === "gym" ? "#d86050" :
                  b.kind === "wing" ? "#58c8c0" : "#8a94a8";
      ctx.fillStyle = col;
      const bw = Math.max(2.5, (b.w||20) / (B.x*2) * W2);
      const bh = Math.max(2.5, (b.d||20) / (B.zS - B.zN) * H2);
      ctx.fillRect(bx - bw/2, bz - bh/2, bw, bh);
    }
    // 加油站/加气站标记（被摧毁后消失）
    for (const g of (G.gasStations || [])){
      if (g.seg && g.seg.dead) continue;
      this._drawStar(ctx, mx(g.x), mz(g.z), 5, "#ff3030");
    }
    // 图例（左下角，野外空区）
    const lx = 4, ly = H2 - 44;
    ctx.fillStyle = "rgba(8,10,16,0.82)";
    ctx.fillRect(lx, ly, 66, 40);
    const legend = [
      ["#5a9ad8", "教学楼", 0],
      ["#e8a040", "食堂", 0],
      ["#d86050", "体育馆", 0],
      ["#ff3030", "加油站", 1],
    ];
    ctx.font = "9px sans-serif";
    ctx.textBaseline = "top";
    legend.forEach(([c, n, star], i)=>{
      if (star){
        this._drawStar(ctx, lx+7, ly+8 + i*9, 4, c);
      } else {
        ctx.fillStyle = c;
        ctx.fillRect(lx+4, ly+5 + i*9, 6, 6);
      }
      ctx.fillStyle = "#c8d0e0";
      ctx.fillText(n, lx+14, ly+4 + i*9);
    });
    // 湖
    ctx.fillStyle = "#2a5a7a";
    ctx.beginPath();
    ctx.ellipse(mx(L.lake.cx), mz(L.lake.cz), L.lake.rx/(B.x*2)*W2, L.lake.rz/(B.zS-B.zN)*H2, 0, 0, Math.PI*2);
    ctx.fill();
    // 撤离点
    ctx.fillStyle = "#38c8e0";
    for (const e of L.exits){
      ctx.fillRect(mx(e.x)-3, mz(e.z)-3, 6, 6);
    }
    // 裂隙
    ctx.fillStyle = "#c040d0";
    for (const p of Portals.spawns){
      if (p.dead) continue;
      ctx.fillRect(mx(p.pos.x)-2, mz(p.pos.z)-2, 4, 4);
    }
    // 怪物
    for (const n of NPCs.list){
      if (n.isBoss){
        ctx.fillStyle = "#ff9030";
        ctx.beginPath();
        ctx.arc(mx(n.pos.x), mz(n.pos.z), 3.5, 0, Math.PI*2);
        ctx.fill();
      } else {
        ctx.fillStyle = "#e04040";
        ctx.fillRect(mx(n.pos.x)-1.5, mz(n.pos.z)-1.5, 3, 3);
      }
    }
    // 载具
    ctx.fillStyle = "#ffe040";
    for (const v of Vehicles.list){
      ctx.fillRect(mx(v.pos.x)-2, mz(v.pos.z)-2, 4, 4);
    }
    // 玩家
    if (G.player && !G.player.dead){
      const px = mx(G.player.pos.x), pz = mz(G.player.pos.z);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      const yaw = G.player.yaw;
      ctx.moveTo(px + Math.sin(yaw)*4, pz + Math.cos(yaw)*4);
      ctx.lineTo(px + Math.sin(yaw+2.4)*3, pz + Math.cos(yaw+2.4)*3);
      ctx.lineTo(px + Math.sin(yaw-2.4)*3, pz + Math.cos(yaw-2.4)*3);
      ctx.closePath();
      ctx.fill();
    }
  },

  update(dt){
    this.interactText = null;
    if (G.state === "run"){
      // banner 计时（时间驱动，先于 HUD 刷新，避免被中断）
      if (this._bannerT > 0){
        this._bannerT -= dt;
        if (this._bannerT <= 0) this.clearBanner();
      }
      this.refreshHud();
      this._miniTimer -= dt;
      if (this._miniTimer <= 0){
        this._miniTimer = 0.12;
        this.minimap();
      }
    }
  },
};
