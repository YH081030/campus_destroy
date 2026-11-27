/* ============================================================
 * 武器 —— 近战/枪械/手榴弹/火箭筒/导弹（空间背包，无容量限制）
 * ============================================================ */
"use strict";
const Weapons = window.Weapons = {
  cur: null, // 当前武器id
  cooldown: 0, reloadT: 0, mag: 0, swayT: 0, recoil: 0,
  missileMode: 0, // 导弹类型：0普通 1大型 2巨型
  _proj: [], _tracers: [],
  swing: 0, swingSide: 1,

  init(){
    this.cur = Eco.owned.weapons[0] || "knife";
    this.cooldown = 0; this.reloadT = 0; this.swayT = 0; this.recoil = 0;
    this._proj = []; this._tracers = [];
    const w = CFG.WEAPONS[this.cur];
    if (w && w.mag) this.mag = w.mag;
    else this.mag = 0;
  },

  ownedList(){
    return Eco.owned.weapons.filter(id => CFG.WEAPONS[id]);
  },
  def(){ return CFG.WEAPONS[this.cur]; },

  switchTo(id){
    const w = CFG.WEAPONS[id];
    if (!w || !Eco.owned.weapons.includes(id)) return;
    if (w.throwable){ this.throwGrenade(); return; }
    this.cur = id;
    this.reloadT = 0;
    if (w.mag){ this.mag = w.mag; }
    Audio.click();
  },
  cycle(dir){
    const list = this.ownedList().filter(id => !CFG.WEAPONS[id].throwable);
    if (!list.length) return;
    let i = list.indexOf(this.cur);
    i = (i + dir + list.length) % list.length;
    this.switchTo(list[i]);
  },
  bySlot(slot){
    const list = this.ownedList();
    const w = list.find(id => CFG.WEAPONS[id].slot === slot);
    if (w) this.switchTo(w);
  },

  adsFov(){
    if (this.reloadT > 0) return 68;
    const w = this.def();
    if (w && !w.melee && !w.throwable && Input.adsDown){
      return w.zoom ? 18 : 46;
    }
    return 72;
  },

  update(dt){
    this.cooldown -= dt;
    this.recoil = Math.max(0, this.recoil - dt*6);
    this.swing = Math.max(0, this.swing - dt*3);
    // 换弹
    if (this.reloadT > 0){
      this.reloadT -= dt;
      if (this.reloadT <= 0){
        const w = this.def();
        const pool = Eco.ammo[w.ammo] || 0;
        const need = w.mag - this.mag;
        const take = Math.min(need, pool);
        this.mag += take;
        Eco.ammo[w.ammo] = pool - take;
        Eco.save();
      }
    }
    // 投射物与弹道（无论是否驾驶都要更新）
    for (const p of this._proj.slice()) this.updateProj(p, dt);
    for (const t of this._tracers.slice()){
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life/0.06);
      if (t.life <= 0){
        G.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        t.mesh.material.dispose();
        this._tracers.splice(this._tracers.indexOf(t),1);
      }
    }
    // 射击
    const w = this.def();
    if (!w) return;
    // 武装载具（挖掘机/装甲车/坦克/直升机/轰炸机）使用载具自身武器；
    // 开放骑乘载具（自行车/电动车/摩托/轿车）可正常射击
    const vv = G.player.vehicle;
    if (vv && (vv.def.arm || vv.def.gun || vv.def.cannon || vv.def.rockets || vv.def.bombs)) return;
    if (w.throwable) return;
    const wantFire = w.auto ? Input.fireDown : Input.fireEdge;
    if (w.melee){
      if (Input.fireEdge && this.cooldown <= 0) this.melee();
    } else if (wantFire){
      if (w.proj){
        if (this.cooldown <= 0) this.fireProjectileWeapon(w);
      } else {
        if (this.mag <= 0){
          if (Input.fireEdge) this.tryReload();
        } else if (this.reloadT <= 0 && this.cooldown <= 0){
          this.fireGun(w);
        }
      }
    }
    if (Input.keyPressed("KeyR")) this.tryReload();
    if (Input.keyPressed("KeyQ")) this.cycle(1);
    // 数字键切换
    for (let i=1;i<=9;i++){
      if (Input.keyPressed("Digit"+i)) this.bySlot(i);
    }
    if (Input.keyPressed("Digit0")) this.bySlot(0);
    if (Input.keyPressed("KeyG")){
      const cw = this.def();
      if (cw && cw.missileTarget){
        this.missileMode = (this.missileMode + 1) % 3;
        UI.toast("导弹类型：" + CFG.MISSILES[this._missileType()].name, "warn");
      } else {
        this.throwGrenade();
      }
    }
    // 滚轮
    if (Math.abs(Input.wheelDelta) > 40){
      this.cycle(Input.wheelDelta > 0 ? 1 : -1);
    }
  },

  muzzlePos(){
    const c = G.camera;
    const f = this.forwardDir();
    let right;
    if (G.player.vehicle){
      right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0,1,0)).normalize();
    } else {
      right = new THREE.Vector3(-Math.cos(G.player.yaw), 0, Math.sin(G.player.yaw));
    }
    return c.position.clone().addScaledVector(f, 0.7).addScaledVector(right, 0.22).add(new THREE.Vector3(0,-0.18,0));
  },
  /* 瞄准方向：步行=玩家朝向；骑乘=镜头朝向 */
  aimDir(){
    if (G.player.vehicle){
      const d = new THREE.Vector3();
      G.camera.getWorldDirection(d);
      return d;
    }
    return G.player.forward();
  },
  forwardDir(){
    // 含散布的瞄准方向
    const w = this.def();
    let spread = (w.spread || 0.005);
    const moving = Math.hypot(G.player.vel.x, G.player.vel.z);
    if (moving > 3) spread *= Input.sprintHeld() ? 3.2 : 1.7;
    spread *= (1 + this.recoil*1.2);
    if (G.player.hp/G.player.maxHp < 0.35) spread *= 1.5;
    if (Input.adsDown) spread *= w.zoom ? 0.12 : 0.45;
    const f = this.aimDir().clone();
    if (spread > 0.0001){
      const a = Math.random()*Math.PI*2;
      const r = spread*Math.random();
      const upRef = Math.abs(f.y) > 0.99 ? new THREE.Vector3(1,0,0) : new THREE.Vector3(0,1,0);
      const right = new THREE.Vector3().crossVectors(f, upRef).normalize();
      const up = new THREE.Vector3().crossVectors(right, f).normalize();
      f.addScaledVector(right, Math.cos(a)*r).addScaledVector(up, Math.sin(a)*r).normalize();
    }
    return f;
  },

  fireGun(w){
    this.cooldown = w.rate;
    const n = w.pellets || 1;
    const from = this.muzzlePos();
    Audio.shot(w.id || "rifle");
    FX.muzzle(from, this.aimDir());
    this.recoil = Math.min(1.4, this.recoil + 0.12);
    G.player.pitch += 0.004; // 后座
    for (let i=0;i<n;i++){
      const dir = this.forwardDir();
      const to = from.clone().addScaledVector(dir, 400 * Eco.gunRangeMult());
      this.hitscan(from, to, dir, w.dmg * Eco.rangeMult() * Eco.gunDmgMult());
    }
    this.mag--;
    if (this.mag <= 0) this.tryReload();
    UI.refreshHud();
  },

  hitscan(from, to, dir, dmg){
    const res = W.raycast(from, to, {ignorePlayer:true});
    const hit = res.point || to;
    // 弹道
    const geo = new THREE.BufferGeometry().setFromPoints([from, hit]);
    const mat = new THREE.LineBasicMaterial({color:0xffd080, transparent:true, opacity:0.8});
    const line = new THREE.Line(geo, mat);
    G.scene.add(line);
    this._tracers.push({mesh:line, life:0.06});
    if (res.seg){
      W.damageSeg(res.seg, dmg, res.point, dir);
      FX.sparks(res.point, 0xffd070);
    } else if (res.prop){
      const pr = res.prop;
      if (pr.isPortal){
        Portals.hit(pr, dmg, res.point);
        FX.sparks(res.point, 0xc060e0);
      } else if (pr.water){
        FX.burst(res.point, 0x5aa0c0, 8, 4, 0.5);
      } else if (pr.isPropEntry){
        SU.damageProp(pr, dmg, res.point, dir);
        FX.sparks(res.point, 0xd8c8a0);
      }
    } else if (res.vehicle){
      Vehicles.damage(res.vehicle, dmg, res.point);
      FX.sparks(res.point, 0xffd070);
    } else if (res.npc){
      NPCs.damage(res.npc, dmg, res.point, from);
      UI.hitmarker();
    } else {
      FX.sparks(hit, 0xcccccc);
    }
    return res;
  },

  melee(){
    const w = this.def();
    this.cooldown = w.rate;
    this.swing = 1;
    this.swingSide *= -1;
    Audio.shot("bat");
    const from = G.camera.position;
    const dir = this.aimDir();
    const dmg = w.dmg * Eco.meleeMult() * (G.player.berserkT > 0 ? 2 : 1) * (G.player.warCryT > 0 ? 1.5 : 1) * (G.player.avatarT > 0 ? 2 : 1);
    const to = from.clone().addScaledVector(dir, w.reach);
    const res = W.raycast(from, to, {ignorePlayer:true});
    if (res.seg){
      W.damageSeg(res.seg, dmg, res.point, dir);
      FX.sparks(res.point, 0xffd070);
    } else if (res.prop){
      const pr = res.prop;
      if (pr.isPortal) Portals.hit(pr, dmg, res.point);
      else if (pr.isPropEntry) SU.damageProp(pr, dmg, res.point, dir);
    } else if (res.npc){
      const npc = res.npc;
      NPCs.damage(npc, dmg, res.point, from);
      UI.hitmarker();
    }
    // 近身横扫（对范围内怪物）
    for (const npc of NPCs.list){
      const d = npc.pos.distanceTo(G.player.pos);
      if (d < w.reach && d > 0.01){
        const toNpc = npc.pos.clone().sub(G.player.pos).setY(0).normalize();
        const dot = toNpc.dot(new THREE.Vector3(dir.x, 0, dir.z).normalize());
        if (dot > 0.55){
          NPCs.damage(npc, dmg*0.8, npc.pos, G.player.pos);
          UI.hitmarker();
        }
      }
    }
  },

  fireProjectileWeapon(w){
    if (w.missileTarget){ this.fireMissileTarget(w); return; }
    if (w.mortar){ this.fireMortar(w); return; }
    if (this.mag <= 0){
      this.tryReload();
      return;
    }
    this.cooldown = w.rate;
    this.mag--;
    UI.refreshHud();
    if (this.mag <= 0) this.tryReload();
    const from = this.muzzlePos();
    const dir = this.aimDir();
    Audio.shot("rocket");
    FX.muzzle(from, dir);
    const proj = {
      mesh:null, body:null, life: w.guided?7:5,
      dmg:w.dmg * Eco.rangeMult(), radius:w.radius, speed:w.projSpeed,
      guided:!!w.guided, target:null, dead:false, remote:true,
    };
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.4, 8), new THREE.MeshLambertMaterial({color: w.guided?0x5a6a8a:0x4a5a3a}));
    mesh.position.copy(from);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir);
    G.scene.add(mesh);
    const body = new CANNON.Body({mass:3, shape:new CANNON.Sphere(0.22)});
    body.position.set(from.x, from.y, from.z);
    body.velocity.set(dir.x*w.projSpeed, dir.y*w.projSpeed, dir.z*w.projSpeed);
    body.collisionFilterGroup = 16; body.collisionFilterMask = -1;
    body.userData = {proj};
    G.world.addBody(body);
    proj.mesh = mesh; proj.body = body;
    if (w.guided){
      let best = null, bestD = 90;
      for (const npc of NPCs.list){
        const d = npc.pos.distanceTo(from);
        const toN = npc.pos.clone().sub(from).setY(0).normalize();
        const dot = toN.dot(new THREE.Vector3(dir.x,0,dir.z).normalize());
        if (d < bestD && dot > 0.5){ bestD = d; best = npc; }
      }
      proj.target = best;
    }
    body.addEventListener("collide", (e)=>{
      if (proj.dead) return;
      const ud = e.body.userData;
      const pt = new THREE.Vector3(body.position.x, body.position.y, body.position.z);
      if (ud && ud.npc) NPCs.damage(ud.npc, proj.dmg, pt, from);
      W.explosion(pt, proj.radius, proj.dmg, proj.dmg*1.2, true);
      this.removeProj(proj);
    });
    this._proj.push(proj);
  },

  /* 迫击炮：高抛弹道，参考真实射程（最小30m，最大340m） */
  fireMortar(w){
    this.cooldown = w.rate;
    this.mag--;
    UI.refreshHud();
    if (this.mag <= 0) this.tryReload();
    const from = G.camera.position;
    const dir = this.aimDir();
    // 找落点：忽略道具(树/长椅)/怪物/载具，仅瞄准地形与建筑
    const res = W.raycast(from, from.clone().addScaledVector(dir, w.maxRange), {ignorePlayer:true, ignoreNpc:true, ignoreProps:true, ignoreVehicle:true});
    let target;
    if (res.point && res.dist <= w.maxRange){
      target = res.point.clone();
    } else {
      target = from.clone().addScaledVector(dir, w.maxRange);
      target.y = W.groundHeightStatic(target.x, target.z, 200);
    }
    const dist = Math.hypot(target.x-from.x, target.z-from.z);
    // 取消最小射程限制（近距也可发射）
    target.y = Math.max(target.y, from.y - 5) + 0.4;
    this.launchArcProj(from, target, w.dmg * Eco.rangeMult(), w.radius, 0x5a6a3a, {});
  },

  /* 导弹类型（万能发射器） */
  _missileType(){ return ["normal","large","huge"][this.missileMode] || "normal"; },

  /* 发射前：检查所选类型弹药并打开地图选点 */
  fireMissileTarget(w){
    const m = CFG.MISSILES[this._missileType()];
    if ((Eco.ammo[m.ammo]||0) <= 0){
      UI.toast(`${m.name}已耗尽（商店购买，G键切换类型）`, "warn");
      return;
    }
    UI.openMissileTarget(w);
  },

  /* 导弹：地图选点，射程无限（全图）；从目标上方高空俯冲避免高速穿图卡顿 */
  launchMissile(w, x, z){
    const m = CFG.MISSILES[this._missileType()];
    if ((Eco.ammo[m.ammo]||0) <= 0){ UI.toast(`${m.name}已耗尽`, "warn"); return; }
    this.cooldown = w.rate;
    Eco.ammo[m.ammo]--;
    Eco.save();
    UI.refreshHud();
    const gy = W.groundHeightStatic(x, z, 200);
    const target = new THREE.Vector3(x, Math.max(0, gy) + 0.5, z);
    const spawnY = Math.max(G.camera.position.y, target.y) + 150;
    const high = new THREE.Vector3(target.x, spawnY, target.z);
    this.launchDive(high, target, m.dmg * Eco.rangeMult(), m.radius, 0x5a6a8a, {big:true, life:20, boom: m.radius >= 30});
    UI.toast(`${m.name}已发射`, "warn");
    Audio.shot("rocket");
  },

  /* 高空俯冲弹（导弹专用）：从目标正上方俯冲，速度适中，不穿图 */
  launchDive(from, target, dmg, radius, color, opts){
    opts = opts||{};
    const dir = target.clone().sub(from).normalize();
    const proj = { mesh:null, body:null, life:opts.life||20, dmg, radius, speed:80, dead:false, arced:true, boom: !!opts.boom, remote:true };
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.6, 8), new THREE.MeshLambertMaterial({color}));
    mesh.position.copy(from);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir);
    G.scene.add(mesh);
    const body = new CANNON.Body({mass:30, shape:new CANNON.Sphere(0.55)});
    body.position.set(from.x, from.y, from.z);
    body.velocity.set(dir.x*80, dir.y*80, dir.z*80);
    body.collisionFilterGroup = 16; body.collisionFilterMask = -1;
    body.userData = {proj};
    G.world.addBody(body);
    proj.mesh = mesh; proj.body = body;
    body.addEventListener("collide", (e)=>{
      if (proj.dead) return;
      const ud = e.body.userData;
      const pt = new THREE.Vector3(body.position.x, body.position.y, body.position.z);
      if (ud && ud.npc) NPCs.damage(ud.npc, proj.dmg, pt, from);
      if (proj.boom) W.bigExplosion(pt, proj.radius, proj.dmg, proj.dmg*1.3);
      else W.explosion(pt, proj.radius, proj.dmg, proj.dmg*1.3, true);
      this.removeProj(proj);
    });
    this._proj.push(proj);
  },

  /* 高抛弹道投射物（迫击炮/导弹共用） */
  launchArcProj(from, target, dmg, radius, color, opts){
    opts = opts||{};
    const dx = target.x-from.x, dy = target.y-from.y, dz = target.z-from.z;
    const dist = Math.hypot(dx, dz);
    const speed = Math.min(200, Math.max(55, dist * (opts.fast ? 1.35 : 0.85)));
    const t = dist / (speed*0.72);
    const vx = dx/t, vz = dz/t;
    const vy = (dy/t) + 10*t; // g=-20，抛物线补偿
    const proj = {
      mesh:null, body:null, life:opts.life||12,
      dmg, radius, speed, dead:false, arced:true, remote:true,
    };
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, opts.big?2.4:1.6, 8), new THREE.MeshLambertMaterial({color}));
    mesh.position.copy(from);
    G.scene.add(mesh);
    const body = new CANNON.Body({mass: opts.big?30:8, shape:new CANNON.Sphere(opts.big?0.6:0.35)});
    body.position.set(from.x, from.y, from.z);
    body.velocity.set(vx, vy, vz);
    body.collisionFilterGroup = 16; body.collisionFilterMask = -1;
    body.userData = {proj};
    G.world.addBody(body);
    proj.mesh = mesh; proj.body = body;
    body.addEventListener("collide", (e)=>{
      if (proj.dead) return;
      const ud = e.body.userData;
      const pt = new THREE.Vector3(body.position.x, body.position.y, body.position.z);
      if (ud && ud.npc) NPCs.damage(ud.npc, proj.dmg, pt, from);
      W.explosion(pt, proj.radius, proj.dmg, proj.dmg*1.3, true);
      this.removeProj(proj);
    });
    this._proj.push(proj);
  },

  throwGrenade(){
    if (this.cooldown > 0) return;
    const n = Eco.ammo.grenade || 0;
    if (n <= 0){ UI.toast("没有手榴弹（商店购买）", "warn"); return; }
    this.cooldown = 0.8;
    Eco.ammo.grenade = n-1;
    Eco.save();
    const from = this.muzzlePos();
    const dir = this.aimDir();
    Audio.click();
    const proj = {
      mesh:null, body:null, life:CFG.WEAPONS.grenade.fuse,
      dmg:CFG.WEAPONS.grenade.dmg * Eco.rangeMult(), radius:CFG.WEAPONS.grenade.radius,
      grenade:true, dead:false,
    };
    const mesh = new THREE.Mesh(W.geos.sphere, new THREE.MeshLambertMaterial({color:0x3a4a3a}));
    mesh.scale.setScalar(0.34);
    mesh.position.copy(from);
    G.scene.add(mesh);
    const body = new CANNON.Body({mass:0.6, shape:new CANNON.Sphere(0.17)});
    body.position.set(from.x, from.y, from.z);
    body.velocity.set(dir.x*14, dir.y*14+3.5, dir.z*14);
    body.angularVelocity.set(Math.random()*10, Math.random()*10, Math.random()*10);
    body.collisionFilterGroup = 16; body.collisionFilterMask = -1;
    body.userData = {proj};
    G.world.addBody(body);
    proj.mesh = mesh; proj.body = body;
    this._proj.push(proj);
  },

  updateProj(p, dt){
    if (p.dead) return;
    p.age = (p.age||0) + dt;
    const cur = new THREE.Vector3(p.body.position.x, p.body.position.y, p.body.position.z);
    // 防空/大阵拦截远程武器
    if (p.remote && W.intercept(cur)){
      FX.sparks(cur, 0x80d0ff);
      this.removeProj(p);
      return;
    }
    // 仅手榴弹有引信寿命（到期爆炸）；其它弹体寿命无限
    if (p.grenade){
      p.life -= dt;
      if (p.life <= 0){
        if (p.dmg) W.explosion(cur, p.radius, p.dmg, p.dmg*1.2, true);
        this.removeProj(p);
        return;
      }
    }
    // 扫掠检测（防高速穿透）
    if (!p.grenade){
      const prev = p._prev || cur;
      if (cur.distanceTo(prev) > 0.001){
        const res = W.raycast(prev, cur, {ignorePlayer: p.age < 0.4});
        let hit = false;
        if (res.seg || res.vehicle) hit = true;
        else if (res.prop && !res.prop.water) hit = true;
        else if (res.npc) hit = true;
        else if (res.player && p.age > 0.4) hit = true;
        if (hit && res.point){
          this.resolveProjHit(p, res);
          return;
        }
      }
      p._prev = cur;
    }
    p.mesh.position.copy(p.body.position);
    if (p.guided && p.target && !p.target.dead){
      const to = p.target.pos.clone().setY(p.target.pos.y+1.2);
      const cur = new THREE.Vector3(p.body.velocity.x, p.body.velocity.y, p.body.velocity.z);
      const want = to.clone().sub(p.mesh.position).normalize().multiplyScalar(p.speed);
      cur.lerp(want, Math.min(1, 4*dt));
      p.body.velocity.set(cur.x, cur.y, cur.z);
      p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), cur.clone().normalize());
    } else if (!p.grenade){
      p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), new THREE.Vector3(p.body.velocity.x,p.body.velocity.y,p.body.velocity.z).normalize());
    } else {
      p.mesh.rotation.x += dt*8;
      p.mesh.rotation.y += dt*6;
    }
    if (p.grenade){
      // 引信闪烁
      const blink = Math.sin(G.time*18) > 0;
      p.mesh.material.color.setHex(blink ? 0xff4030 : 0x3a4a3a);
    }
    if (p.body.position.y < -20) this.removeProj(p);
  },
  removeProj(p){
    if (p.dead) return;
    p.dead = true;
    if (p.body) G.world.removeBody(p.body);
    if (p.mesh){ G.scene.remove(p.mesh); }
    const i = this._proj.indexOf(p);
    if (i>=0) this._proj.splice(i,1);
  },

  resolveProjHit(p, res){
    const pt = res.point;
    if (res.npc){
      NPCs.damage(res.npc, p.dmg, pt, null);
    }
    if (res.vehicle) Vehicles.damage(res.vehicle, p.dmg, pt);
    if (res.prop && res.prop.isPortal) Portals.hit(res.prop, p.dmg, pt);
    if (p.boom) W.bigExplosion(pt, p.radius, p.dmg, p.dmg*1.2);
    else W.explosion(pt, p.radius, p.dmg, p.dmg*1.2, true);
    this.removeProj(p);
  },

  tryReload(){
    const w = this.def();
    if (!w || !w.mag) return;
    if (this.mag >= w.mag) return;
    const pool = Eco.ammo[w.ammo] || 0;
    if (pool <= 0){ UI.toast("弹药不足（商店购买）", "warn"); return; }
    if (this.reloadT > 0) return;
    this.reloadT = w.reload;
    Audio.reload();
  },
  hintText(){
    if (G.player && G.player.vehicle){
      const d = G.player.vehicle.def;
      if (d.arm || d.gun || d.cannon || d.rockets || d.bombs) return "";
    }
    const w = this.def();
    if (!w) return "";
    if (w.melee) return `近战伤害 ${w.dmg} · G手雷 · 1-9切换`;
    if (w.throwable) return `投掷 爆炸半径${w.radius}m · 1-9切换`;
    if (w.missileTarget) return `万能发射器 · ${CFG.MISSILES[this._missileType()].name} · G切换类型 · 左键瞄准发射`;
    return `${w.auto?"全自动":"单发"} · ${w.zoom?"右键高倍镜":"右键瞄准"} · G手雷 · B商店`;
  },
};
