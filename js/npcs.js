/* ============================================================
 * NPC —— 全部为异化怪物（无任何人类形象），带血条
 * AI：游击进攻 / 守卫学校 / 支援另一个校区；12座裂隙持续刷新
 * BOSS：大统领×1、统领×2、精英统领×6（不刷新）
 * ============================================================ */
"use strict";
const NPC_COLORS = {
  grunt:   {body:0x8a9a52, goo:0x9ab452},
  spitter: {body:0x52a080, goo:0x60c08a},
  brute:   {body:0x9a4a38, goo:0xa05040},
  elite:   {body:0x9a5ac0, goo:0xb060d0},
  mini:    {body:0x7a4a9a, goo:0x9058c0},
  mid:     {body:0xa84038, goo:0xc05040},
  big:     {body:0x4a3a58, goo:0x6a50b0},
};

const NPCs = window.NPCs = {
  list: [], _proj: [], spawnTimer: 0, diff: null, cap: 90,
  anchors: {
    A: new THREE.Vector3(1500, 0, -250),
    B: new THREE.Vector3(-1750, 0, -250),
  },

  build(){
    this.list = []; this._proj = [];
    this.diff = CFG.DIFFS[G.diff];
    this.cap = (Input.isTouch ? 300 : CFG.NPC_CAP); // 桌面无上限，手机性能保护300
    const portals = Portals.spawns;
    const init = Math.min(this.diff.init, this.cap); // 手机端初始也受性能保护上限
    for (let i=0;i<init;i++){
      const p = portals[i % portals.length];
      const a = Math.random()*Math.PI*2, r = 4 + Math.random()*9;
      this.spawn(this.pickKind(), p.pos.x + Math.cos(a)*r, p.pos.y, p.pos.z + Math.sin(a)*r, {anchor: p.pos.clone()});
    }
    // BOSS
    const B = CFG.LAYOUT.bosses;
    this.spawn("big", B.big.x, 0, B.big.z, {anchor:new THREE.Vector3(B.big.x,0,B.big.z), isBoss:true});
    for (const m of B.mid) this.spawn("mid", m.x, 0, m.z, {anchor:new THREE.Vector3(m.x,0,m.z), isBoss:true});
    for (const m of B.mini) this.spawn("mini", m.x, m.y, m.z, {anchor:new THREE.Vector3(m.x,m.y,m.z), isBoss:true});
    this.spawnTimer = this.diff.spawnT;
  },

  pickKind(){
    const r = Math.random();
    if (r < 0.42) return "grunt";
    if (r < 0.62) return "spitter";
    if (r < 0.76) return "brute";
    if (r < 0.90) return "elite";
    return "mini";
  },

  spawn(kind, x, y, z, opts){
    opts = opts||{};
    const def = CFG.NPC[kind];
    const d = this.diff;
    const isRaider = !opts.isBoss && Math.random() < CFG.NPC_RAIDER_RATE; // 出城掠袭者：永久索敌
    const npc = {
      kind, def, dead:false, isBoss:!!opts.isBoss, npc:true,
      raider: isRaider,
      hp: def.hp * d.nhp, maxHp: def.hp * d.nhp,
      dmg: def.dmg * d.ndmg,
      speed: def.speed * d.nspd,
      pos: new THREE.Vector3(x, y, z),
      yaw: Math.random()*Math.PI*2, vy: 0, onGround: true,
      mode: opts.mode || (opts.isBoss ? "guard" : (isRaider ? "hunt" : (Math.random()<0.5 ? "guard" : "hunt"))),
      anchor: opts.anchor ? opts.anchor.clone() : new THREE.Vector3(x,0,z),
      homeSide: x >= 0 ? "A" : "B",
      patrolTarget: null, patrolTimer: 0, reEval: 5+Math.random()*10, aggroT: 0,
      attackCd: 0, windup: 0, windupTarget: null,
      chargeCd: 2, chargeT: 0, chargeHit: false,
      slamCd: 3, slamT: 0, throwCd: 2, summonCd: 8,
      stuckT: 0, stuckCheck: 0, lastX: x, lastZ: z, wantMove: false,
      announced: false,
      aggro: def.boss ? (kind==="big"?36:(kind==="mid"?30:26)) : 24,
    };
    // 物理（运动学，手动重力）
    const body = new CANNON.Body({mass:1, shape:new CANNON.Sphere(def.r)});
    body.type = CANNON.Body.KINEMATIC;
    body.position.set(x, y + def.r, z);
    body.aabbNeedsUpdate = true;
    body.fixedRotation = true;
    body.collisionFilterGroup = 4; body.collisionFilterMask = -1;
    body.userData = {npc};
    G.world.addBody(body);
    npc.body = body;
    // 模型（完整版 + 远景简化版）
    const built = buildMonsterMesh(kind, def);
    npc.grp = built.full;
    npc.grpCheap = built.cheap;
    npc._lodFar = false;
    npc._lodT = 0;
    npc.grp.position.copy(npc.pos);
    npc.grp.rotation.y = npc.yaw;
    G.scene.add(npc.grp);
    // 血条（BOSS立即创建；普通怪首次受伤时再创建，节省海量精灵）
    if (def.boss){
      npc.bar = HPBar.make(96, 12, 3.2);
      npc.bar.set(1);
      npc.bar.pos(x, y + def.h + 0.7, z);
    } else {
      npc.bar = null;
    }
    npc._barDamaged = false;
    this.list.push(npc);
    W.spatial.add(npc);
    return npc;
  },

  count(){ return this.list.length; },
  allDead(){ return this.list.length === 0; },

  /* ---------- 伤害 ---------- */
  damage(npc, dmg, point, src){
    if (!npc || npc.dead) return;
    npc.hp -= dmg;
    if (!npc.bar){
      npc.bar = HPBar.make(96, 12, npc.def.boss ? 3.2 : 1.7);
      npc.bar.set(1);
      npc.bar.pos(npc.pos.x, npc.pos.y + npc.def.h + 0.7, npc.pos.z);
    }
    npc._barDamaged = true;
    npc.bar.set(npc.hp/npc.maxHp);
    npc.bar.show();
    const hitPos = point ? point.clone() : npc.pos.clone().add(new THREE.Vector3(0,1,0));
    FX.goo(hitPos, NPC_COLORS[npc.kind].goo);
    // 击退
    if (src && src.x !== undefined){
      const dir = npc.pos.clone().sub(src).setY(0);
      const dl = dir.length();
      if (dl > 0.001){
        dir.multiplyScalar(1/dl);
        npc.pos.addScaledVector(dir, Math.min(0.6, dmg*0.005));
      }
    }
    if (npc.isBoss && !npc.announced){
      npc.announced = true;
      npc.aggroT = 999;
      npc.mode = "hunt";
      UI.toast(`${npc.def.name} 已被激怒！`, "danger");
      Audio.bossRoar();
    }
    if (npc.hp <= 0) this.kill(npc, hitPos);
  },

  kill(npc, point){
    npc.dead = true;
    if (npc.bar) npc.bar.remove();
    G.world.removeBody(npc.body);
    G.scene.remove(npc.grp);
    if (npc.grpCheap && npc.grpCheap.parent) G.scene.remove(npc.grpCheap);
    W.spatial.remove(npc);
    const bounty = npc.def.bounty;
    Eco.addBounty(bounty, npc.kind);
    G.run.kills++;
    UI.killfeed(`+$${Eco.fmt(bounty)}　击杀 ${npc.def.name}`);
    Audio.die();
    FX.burst(npc.pos.clone().setY(npc.pos.y+1), NPC_COLORS[npc.kind].goo, 16, 5, 0.8);
    const i = this.list.indexOf(npc);
    if (i>=0) this.list.splice(i,1);
    if (npc.isBoss) UI.toast(`BOSS ${npc.def.name} 已消灭！`, "warn");
  },

  playerHit(dmg, npc){
    if (G.player.dead) return;
    const v = Vehicles.cur;
    if (v){
      Vehicles.damage(v, dmg*0.6, npc.pos);
    } else {
      G.player.damage(dmg, npc.def.name);
    }
    UI.hitmarker();
  },

  /* ---------- 投射物 ---------- */
  fireProjectile(npc, target){
    const from = npc.pos.clone().setY(npc.pos.y + npc.def.r*1.1 + 0.6);
    const to = target.clone().setY(target.y + 1.2);
    const dist = Math.max(2, from.distanceTo(to));
    const speed = npc.kind==="big" ? 24 : (npc.kind==="mini"||npc.kind==="elite" ? 30 : 15);
    const t = dist/speed;
    const vel = to.clone().sub(from).divideScalar(t);
    vel.y += -CFG.GRAVITY*t*0.5;
    const isRock = npc.kind==="big";
    const size = isRock ? 0.85 : 0.32;
    const color = isRock ? 0x6a5a4a : NPC_COLORS[npc.kind].goo;
    const proj = {
      mesh: null, body: null, life: 6,
      dmg: npc.dmg * (isRock ? 2.4 : 1),
      radius: isRock ? 5 : 1.6,
      isRock, fromNpc:true, npc,
    };
    const mesh = new THREE.Mesh(W.geos.sphere, new THREE.MeshLambertMaterial({color}));
    mesh.scale.setScalar(size*2);
    mesh.castShadow = false;
    mesh.position.copy(from);
    G.scene.add(mesh);
    const body = new CANNON.Body({mass:2, shape:new CANNON.Sphere(size)});
    body.position.set(from.x, from.y, from.z);
    body.velocity.set(vel.x, vel.y, vel.z);
    body.collisionFilterGroup = 16;
    body.collisionFilterMask = 1|2|8|32; // 静态/玩家/载具/残骸（不伤怪物）
    body.userData = {proj};
    G.world.addBody(body);
    proj.mesh = mesh; proj.body = body;
    body.addEventListener("collide", (e)=>{
      if (proj.dead) return;
      const other = e.body;
      const ud = other.userData;
      const pt = new THREE.Vector3(body.position.x, body.position.y, body.position.z);
      if (ud && ud.player){
        G.player.damage(proj.dmg, npc.def.name);
      } else if (ud && ud.vehicle){
        Vehicles.damage(ud.vehicle, proj.dmg, pt);
      }
      if (proj.isRock){
        W.explosion(pt, proj.radius, proj.dmg, proj.dmg, false);
      } else {
        FX.goo(pt, NPC_COLORS[npc.kind].goo);
      }
      this.removeProj(proj);
    });
    this._proj.push(proj);
  },
  removeProj(proj){
    if (proj.dead) return;
    proj.dead = true;
    G.world.removeBody(proj.body);
    G.scene.remove(proj.mesh);
    const i = this._proj.indexOf(proj);
    if (i>=0) this._proj.splice(i,1);
  },

  /* ---------- 更新 ---------- */
  update(dt){
    if (G.state !== "run") return;
    // 裂隙刷新
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0){
      this.spawnTimer = this.diff.spawnT;
      const alivePortals = Portals.spawns.filter(p=>!p.dead);
      const n = Math.min(alivePortals.length, 10); // 大幅增加召唤速度
      for (let i=0;i<n;i++){
        if (this.count() >= this.cap) break;
        const p = alivePortals[Math.floor(Math.random()*alivePortals.length)];
        this.spawn(this.pickKind(),
          p.pos.x + (Math.random()-0.5)*2, p.pos.y, p.pos.z + (Math.random()-0.5)*2,
          {anchor: p.pos.clone()});
      }
    }
    for (const npc of this.list){
      // 远处怪物降频更新（>160m 每4帧更新一次）
      const farD = G.player && G.player.pos.distanceTo(npc.pos) > 160;
      if (farD){
        npc._farAcc = (npc._farAcc||0) + 1;
        if ((npc._farAcc & 3) !== 0) continue;
      }
      this.updateOne(npc, dt* (farD?4:1));
    }
    // 投射物
    for (const proj of this._proj.slice()){
      proj.life -= dt;
      proj.age = (proj.age||0) + dt;
      proj.mesh.position.copy(proj.body.position);
      proj.mesh.rotation.x += dt*10;
      const cur = new THREE.Vector3(proj.body.position.x, proj.body.position.y, proj.body.position.z);
      const prev = proj._prev || cur;
      if (cur.distanceTo(prev) > 0.001){
        const res = W.raycast(prev, cur, {ignoreNpc:true});
        let hit = false;
        if (res.seg || res.vehicle) hit = true;
        else if (res.player) hit = true;
        if (hit && res.point){
          const pt = res.point;
          if (res.player){
            G.player.damage(proj.dmg, proj.npc.def.name);
          }
          if (res.vehicle) Vehicles.damage(res.vehicle, proj.dmg, pt);
          if (proj.isRock) W.explosion(pt, proj.radius, proj.dmg, proj.dmg, false);
          else FX.goo(pt, NPC_COLORS[proj.npc.kind].goo);
          this.removeProj(proj);
          continue;
        }
      }
      proj._prev = cur;
      if (proj.life <= 0 || proj.body.position.y < -8){ this.removeProj(proj); }
    }
  },

  updateOne(npc, dt){
    const p = G.player;
    const pp = (p && !p.dead) ? p.pos : null;
    npc.attackCd -= dt;
    npc.chargeCd -= dt; npc.slamCd -= dt; npc.throwCd -= dt; npc.summonCd -= dt;
    if (npc.aggroT > 0 && npc.aggroT < 900) npc.aggroT -= dt;
    const distP = pp ? npc.pos.distanceTo(pp) : 1e9;

    // 受伤减速
    const wound = npc.hp/npc.maxHp < 0.35 ? 0.82 : 1;
    // 冰霜减速
    const slow = npc.slowT > 0 ? 0.5 : 1;
    npc.slowT = Math.max(0, (npc.slowT||0) - dt);

    // 激怒
    if (pp && distP < npc.aggro){
      npc.mode = "hunt"; npc.aggroT = 8;
    }
    // 周期性 AI 模式
    npc.reEval -= dt;
    if (npc.reEval <= 0){
      npc.reEval = 9 + Math.random()*9;
      if (npc.raider){
        npc.mode = "hunt"; // 出城掠袭者：永远索敌
      } else if (!npc.isBoss && npc.aggroT <= 0){
        const r = Math.random();
        npc.mode = r < 0.35 ? "guard" : (r < 0.65 ? "hunt" : "support");
      } else if (!npc.isBoss && npc.mode !== "hunt"){
        npc.mode = "hunt";
      }
    }
    // 目标
    let target = null;
    if (npc.mode === "hunt" && pp) target = pp;
    else if (npc.mode === "guard"){
      npc.patrolTimer -= dt;
      if (!npc.patrolTarget || npc.patrolTimer <= 0 || npc.pos.distanceTo(npc.patrolTarget) < 1.2){
        npc.patrolTimer = 4 + Math.random()*5;
        const a = Math.random()*Math.PI*2, r = Math.random()*10;
        npc.patrolTarget = new THREE.Vector3(npc.anchor.x + Math.cos(a)*r, 0, npc.anchor.z + Math.sin(a)*r);
      }
      target = npc.patrolTarget;
    } else if (npc.mode === "support"){
      const other = npc.homeSide === "A" ? this.anchors.B : this.anchors.A;
      target = other;
      if (npc.pos.distanceTo(other) < 8){
        npc.mode = "guard";
        npc.anchor.copy(other);
      }
    }

    // 战斗：冲锋
    if (pp && npc.def.charge && npc.chargeCd <= 0 && distP < 15 && distP > 2.5){
      npc.chargeCd = 6.5; npc.chargeT = 1.4; npc.chargeHit = false;
      Audio.bossRoar();
    }
    if (npc.chargeT > 0){
      npc.chargeT -= dt;
      if (pp && distP < 2.6 && !npc.chargeHit){
        npc.chargeHit = true;
        this.playerHit(npc.dmg*1.6, npc);
        FX.shake(0.5);
      }
    }
    // 近战
    const reach = npc.def.r + 1.1;
    if (pp && npc.def.melee){
      if (distP < reach && npc.attackCd <= 0 && npc.windup <= 0){
        npc.windup = npc.isBoss ? 0.5 : 0.32;
        npc.windupTarget = pp.clone();
      }
      if (npc.windup > 0){
        npc.windup -= dt;
        if (npc.windup <= 0 && npc.windupTarget){
          npc.attackCd = 1.0;
          const dd = npc.pos.distanceTo(npc.windupTarget);
          if (dd < reach + 1.2) this.playerHit(npc.dmg, npc);
        }
      }
    }
    // 远程
    if (pp && npc.def.ranged){
      const rr = npc.def.range;
      if (distP < rr && distP > 5 && npc.attackCd <= 0){
        const eyeFrom = npc.pos.clone().setY(npc.pos.y + npc.def.r + 0.5);
        const eyeTo = pp.clone().setY(pp.y + 1.3);
        if (W.raycastLOS(eyeFrom, eyeTo)){
          npc.attackCd = npc.def.rate;
          this.fireProjectile(npc, pp);
        }
      }
    }
    // BOSS 特殊技能
    if (pp && npc.isBoss){
      // 震地
      if (npc.def.slam){
        const sr = npc.kind==="big" ? 10 : 7.5;
        if (distP < sr && npc.slamCd <= 0){
          npc.slamCd = 8;
          npc.slamT = 0.75;
          Audio.warn();
        }
        if (npc.slamT > 0){
          npc.slamT -= dt;
          npc.grp.scale.setScalar(1 + Math.sin(G.time*40)*0.06);
          if (npc.slamT <= 0){
            npc.grp.scale.setScalar(1);
            W.explosion(npc.pos, sr, npc.dmg*1.3, npc.dmg, false);
            FX.shake(1.2);
            Audio.explosion(true);
          }
        }
      }
      // 投石（大统领）
      if (npc.def.throw && distP > 14 && distP < 55 && npc.throwCd <= 0){
        npc.throwCd = 4.5;
        this.fireProjectile(npc, pp);
      }
      // 召唤（大统领）
      if (npc.def.summon && npc.summonCd <= 0 && this.count() < this.cap - 2 && Portals.alive() > 0){
        npc.summonCd = 22;
        for (let i=0;i<2;i++){
          this.spawn("grunt",
            npc.pos.x + (Math.random()-0.5)*6, npc.pos.y, npc.pos.z + (Math.random()-0.5)*6,
            {anchor: npc.pos.clone(), mode:"hunt"});
        }
        UI.toast("大统领召唤了爪牙！", "warn");
      }
    }

    // 移动
    const canMove = npc.windup <= 0 && npc.slamT <= 0;
    const inAttackRange = pp && (
      (npc.def.melee && distP < reach) ||
      (npc.def.ranged && !npc.def.melee && distP < 14)
    );
    npc.wantMove = !!(target && canMove && !(inAttackRange && npc.def.melee));
    if (npc.wantMove){
      const dir = new THREE.Vector3(target.x - npc.pos.x, 0, target.z - npc.pos.z);
      const d = dir.length();
      if (d > 0.6){
        dir.multiplyScalar(1/d);
        // 障碍回避（节流）
        npc._steerT = (npc._steerT||0) - dt;
        if (npc._steerT <= 0){
          npc._steerT = 0.3;
          npc._steerDir = this.steer(npc, dir, dt);
        }
        const steer = npc._steerDir || dir;
        npc.yaw = Math.atan2(steer.x, steer.z);
        const spd = npc.speed * wound * slow * (npc.chargeT > 0 ? 2.6 : 1);
        npc.pos.x += steer.x * spd * dt;
        npc.pos.z += steer.z * spd * dt;
      }
    }
    // 分离
    this.separate(npc);

    // 重力/地面（缓存，减少物理射线）
    npc._gTimer = (npc._gTimer||0) - dt;
    const gMoved = npc._gx === undefined ? 1 : Math.hypot(npc.pos.x - npc._gx, npc.pos.z - npc._gz);
    if (npc._gy === undefined || !npc.onGround || gMoved > 0.4 || npc._gTimer <= 0){
      npc._gy = W.groundHeight(npc.pos.x, npc.pos.z, npc.pos.y + npc.def.r + 0.5);
      npc._gx = npc.pos.x; npc._gz = npc.pos.z; npc._gTimer = 2.5;
    }
    const floorY = npc._gy;
    const restY = floorY + npc.def.r;
    if (npc.pos.y <= restY + 0.08){
      if (!npc.onGround && npc.vy < -6){
        // 落地
      }
      npc.pos.y = restY;
      npc.vy = 0;
      npc.onGround = true;
    } else {
      npc.onGround = false;
      npc.vy += CFG.GRAVITY * dt;
      npc.pos.y += npc.vy * dt;
    }
    // 卡住检测（撞墙→破门/跳跃）
    npc.stuckCheck -= dt;
    if (npc.stuckCheck <= 0){
      npc.stuckCheck = 1.4;
      const moved = Math.hypot(npc.pos.x - npc.lastX, npc.pos.z - npc.lastZ);
      if (npc.wantMove && moved < 0.35){
        npc.stuckT++;
        if (npc.stuckT === 1) npc.vy = 5.5; // 跳跃
        if (npc.stuckT === 2){
          // 前方是围墙/校门 → 直接翻越出城
          const ax = npc.pos.x + Math.sin(npc.yaw)*2.0;
          const az = npc.pos.z + Math.cos(npc.yaw)*2.0;
          let wallSeg = null;
          for (const s of W.spatial.queryCircle(ax, az, 2.2)){
            if ((s.kind === "cwall" || s.kind === "gate") && !s.dead){ wallSeg = s; break; }
          }
          if (wallSeg){
            npc.pos.y += 4.0;
            npc.vy = 0;
            npc.pos.x += Math.sin(npc.yaw)*2.6;
            npc.pos.z += Math.cos(npc.yaw)*2.6;
            npc.stuckT = 0;
          }
        }
        if (npc.stuckT >= 2){
          // 破坏附近的门/墙
          const near = W.spatial.queryCircle(npc.pos.x, npc.pos.z, 3);
          let best = null, bestD = 1e9;
          for (const s of near){
            if (!s.kind) continue;
            if (s.dead || (s.kind!=="door" && s.kind!=="glass")) continue;
            const dd = (s.pos||s.mesh.position).distanceTo(npc.pos);
            if (dd < bestD){ bestD = dd; best = s; }
          }
          if (best) W.damageSeg(best, 90*dt*2, best.mesh.position, new THREE.Vector3(0,0,1));
        }
        if (npc.stuckT >= 5){
          // 强制微调
          npc.pos.x += (Math.random()-0.5)*2;
          npc.pos.z += (Math.random()-0.5)*2;
          npc.stuckT = 0;
        }
      } else {
        npc.stuckT = Math.max(0, npc.stuckT - 1);
      }
      npc.lastX = npc.pos.x;
      npc.lastZ = npc.pos.z;
    }
    // 同步
    npc.body.position.set(npc.pos.x, npc.pos.y, npc.pos.z);
    npc.grp.position.copy(npc.pos);
    npc.grp.rotation.y = npc.yaw;
    if (npc.grpCheap && npc.grpCheap.parent){
      npc.grpCheap.position.copy(npc.pos);
      npc.grpCheap.rotation.y = npc.yaw;
    }
    W.spatial.move(npc, npc.pos);
    if (npc.bar){
      npc.bar.pos(npc.pos.x, npc.pos.y + npc.def.h + 0.7, npc.pos.z);
      const dP = G.player ? Math.hypot(npc.pos.x-G.player.pos.x, npc.pos.z-G.player.pos.z) : 1e9;
      npc.bar.sprite.visible = npc.isBoss || (npc._barDamaged && dP < 60);
    }
    // 远景LOD：>140m 切换简化模型
    npc._lodT = (npc._lodT||0) - dt;
    if (npc._lodT <= 0){
      npc._lodT = 0.5;
      const dP = G.player ? Math.hypot(npc.pos.x-G.player.pos.x, npc.pos.z-G.player.pos.z) : 1e9;
      const far = dP > 140;
      if (far !== npc._lodFar && npc.grpCheap){
        npc._lodFar = far;
        if (far){
          G.scene.remove(npc.grp);
          G.scene.add(npc.grpCheap);
          npc.grpCheap.position.copy(npc.pos);
          npc.grpCheap.rotation.y = npc.yaw;
        } else {
          G.scene.remove(npc.grpCheap);
          G.scene.add(npc.grp);
        }
      }
    }
    if (npc.grp.userData.ring){
      npc.grp.userData.ring.rotation.z += dt*1.5;
    }
    // 大统领光环呼吸
    if (npc.kind==="big" && npc.grp.userData.ring){
      npc.grp.userData.ring.scale.setScalar(npc.def.r*2.6*(1+Math.sin(G.time*2)*0.08));
    }
  },

  steer(npc, dir, dt){
    const eye = npc.pos.clone().setY(npc.pos.y + npc.def.r + 0.4);
    const up = new THREE.Vector3(0, 0.1, 0);
    const check = (d)=>{
      const to = eye.clone().addScaledVector(d, 3.2);
      return W.raycastLOS(eye, to);
    };
    if (check(dir)) return dir;
    const left = new THREE.Vector3(-dir.z, 0, dir.x);
    const l = check(left.clone().add(dir).normalize());
    const r = check(left.clone().negate().add(dir).normalize());
    if (l && !r) return left.clone().add(dir).normalize();
    if (r && !l) return left.clone().negate().add(dir).normalize();
    if (l && r) return dir;
    return left.clone().negate(); // 掉头
  },

  separate(npc){
    const near = W.spatial.queryCircle(npc.pos.x, npc.pos.z, 3.2);
    for (const o of near){
      if (!o.npc || o === npc || o.dead) continue;
      const dx = npc.pos.x - o.pos.x, dz = npc.pos.z - o.pos.z;
      const d = Math.hypot(dx, dz);
      const min = npc.def.r + o.def.r;
      if (d > 0.001 && d < min){
        const push = (min - d) * 0.5;
        const nx = dx/d, nz = dz/d;
        npc.pos.x += nx*push; npc.pos.z += nz*push;
        o.pos.x -= nx*push; o.pos.z -= nz*push;
      }
    }
  },
};

/* ---------- 怪物模型 ---------- */
function buildMonsterMesh(kind, def){
  const col = NPC_COLORS[kind];
  const bodyMat = new THREE.MeshLambertMaterial({color: col.body});
  const eyeMat = new THREE.MeshBasicMaterial({color: def.boss ? 0xff6040 : 0xffe060});
  const hornMat = new THREE.MeshLambertMaterial({color: def.boss ? 0x2a2438 : 0xd8d0c0});
  const mk = (grp, geo, mat, sx, sy, sz, x, y, z, rz)=>{
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    if (rz) m.rotation.z = rz;
    m.castShadow = false; // 海量怪物禁用投影
    grp.add(m);
    return m;
  };
  // 完整模型（近景）
  const grp = new THREE.Group();
  mk(grp, W.geos.sphere, bodyMat, def.r*2, def.h*0.62, def.r*2, 0, def.h*0.42, 0);
  if (kind !== "brute" && kind !== "mid" && kind !== "big"){
    mk(grp, W.geos.sphere, bodyMat, def.r*0.95, def.r*0.95, def.r*0.95, 0, def.h*0.8, 0);
  }
  for (const s of [-1,1]){
    mk(grp, W.geos.sphere, eyeMat, def.r*0.24, def.r*0.24, def.r*0.24, s*def.r*0.4, def.h*0.8, def.r*0.72);
  }
  for (const s of [-1,1]){
    mk(grp, W.geos.sphere, bodyMat, def.r*0.42, def.r*0.42, def.r*0.42, s*(def.r+0.28), def.h*0.46, 0);
  }
  for (const s of [-1,1]){
    mk(grp, W.geos.cone, hornMat, def.r*0.3, def.h*0.28, def.r*0.3, s*def.r*0.5, def.h*0.92, 0, s*0.55);
  }
  if (def.boss){
    mk(grp, W.geos.cone, hornMat, def.r*0.36, def.h*0.34, def.r*0.36, 0, def.h*1.0, def.r*0.3);
  }
  if (kind === "elite" || kind === "mini"){
    for (let i=0;i<3;i++){
      const a = (i/3)*Math.PI*2;
      mk(grp, W.geos.cone, hornMat, def.r*0.2, def.r*0.2, def.r*0.2, Math.cos(a)*def.r*0.7, def.h*0.55, Math.sin(a)*def.r*0.7);
    }
  }
  if (kind === "big"){
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 6, 20), new THREE.MeshBasicMaterial({color:0xa060ff, transparent:true, opacity:0.7}));
    ring.scale.setScalar(def.r*2.6);
    ring.rotation.x = Math.PI/2;
    ring.position.y = 0.35;
    grp.add(ring);
    grp.userData.ring = ring;
  }
  // 简化模型（远景LOD）
  const cheap = new THREE.Group();
  mk(cheap, W.geos.sphere, bodyMat, def.r*2, def.h*0.62, def.r*2, 0, def.h*0.42, 0);
  mk(cheap, W.geos.sphere, eyeMat, def.r*0.3, def.r*0.3, def.r*0.3, 0, def.h*0.72, def.r*0.7);
  return {full:grp, cheap};
}
