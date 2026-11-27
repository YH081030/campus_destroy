/* ============================================================
 * 转职技能 —— 火球术/冰霜新星(魔法师)、冲锋斩/狂暴(战士)
 * 解锁条件：对应转职等级；消耗体力，独立冷却
 * ============================================================ */
"use strict";
const Skills = window.Skills = {
  cds: {}, _proj: [],

  init(){ this.cds = {}; this._proj = []; },
  update(dt){
    for (const k in this.cds) this.cds[k] = Math.max(0, this.cds[k]-dt);
    this.updateProj(dt);
  },
  unlocked(id){
    const s = CFG.SKILLS[id];
    return s.cls === "mage" ? Eco.mageLv() >= s.need : Eco.warriorLv() >= s.need;
  },
  ready(id){ return (this.cds[id]||0) <= 0; },
  cdLeft(id){ return Math.max(0, this.cds[id]||0); },

  tryCast(id){
    const s = CFG.SKILLS[id];
    if (!s) return;
    if (!this.unlocked(id)){ UI.toast(`${s.name}未解锁（${s.cls==="mage"?"魔法师":"战士"}≥${s.need}级）`, "warn"); return; }
    if (!this.ready(id)){ UI.toast(`${s.name}冷却中`, "warn"); return; }
    if (G.player.stamina < s.cost){ UI.toast("体力不足", "warn"); return; }
    G.player.stamina -= s.cost;
    this.cds[id] = s.cd * (1 - Eco.cdrMult()); // 冷却缩减
    this.cast(id, s);
  },

  cast(id, s){
    switch(id){
      case "fireball": this.fireball(s); break;
      case "frost": this.frost(s); break;
      case "charge": this.charge(s); break;
      case "berserk": this.berserk(s); break;
      // 高阶魔法师
      case "meteor": this.meteor(s); break;
      case "chain": this.chain(s); break;
      case "shield": this.shield(s); break;
      case "flamestorm": this.flamestorm(s); break;
      case "timewarp": this.timewarp(s); break;
      case "fury": this.fury(s); break;
      // 高阶战士
      case "whirlwind": this.whirlwind(s); break;
      case "shockwave": this.shockwave(s); break;
      case "warcry": this.warcry(s); break;
      case "execute": this.execute(s); break;
      case "ironbody": this.ironbody(s); break;
      case "avatar": this.avatar(s); break;
    }
  },

  /* ---------- 高阶魔法师 ---------- */
  meteor(s){
    const from = G.camera.position;
    const dir = G.player.forward();
    const res = W.raycast(from, from.clone().addScaledVector(dir, 220), {ignorePlayer:true, ignoreNpc:true, ignoreProps:true});
    const target = res.point ? res.point.clone() : from.clone().addScaledVector(dir, 120);
    target.y = Math.max(0, target.y);
    const dmg = 800 + Eco.mageLv()*80;
    W.explosion(target, 12, dmg, dmg*1.2, true);
    FX.shake(1.2);
    Audio.explosion(true);
    UI.toast("陨石术！", "warn");
  },
  chain(s){
    const dmg = 250 + Eco.mageLv()*50;
    const sorted = NPCs.list.filter(n=>!n.dead).sort((a,b)=>a.pos.distanceTo(G.player.pos)-b.pos.distanceTo(G.player.pos));
    const n = Math.min(7, sorted.length);
    for (let i=0;i<n;i++){
      const npc = sorted[i];
      if (npc.pos.distanceTo(G.player.pos) > 40) break;
      NPCs.damage(npc, dmg * (1 - i*0.12), npc.pos, G.player.pos);
      FX.sparks(npc.pos.clone().setY(npc.pos.y+1), 0x80d0ff);
    }
    Audio.shot("rocket");
    UI.toast("连锁闪电！", "warn");
  },
  shield(s){
    G.player.shieldHp = 400 + Eco.mageLv()*40;
    for (const n of NPCs.list){
      if (n.pos.distanceTo(G.player.pos) < 8){ NPCs.damage(n, 100 + Eco.mageLv()*20, n.pos, G.player.pos); n.slowT = 4; }
    }
    FX.burst(G.player.pos.clone().setY(G.player.pos.y+1), 0x80d0ff, 20, 5, 0.9);
    Audio.click();
    UI.toast("冰霜护盾！", "warn");
  },
  flamestorm(s){
    const dmg = 600 + Eco.mageLv()*60;
    W.explosion(G.player.pos, 14, dmg, dmg*1.2, true);
    UI.toast("烈焰风暴！", "warn");
  },
  timewarp(s){
    for (const n of NPCs.list){
      if (n.pos.distanceTo(G.player.pos) < 25) n.slowT = 7;
    }
    FX.burst(G.player.pos.clone().setY(G.player.pos.y+1), 0x80a0ff, 18, 5, 0.8);
    Audio.click();
    UI.toast("时间扭曲！", "warn");
  },
  fury(s){
    const dmg = 1500 + Eco.mageLv()*150;
    W.explosion(G.player.pos, 20, dmg, dmg*1.4, true);
    for (const n of NPCs.list){
      const d = n.pos.distanceTo(G.player.pos);
      if (d < 32) NPCs.damage(n, dmg*0.5*(1-d/32), n.pos, G.player.pos);
    }
    FX.shake(1.6);
    Audio.explosion(true);
    UI.toast("元素之怒！", "danger");
  },

  /* ---------- 高阶战士 ---------- */
  whirlwind(s){
    const dmg = 200 + Eco.warriorLv()*40;
    for (const n of NPCs.list){
      if (n.pos.distanceTo(G.player.pos) < 8) NPCs.damage(n, dmg, n.pos, G.player.pos);
    }
    FX.burst(G.player.pos.clone().setY(G.player.pos.y+1), 0xffd070, 16, 5, 0.8);
    Audio.shot("bat");
    UI.toast("旋风斩！", "warn");
  },
  shockwave(s){
    const dmg = 300 + Eco.warriorLv()*50;
    W.explosion(G.player.pos, 8, dmg, dmg*1.2, true);
    FX.shake(0.8);
    UI.toast("震荡波！", "warn");
  },
  warcry(s){
    G.player.warCryT = 8;
    Audio.bossRoar();
    UI.toast("战吼！近战+50% 移速+20%", "warn");
  },
  execute(s){
    const dmg = 600 + Eco.warriorLv()*120;
    let best = null, bestD = 15;
    for (const n of NPCs.list){
      const d = n.pos.distanceTo(G.player.pos);
      if (d < bestD){ bestD = d; best = n; }
    }
    if (best){
      NPCs.damage(best, dmg, best.pos, G.player.pos);
      FX.burst(best.pos.clone().setY(best.pos.y+1), 0xff6040, 16, 5, 0.9);
    } else {
      UI.toast("处决：附近无敌人", "warn");
    }
    Audio.shot("bat");
  },
  ironbody(s){
    G.player.ironBodyT = 6;
    Audio.bossRoar();
    UI.toast("钢铁之躯！减伤70%", "warn");
  },
  avatar(s){
    G.player.avatarT = 10;
    Audio.bossRoar();
    FX.burst(G.player.pos.clone().setY(G.player.pos.y+1), 0xffd070, 24, 6, 1.0);
    UI.toast("天神下凡！全面强化", "danger");
  },

  /* ---------- 火球术 ---------- */
  fireball(s){
    const from = G.camera.position.clone().addScaledVector(G.player.forward(), 1.2);
    const dir = G.player.forward();
    const dmg = 200 + Eco.mageLv()*50;
    const proj = { mesh:null, body:null, life:4, dmg, radius:5, dead:false, gravityScale:0.1 };
    const mesh = new THREE.Mesh(W.geos.sphere, new THREE.MeshLambertMaterial({color:0xff8030, emissive:0xff5010}));
    mesh.scale.setScalar(1.3);
    mesh.position.copy(from);
    mesh.castShadow = false;
    G.scene.add(mesh);
    const body = new CANNON.Body({mass:2, shape:new CANNON.Sphere(0.55)});
    body.position.set(from.x, from.y, from.z);
    body.velocity.set(dir.x*30, dir.y*30, dir.z*30);
    body.collisionFilterGroup = 16; body.collisionFilterMask = -1;
    body.userData = {proj};
    G.world.addBody(body);
    proj.mesh = mesh; proj.body = body;
    body.addEventListener("collide", (e)=>{
      if (proj.dead) return;
      const pt = new THREE.Vector3(body.position.x, body.position.y, body.position.z);
      const ud = e.body.userData;
      if (ud && ud.npc) NPCs.damage(ud.npc, proj.dmg, pt, null);
      W.explosion(pt, proj.radius, proj.dmg, proj.dmg*1.2, true);
      this.removeProj(proj);
    });
    this._proj.push(proj);
    Audio.shot("rocket");
    FX.muzzle(from, dir);
  },
  updateProj(dt){
    for (const p of this._proj.slice()){
      // 自定义重力缩放（如火球重力降至10%）：抵消多余重力
      if (p.gravityScale !== undefined && p.gravityScale < 1){
        const counter = p.body.mass * (-CFG.GRAVITY) * (1 - p.gravityScale);
        p.body.applyForce(new CANNON.Vec3(0, counter, 0), p.body.position);
      }
      p.mesh.position.copy(p.body.position);
      const cur = new THREE.Vector3(p.body.position.x, p.body.position.y, p.body.position.z);
      const prev = p._prev || cur;
      if (cur.distanceTo(prev) > 0.001){
        const res = W.raycast(prev, cur, {ignorePlayer:true});
        if (res.point && (res.seg || res.npc || res.vehicle || res.prop)){
          const pt = res.point;
          if (res.npc) NPCs.damage(res.npc, p.dmg, pt, null);
          W.explosion(pt, p.radius, p.dmg, p.dmg*1.2, true);
          this.removeProj(p);
          continue;
        }
      }
      p._prev = cur;
      // 出界/落地销毁（寿命无限，仅接触或出界才消失）
      if (p.body.position.y < -25 || Math.abs(p.body.position.x) > 2800 || Math.abs(p.body.position.z) > 2450){
        this.removeProj(p);
      }
    }
  },
  removeProj(p){
    if (p.dead) return;
    p.dead = true;
    if (p.body) G.world.removeBody(p.body);
    if (p.mesh){ G.scene.remove(p.mesh); }
    const i = this._proj.indexOf(p);
    if (i>=0) this._proj.splice(i,1);
  },

  /* ---------- 冰霜新星 ---------- */
  frost(s){
    const dmg = 100 + Eco.mageLv()*25;
    const pos = G.player.pos;
    for (const n of NPCs.list){
      const d = n.pos.distanceTo(pos);
      if (d < 13){
        NPCs.damage(n, dmg*(1-d/13), n.pos, pos);
        n.slowT = 3;
      }
    }
    FX.burst(pos.clone().setY(pos.y+1), 0x80d0ff, 22, 6, 0.9);
    FX.shake(0.4);
    Audio.explosion(false);
    UI.toast("冰霜新星！", "warn");
  },

  /* ---------- 冲锋斩 ---------- */
  charge(s){
    const dmg = 120 + Eco.warriorLv()*35;
    const dir = G.player.forward().setY(0).normalize();
    const start = G.player.pos.clone();
    const end = start.clone().addScaledVector(dir, 9);
    const gy = W.groundHeight(end.x, end.z, G.player.pos.y + 10);
    if (Math.abs(gy - G.player.pos.y) < 3){
      G.player.pos.set(end.x, gy, end.z);
      G.player.vy = 0;
    }
    for (const n of NPCs.list){
      const vx = end.x - start.x, vz = end.z - start.z;
      const t = Math.max(0, Math.min(1, ((n.pos.x-start.x)*vx + (n.pos.z-start.z)*vz) / (vx*vx+vz*vz || 1)));
      const cp = new THREE.Vector3(start.x + vx*t, 0, start.z + vz*t);
      if (Math.hypot(n.pos.x-cp.x, n.pos.z-cp.z) < 2.8){
        NPCs.damage(n, dmg, n.pos, start);
      }
    }
    const res = W.raycast(
      G.player.eyePos(),
      end.clone().setY(G.player.pos.y+1.5),
      {ignorePlayer:true, ignoreNpc:true, ignoreVehicle:true}
    );
    if (res.seg) W.damageSeg(res.seg, dmg, res.point, dir);
    Audio.shot("bat");
    FX.shake(0.4);
  },

  /* ---------- 狂暴 ---------- */
  berserk(s){
    G.player.berserkT = 6;
    UI.toast("狂暴！近战翻倍 + 移速+30%", "warn");
    Audio.bossRoar();
  },
};
