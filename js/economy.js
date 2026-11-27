/* ============================================================
 * 经济 —— 金钱/装备/升级/存档/结算（USD）
 * 升级与消耗均为线性成长，非指数
 * ============================================================ */
"use strict";
const Eco = window.Eco = {
  money: 20000,
  owned: {weapons:["knife","bat"], armor:[], vehicles:{}},
  ammo: {pistol:0, smg:0, shotgun:0, rifle:0, sniper:0, lmg:0, rocket:0, mortar:0, missile:0, missile2:0, missile3:0, grenade:0, bombpow:0, bombnuke:0},
  upgrades: {},
  meta: {runs:0, wins:0, bigWins:0, totalDamage:0},
  SAVE_KEY: "xinglan-save-v1",

  fmt(n){
    n = Math.round(n||0);
    const neg = n < 0 ? "-" : "";
    n = Math.abs(n);
    if (n >= 1e9) return neg + "$" + (n/1e9).toFixed(2) + "B";
    if (n >= 1e6) return neg + "$" + (n/1e6).toFixed(2) + "M";
    if (n >= 1e3) return neg + "$" + (n/1e3).toFixed(1) + "K";
    return neg + "$" + n;
  },

  load(){
    try{
      const raw = localStorage.getItem(this.SAVE_KEY);
      if (raw){
        const s = JSON.parse(raw);
        let changed = false;
        // v2：全体资金重置为 20k
        if (!s.v2reset){
          s.v2reset = true;
          this.money = 20000;
          changed = true;
        } else {
          this.money = s.money ?? 20000;
        }
        // 每次更新后资金保底：不足40k恢复至40k
        if (!s.minGuard40){
          if (this.money < 40000) this.money = 40000;
          s.minGuard40 = true;
          changed = true;
        }
        this.owned = Object.assign({weapons:["knife","bat"], armor:[], vehicles:{}}, s.owned||{});
        this.ammo = Object.assign({pistol:0, smg:0, shotgun:0, rifle:0, sniper:0, lmg:0, rocket:0, mortar:0, missile:0, missile2:0, missile3:0, grenade:0, bombpow:0, bombnuke:0}, s.ammo||{});
        this.upgrades = s.upgrades||{};
        this.meta = Object.assign(this.meta, s.meta||{});
        // 每日登录奖励 +20k
        const d = new Date();
        const today = d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
        if (s.lastDaily !== today){
          this.money += 20000;
          s.lastDaily = today;
          changed = true;
          this._dailyMsg = true;
        }
        this._lastDaily = s.lastDaily;
        if (changed){
          try{ localStorage.setItem(this.SAVE_KEY, JSON.stringify({
            money:this.money, owned:this.owned, ammo:this.ammo,
            upgrades:this.upgrades, meta:this.meta,
            v2reset:s.v2reset, lastDaily:s.lastDaily, minGuard40:true,
          })); }catch(e){}
        }
      }
    }catch(e){ console.warn("存档读取失败", e); }
  },
  save(){
    try{
      localStorage.setItem(this.SAVE_KEY, JSON.stringify({
        money:this.money, owned:this.owned, ammo:this.ammo,
        upgrades:this.upgrades, meta:this.meta,
        v2reset:true, lastDaily:this._lastDaily || undefined,
      }));
    }catch(e){}
  },
  // 转职等级
  warriorLv(){ return this.upLevel("warrior"); },
  mageLv(){ return this.upLevel("mage"); },
  meleeMult(){ return 1 + this.upLevel("melee")*CFG.UPGRADES.melee.per + this.warriorLv()*0.04; },
  rangeMult(){ return 1 + this.mageLv()*0.03; },
  cdrMult(){ return Math.min(1, this.upLevel("cdr")*CFG.UPGRADES.cdr.per); },
  gunDmgMult(){ return 1 + this.upLevel("gunpow")*CFG.UPGRADES.gunpow.per; },
  gunRangeMult(){ return 1 + this.upLevel("gunrange")*CFG.UPGRADES.gunrange.per; },

  upLevel(id){ return this.upgrades[id]||0; },
  upCost(id){
    const u = CFG.UPGRADES[id];
    return u.base + this.upLevel(id)*u.step;
  },
  buyUpgrade(id){
    const u = CFG.UPGRADES[id];
    if (this.upLevel(id) >= u.max){ UI.toast("已达最大等级","warn"); return; }
    // 飞行解锁条件：战士+魔法师合计≥10级
    if (id === "fly" && this.warriorLv() + this.mageLv() < 10){
      UI.toast(`需战士+魔法师合计≥10级才能解锁飞行（当前${this.warriorLv()+this.mageLv()}级）`,"warn");
      return;
    }
    const cost = this.upCost(id);
    if (this.money < cost){ UI.toast("金钱不足","warn"); return; }
    this.money -= cost;
    this.upgrades[id] = this.upLevel(id)+1;
    this.save();
    Audio.buy();
    UI.refreshUpg(); UI.refreshMoney();
  },

  gearArmor(){
    let a = 0;
    for (const id of this.owned.armor){
      const g = CFG.ARMOR[id];
      if (g) a += g.armor;
    }
    return a;
  },

  canBuy(price){ return this.money >= price; },

  buy(id, type, qty){
    let price = 0, ok = true;
    if (type === "weapon"){
      const w = CFG.WEAPONS[id];
      price = w.price;
      if (this.owned.weapons.includes(id)){ UI.toast("已拥有该武器","warn"); return; }
    } else if (type === "ammo"){
      const w = CFG.WEAPONS[id];
      qty = Math.max(1, Math.floor(qty || 1));
      // 投掷物按单价×数量；弹匣按弹匣单价×数量
      price = (w.throwable ? w.price : w.ammoPrice) * qty;
    } else if (type === "armor"){
      price = CFG.ARMOR[id].price;
      if (this.owned.armor.includes(id)){ UI.toast("已拥有该护甲","warn"); return; }
    } else if (type === "vehicle"){
      price = CFG.VEHICLES[id].price;
    } else if (type === "repair"){
      price = CFG.REPAIR.price;
    }
    if (!this.canBuy(price)){ UI.toast("金钱不足","warn"); return; }
    this.money -= price;
    G.run && (G.run.spent += price);
    if (type === "weapon") this.owned.weapons.push(id);
    else if (type === "ammo"){
      const w = CFG.WEAPONS[id];
      if (w.throwable) this.ammo.grenade += qty;
      else this.ammo[id] += qty * (w.mag || 1);
    }
    else if (type === "armor") this.owned.armor.push(id);
    else if (type === "vehicle") this.owned.vehicles[id] = (this.owned.vehicles[id]||0)+1;
    else if (type === "repair"){
      const p = G.player;
      if (p && !p.dead){
        p.armor = Math.min(p.armorMax, p.armor + CFG.REPAIR.amount);
        UI.toast("护甲修复 +"+CFG.REPAIR.amount);
      } else {
        this.money += price;
        UI.toast("行动中才能使用修复包","warn");
        return;
      }
    }
    this.save();
    Audio.buy();
    UI.refreshShop(UI.shopTab);
    UI.refreshMoney();
  },

  /* 轰炸机弹药（强力航弹 / 小型核弹） */
  buyBomb(id, qty){
    const b = CFG.BOMBS[id];
    if (!b) return;
    qty = Math.max(1, Math.floor(qty||1));
    const price = b.price * qty;
    if (!this.canBuy(price)){ UI.toast("金钱不足","warn"); return; }
    this.money -= price;
    G.run && (G.run.spent += price);
    this.ammo[b.ammo] = (this.ammo[b.ammo]||0) + qty;
    this.save();
    Audio.buy();
    UI.refreshShop(UI.shopTab);
    UI.refreshMoney();
  },

  /* 导弹类型弹药（普通/大型/巨型，共用万能发射器） */
  buyMissile(id, qty){
    const m = CFG.MISSILES[id];
    if (!m) return;
    qty = Math.max(1, Math.floor(qty||1));
    const price = m.price * qty;
    if (!this.canBuy(price)){ UI.toast("金钱不足","warn"); return; }
    this.money -= price;
    G.run && (G.run.spent += price);
    this.ammo[m.ammo] = (this.ammo[m.ammo]||0) + qty;
    this.save();
    Audio.buy();
    UI.refreshShop(UI.shopTab);
    UI.refreshMoney();
  },

  addDamage(v){ G.run.damageValue += v; },
  addBounty(v, kind){
    this.money += v;
    G.run.bountyEarned += v;
    this.save();
  },
  rewardRatio(){
    return Math.min(1, CFG.DIFFS[G.diff].ratio + this.upLevel("ratio")*CFG.UPGRADES.ratio.per);
  },
  passivePerSec(){
    return this.upLevel("income")*CFG.UPGRADES.income.per;
  },

  resetRun(){
    G.run = {
      damageValue: 0, kills: 0, bountyEarned: 0, spent: 0, passiveEarned: 0,
      bigWin: false, startTime: performance.now(),
    };
  },
  settle(kind){
    const r = G.run;
    const ratio = this.rewardRatio();
    // 阵亡=10%；主动放弃=收益仅减5%（95%）；正常撤离=难度比例
    const effRatio = kind === "death" ? 0.10 : (kind === "surrender" ? Math.max(0.05, ratio * 0.95) : ratio);
    const reward = Math.round(r.damageValue * effRatio);
    this.money += reward;
    this.meta.runs++;
    if (kind !== "death") this.meta.wins++;
    if (kind === "bigwin") this.meta.bigWins++;
    this.meta.totalDamage += r.damageValue;
    this.save();
    return {reward, ratio: effRatio, damageValue:r.damageValue, kills:r.kills, bounty:r.bountyEarned, passive:r.passiveEarned, spent:r.spent, kind};
  },
};
