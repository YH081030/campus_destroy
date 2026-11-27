/* ============================================================
 * 载具 —— 自行车/电动车/摩托车/轿车/挖掘机/装甲车/坦克/直升机/轰炸机
 * 载具被摧毁即消耗；挖掘机可拆除建筑；坦克主炮/直升机火箭/轰炸机航弹
 * ============================================================ */
"use strict";
const Vehicles = window.Vehicles = {
  list: [], cur: null,
  gunCd: 0, cannonCd: 0, rocketCd: 0, bombCd: 0, armCd: 0,

  reset(){
    for (const v of this.list) this.removeVehicle(v, false);
    this.list = [];
    this.cur = null;
    this.gunCd = 0; this.cannonCd = 0; this.rocketCd = 0; this.bombCd = 0; this.armCd = 0;
  },
  removeVehicle(v, explode){
    v.dead = true;
    if (v.body) G.world.removeBody(v.body);
    if (v.grp){ G.scene.remove(v.grp); }
    W.spatial.remove(v);
    const i = this.list.indexOf(v);
    if (i>=0) this.list.splice(i,1);
    if (this.cur === v) this.cur = null;
    if (G.player && G.player.vehicle === v){
      // 安全弹射：落地继续行动，短暂无敌防止被爆炸波及
      G.player.vehicle = null;
      const ex = v.pos.x + Math.cos(v.yaw)*3, ez = v.pos.z - Math.sin(v.yaw)*3;
      const gy = W.groundHeightStatic(ex, ez, v.pos.y + 25);
      G.player.pos.set(ex, Math.max(0, gy), ez);
      G.player.vy = 2;
      G.player.yaw = v.yaw;
      G.player.pitch = 0;
      G.player.invuln = Math.max(G.player.invuln||0, 1.3);
      UI.toast("载具被摧毁，已安全弹射落地", "warn");
    }
    if (explode){
      W.explosion(v.pos, 9, 900, 1500, true);
      UI.toast(`${v.def.name} 被摧毁！`, "danger");
      Audio.explosion(true);
    }
  },

  deploy(kind){
    const def = CFG.VEHICLES[kind];
    if (!def) return;
    if ((Eco.owned.vehicles[kind]||0) <= 0){
      UI.toast("车库中没有该载具（商店购买）", "warn");
      return;
    }
    Eco.owned.vehicles[kind]--;
    Eco.save();
    const p = G.player.pos;
    const back = new THREE.Vector3(-Math.sin(G.player.yaw), 0, -Math.cos(G.player.yaw));
    const x = p.x + back.x*5, z = p.z + back.z*5;
    const v = this.spawnVehicle(kind, x, z, G.player.yaw);
    this.enter(v);
    UI.toast(`部署 ${def.name}`, "warn");
  },

  spawnVehicle(kind, x, z, yaw){
    const def = CFG.VEHICLES[kind];
    const v = {
      kind, def, dead:false, vehicle:true,
      pos: new THREE.Vector3(x, 0, z),
      yaw: yaw||0, pitch: 0, speed: 0, vy: 0,
      vel: new THREE.Vector3(),
      hp: def.hp, maxHp: def.hp,
      gunAmmo: def.gunAmmo||0,
      armAngle: 0, armDir: 0,
      bombMode: 0, // 0=普通航弹 1=强力航弹 2=小型核弹
      fwd(){ return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); },
    };
    const built = buildVehicleMesh(kind);
    v.grp = built.grp;
    v.wheels = built.wheels||[];
    v.rotors = built.rotors||[];
    v.arm = built.arm||null;
    v.turret = built.turret||null;
    v.barrel = built.barrel||null;
    v.grp.position.set(x, 0, z);
    v.grp.rotation.y = v.yaw;
    G.scene.add(v.grp);
    const hx = def.fly ? (kind==="bomber"?3.6:2.4) : (kind==="tank"?3.4 : kind==="apc"?3.2 : kind==="excavator"?1.8 : kind==="car"?2.3 : 0.9);
    v.hx = hx;
    const hy = def.fly ? 1.0 : (kind==="tank"||kind==="apc"?1.3 : kind==="excavator"?1.3 : kind==="car"?0.7 : 0.55);
    const hz = def.fly ? (kind==="bomber"?1.1:0.9) : (kind==="tank"?1.7 : kind==="apc"?1.4 : kind==="excavator"?1.3 : kind==="car"?1.0 : 0.4);
    const body = new CANNON.Body({mass:1, shape:new CANNON.Box(new CANNON.Vec3(hx, hy, hz))});
    body.type = CANNON.Body.KINEMATIC;
    body.fixedRotation = true;
    body.position.set(x, def.fly ? 6 : 1, z);
    body.aabbNeedsUpdate = true;
    body.collisionFilterGroup = 8; body.collisionFilterMask = -1;
    body.userData = {vehicle: v};
    G.world.addBody(body);
    v.body = body;
    this.list.push(v);
    W.spatial.add(v);
    return v;
  },

  /* 载具相机预设：自行车类=骑乘第一视角(车在身下)；装甲/坦克=上帝视角；其余追尾 */
  camPreset(v){
    switch(v.kind){
      case "bike":  return {d:0.35, h:1.28, lookF:12, lookY:1.1, fp:true};
      case "ebike": return {d:0.4,  h:1.3,  lookF:12, lookY:1.1, fp:true};
      case "moto":  return {d:0.5,  h:1.42, lookF:12, lookY:1.2, fp:true};
      case "car":   return {d:7.5, h:3.0, lookF:6, lookY:1.0};
      case "excavator": return {d:9, h:3.6, lookF:6, lookY:1.2};
      case "apc":   return {d:12, h:16, lookF:0, lookY:0.5};   // 上帝视角
      case "tank":  return {d:14, h:18, lookF:0, lookY:0.5};   // 上帝视角
      case "heli":  return {d:13, h:4.5, lookF:14, lookY:1.2};
      case "bomber":return {d:17, h:5.5, lookF:16, lookY:1.2};
      default:      return {d:7.5, h:3.0, lookF:6, lookY:1.0};
    }
  },
  enter(v){
    if (!v || v.dead) return;
    this.cur = v;
    G.player.vehicle = v;
    // 上车：清空视角残留并立即对齐相机
    v.camYaw = 0; v.camPitch = 0;
    Input.mouseDX = 0; Input.mouseDY = 0;
    const P = this.camPreset(v);
    G.camera.position.set(
      v.pos.x - Math.sin(v.yaw)*P.d,
      v.pos.y + P.h,
      v.pos.z - Math.cos(v.yaw)*P.d
    );
    G.camera.lookAt(new THREE.Vector3(v.pos.x + Math.sin(v.yaw)*P.lookF, v.pos.y + P.lookY, v.pos.z + Math.cos(v.yaw)*P.lookF));
    Audio.engine(true);
    this.updateMountBtn();
  },
  updateMountBtn(){
    const mb = document.getElementById("tb-mount");
    if (mb) mb.textContent = this.cur ? "下车" : "上车";
  },
  exit(){
    if (!this.cur) return;
    const v = this.cur;
    const kind = v.kind;
    this.cur = null;
    G.player.vehicle = null;
    G.player.yaw = v.yaw;
    G.player.pitch = 0;
    const right = new THREE.Vector3(-Math.cos(v.yaw), 0, Math.sin(v.yaw));
    G.player.pos.set(v.pos.x + right.x*2.5, v.pos.y, v.pos.z + right.z*2.5);
    G.player.vy = 0;
    // 下车：载具收回空间背包（商店车库），方便再次部署
    Eco.owned.vehicles[kind] = (Eco.owned.vehicles[kind]||0) + 1;
    Eco.save();
    UI.toast(`${v.def.name} 已收回空间背包`, "warn");
    // 从世界移除（不爆炸）
    v.dead = true;
    if (v.body) G.world.removeBody(v.body);
    if (v.grp) G.scene.remove(v.grp);
    W.spatial.remove(v);
    const i = this.list.indexOf(v);
    if (i>=0) this.list.splice(i,1);
    Audio.engine(false);
    this.updateMountBtn();
  },

  damage(v, dmg, point){
    if (!v || v.dead) return;
    let d = dmg;
    if (v.def.armor) d *= (1 - v.def.armor);
    v.hp -= d;
    if (point) FX.sparks(point, 0xffd070);
    if (v.hp <= 0) this.removeVehicle(v, true);
  },

  nearest(maxDist){
    if (!G.player || G.player.dead) return null;
    maxDist = maxDist || 3.2;
    let best = null, bestD = maxDist;
    for (const v of this.list){
      const d = Math.hypot(v.pos.x - G.player.pos.x, v.pos.z - G.player.pos.z);
      if (d < bestD){ bestD = d; best = v; }
    }
    return best;
  },

  update(dt){
    this.gunCd -= dt; this.cannonCd -= dt; this.rocketCd -= dt; this.bombCd -= dt; this.armCd -= dt;
    // 载具弹体更新（扫掠防穿透，独立于是否驾驶；寿命无限，仅接触/出界销毁）
    for (const p of (this._vproj||[]).slice()){
      p.age = (p.age||0) + dt;
      p.mesh.position.copy(p.body.position);
      if (p.bomb) p.mesh.rotation.x += dt*4;
      const cur = new THREE.Vector3(p.body.position.x, p.body.position.y, p.body.position.z);
      // 防空/大阵拦截远程武器
      if (p.remote && W.intercept(cur)){
        FX.sparks(cur, 0x80d0ff);
        this.removeProj(p);
        continue;
      }
      const prev = p._prev || cur;
      if (cur.distanceTo(prev) > 0.001){
        const res = W.raycast(prev, cur, {ignorePlayer:true});
        let hit = false;
        if (res.seg) hit = true;
        else if (res.vehicle && res.vehicle !== p.ownerV) hit = true;
        else if (res.prop && !res.prop.water) hit = true;
        else if (res.npc) hit = true;
        if (hit && res.point){
          const pt = res.point;
          if (res.npc){
            NPCs.damage(res.npc, p.dmg, pt, null);
          }
          if (res.vehicle && res.vehicle !== p.ownerV) Vehicles.damage(res.vehicle, p.dmg, pt);
          if (res.prop && res.prop.isPortal) Portals.hit(res.prop, p.dmg, pt);
          if (p.nuke) W.bigExplosion(pt, p.radius, p.dmg, p.dmg*1.5);
          else W.explosion(pt, p.radius, p.dmg, p.dmg*1.3, true);
          this.removeProj(p);
          continue;
        }
      }
      p._prev = cur;
      if (p.body.position.y < -12) this.removeProj(p);
    }
    if (this.cur && this.cur.dead) this.cur = null;
    const v = this.cur;
    if (!v) return;
    const def = v.def;
    // 通用输入
    if (Input.keyPressed("KeyF")){
      this.exit();
      return;
    }
    if (def.fly) this.updateFly(v, dt);
    else this.updateWheeled(v, dt);

    // 轰炸机航弹类型切换（G 键：普通→强力→核弹）
    if (def.bombs && Input.keyPressed("KeyG")){
      v.bombMode = (v.bombMode + 1) % 3;
      UI.toast("航弹类型：" + ["普通航弹","强力航弹","小型核弹"][v.bombMode], "warn");
    }

    // 载具武装
    if (def.arm && Input.fireDown && this.armCd <= 0) this.armSwing(v);
    if (def.gun && Input.fireDown && this.gunCd <= 0) this.vehicleGun(v);
    if (def.cannon && Input.adsDown && this.cannonCd <= 0) this.tankCannon(v);
    if (def.rockets && Input.fireDown && this.rocketCd <= 0) this.heliRocket(v);
    if (def.bombs && Input.fireDown && this.bombCd <= 0) this.bomberBomb(v);

    // 相机（预设视角 + 环绕/俯仰可调；骑乘第一视角=转头）
    const fwd = v.fwd();
    if (v.camYaw === undefined) v.camYaw = 0;
    if (v.camPitch === undefined) v.camPitch = 0;
    const P = this.camPreset(v);
    if (P.fp){
      // 骑乘第一视角：相机固定在座位，视线随鼠标/触屏转动
      v.camYaw += Input.mouseDX * 0.0032;
      v.camPitch -= Input.mouseDY * 0.0032;
      v.camPitch = Math.max(-0.85, Math.min(0.85, v.camPitch));
      const cp = Math.cos(v.camPitch);
      const lookDir = new THREE.Vector3(
        Math.sin(v.yaw + v.camYaw)*cp,
        Math.sin(v.camPitch),
        Math.cos(v.yaw + v.camYaw)*cp
      );
      const camPos = new THREE.Vector3(
        v.pos.x - Math.sin(v.yaw)*P.d,
        v.pos.y + P.h,
        v.pos.z - Math.cos(v.yaw)*P.d
      );
      G.camera.position.copy(camPos); // 直接跟随，加速时不脱节
      G.camera.lookAt(v.pos.clone().addScaledVector(lookDir, P.lookF).add(new THREE.Vector3(0, P.lookY, 0)));
    } else {
      v.camYaw += Input.mouseDX * 0.0032;
      v.camPitch = Math.max(-0.5, Math.min(0.8, v.camPitch - Input.mouseDY * 0.002));
      const yawT = v.yaw + v.camYaw;
      const camTarget = new THREE.Vector3(
        v.pos.x - Math.sin(yawT)*P.d,
        v.pos.y + P.h + v.camPitch*3.5,
        v.pos.z - Math.cos(yawT)*P.d
      );
      const k = Math.min(1, 14*dt);
      G.camera.position.lerp(camTarget, k);
      const look = new THREE.Vector3(
        v.pos.x + Math.sin(v.yaw)*P.lookF,
        v.pos.y + P.lookY,
        v.pos.z + Math.cos(v.yaw)*P.lookF
      );
      G.camera.lookAt(look);
    }
    if (G.camShake > 0){
      const s = G.camShake*0.06;
      G.camera.position.x += (Math.random()-0.5)*s;
      G.camera.position.y += (Math.random()-0.5)*s;
    }
    // 玩家身体跟随
    G.player.pos.copy(v.pos);
    G.player.body.position.set(v.pos.x, v.pos.y+0.8, v.pos.z);
    // 太阳
    G.sun.position.set(v.pos.x+140, 180, v.pos.z+60);
    G.sunTarget.position.copy(v.pos);
    // 引擎音
    Audio.setEngineRpm(def.fly ? 0.8 : Math.abs(v.speed)/def.speed);
    UI.setVehHud(v);
  },

  updateWheeled(v, dt){
    const def = v.def;
    const throttle = Input.axisZ();
    const steer = Input.axisX();
    // 升级移速加成 + 血量减速（受损的重型载具变慢）
    const hpF = 0.55 + 0.45*(v.hp/v.maxHp);
    const maxS = def.speed * G.player.speedMult() * hpF;
    if (throttle > 0){
      v.speed = Math.min(maxS, v.speed + maxS*0.35*dt);
    } else if (throttle < 0){
      v.speed = Math.max(-maxS*0.4, v.speed - maxS*0.5*dt);
    } else {
      v.speed *= Math.max(0, 1 - 1.6*dt);
    }
    const turnCap = Math.min(1, Math.abs(v.speed)/7);
    v.yaw -= steer * 1.7 * turnCap * (v.speed < 0 ? -1 : 1) * dt; // 右转=向右
    v.pos.x += Math.sin(v.yaw)*v.speed*dt;
    v.pos.z += Math.cos(v.yaw)*v.speed*dt;
    // 地面贴合（仅静态地形，残骸不会垫飞载具）
    // 防飞顶：当射线起点陷入建筑内部时，groundHeightStatic 会返回起点高度，
    // 导致逐帧爬升。这里对异常抬升做钳制并刹停。
    let gy = W.groundHeightStatic(v.pos.x, v.pos.z, v.pos.y + 3);
    if (v._lastGy !== undefined && gy > v._lastGy + 2.0){
      gy = v._lastGy;
      v.speed = 0;
    }
    v._lastGy = gy;
    const gF = W.groundHeightStatic(v.pos.x + Math.sin(v.yaw)*2.5, v.pos.z + Math.cos(v.yaw)*2.5, v.pos.y + 3);
    const gB = W.groundHeightStatic(v.pos.x - Math.sin(v.yaw)*2.5, v.pos.z - Math.cos(v.yaw)*2.5, v.pos.y + 3);
    v.pos.y = gy;
    const pitch = Math.atan2(gF - gB, 5);
    v.grp.position.copy(v.pos);
    v.grp.rotation.set(pitch, v.yaw, 0);
    // 轮子
    for (const w of v.wheels) w.rotation.x += v.speed/0.5*dt;
    // 碰撞破拆
    this.probe(v, dt);
    v.body.position.set(v.pos.x, v.pos.y+1, v.pos.z);
    W.spatial.move(v, v.pos);
  },

  probe(v, dt){
    const def = v.def;
    const sp = Math.abs(v.speed);
    if (sp < 0.6) return;
    const fwd = v.fwd();
    const px = v.pos.x + fwd.x*(1.3 + sp*0.05);
    const pz = v.pos.z + fwd.z*(1.3 + sp*0.05);
    const hits = W.spatial.queryCircle(px, pz, 1.7);
    for (const s of hits){
      if (s.dead || s.isPropEntry || s.isPortal) continue;
      if (s.vehicle || s.npc || !s.kind) continue; // 跳过载具/怪物自身
      const pt = s.pos || s.mesh.position;
      if (Math.abs(pt.y - v.pos.y) > 4.5) continue;
      if (s.kind === "debris"){
        if (s.body) s.body.applyImpulse(new CANNON.Vec3(fwd.x*sp*4, 2.5, fwd.z*sp*4), new CANNON.Vec3(pt.x, pt.y, pt.z));
        continue;
      }
      if (s.kind === "tile" || s.kind === "fieldtile") continue;
      const ram = def.ram * (sp/def.speed) * (0.5 + Math.random()*0.6);
      W.damageSeg(s, ram, pt, fwd);
      FX.sparks(pt, 0xffd070);
      if (sp > 6){
        if (def.open){
          // 轻型载具：猛烈撞击把人弹下车，车辆刹停
          v.speed = 0;
          this.exit();
          if (G.player && !G.player.dead) G.player.damage(8, "碰撞");
          UI.toast("猛烈撞击！被弹下车", "warn");
          Audio.hit();
          FX.shake(0.5);
          return;
        }
        // 重型载具：直接撞穿，仅略微减速（按血量减速已体现在最高速度上）
        v.speed *= 0.8;
        FX.shake(0.4);
        Audio.hit();
      }
    }
    // 碾压怪物
    const near = W.spatial.queryCircle(v.pos.x, v.pos.z, 3.5);
    for (const n of NPCs.list){
      const d = Math.hypot(n.pos.x - v.pos.x, n.pos.z - v.pos.z);
      if (d < 2.6 && sp > 4){
        NPCs.damage(n, sp*26, n.pos, v.pos);
        UI.hitmarker();
      }
    }
  },

  armSwing(v){
    this.armCd = 1.1;
    v.armDir = v.armDir > 0 ? -1 : 1;
    Audio.shot("bat");
    FX.shake(0.35);
    const fwd = v.fwd();
    const px = v.pos.x + fwd.x*4.5, pz = v.pos.z + fwd.z*4.5;
    const hits = W.spatial.queryCircle(px, pz, 3.4);
    for (const s of hits){
      if (s.dead || s.isPropEntry || s.isPortal) continue;
      if (s.vehicle || s.npc || !s.kind) continue; // 跳过载具/怪物自身
      const pt = s.pos || s.mesh.position;
      if (Math.abs(pt.y - v.pos.y) > 5) continue;
      if (s.kind === "tile" || s.kind === "fieldtile") continue;
      if (s.kind === "debris"){
        if (s.body) s.body.applyImpulse(new CANNON.Vec3(fwd.x*30, 8, fwd.z*30), new CANNON.Vec3(pt.x, pt.y, pt.z));
        continue;
      }
      W.damageSeg(s, v.def.armDmg, pt, fwd);
    }
    for (const n of NPCs.list){
      const d = Math.hypot(n.pos.x - px, n.pos.z - pz);
      if (d < 3.6){
        NPCs.damage(n, v.def.armDmg*0.9, n.pos, v.pos);
        UI.hitmarker();
      }
    }
  },

  vehicleGun(v){
    this.gunCd = 0.1;
    if (v.gunAmmo !== undefined && v.gunAmmo <= 0){
      UI.toast("车载机枪弹药耗尽", "warn");
      return;
    }
    if (v.gunAmmo !== undefined) v.gunAmmo--;
    Audio.shot("mg");
    const from = G.camera.position;
    const dir = G.camera.getWorldDirection(new THREE.Vector3());
    const res = Weapons.hitscan(from, from.clone().addScaledVector(dir, 400), dir, 40);
    if (res && (res.body && res.body.userData && res.body.userData.npc)) UI.hitmarker();
  },

  tankCannon(v){
    this.cannonCd = v.def.cannonReload || 4;
    Audio.shot("cannon");
    FX.shake(0.6);
    const dir = G.camera.getWorldDirection(new THREE.Vector3());
    const from = G.camera.position.clone().addScaledVector(dir, 2);
    const p = {
      mesh:null, body:null, life:5,
      dmg:v.def.cannonDmg, radius:v.def.cannonRadius, speed:46, dead:false,
      ownerV: v, remote:true,
    };
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.8, 8), new THREE.MeshLambertMaterial({color:0x5a5a3a}));
    mesh.position.copy(from);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir);
    G.scene.add(mesh);
    const body = new CANNON.Body({mass:10, shape:new CANNON.Sphere(0.3)});
    body.position.set(from.x, from.y, from.z);
    body.velocity.set(dir.x*p.speed, dir.y*p.speed - 1.5, dir.z*p.speed);
    body.collisionFilterGroup = 16; body.collisionFilterMask = -1;
    body.userData = {proj:p};
    G.world.addBody(body);
    p.mesh = mesh; p.body = body;
    body.addEventListener("collide", (e)=>{
      if (p.dead) return;
      const ud = e.body.userData;
      const pt = new THREE.Vector3(body.position.x, body.position.y, body.position.z);
      if (ud && ud.npc) NPCs.damage(ud.npc, p.dmg, pt, from);
      W.explosion(pt, p.radius, p.dmg, p.dmg*1.3, true);
      this.removeProj(p);
    });
    (this._vproj = this._vproj||[]).push(p);
  },

  heliRocket(v){
    this.rocketCd = v.def.rocketRate || 0.35;
    Audio.shot("rocket");
    const fwd = v.fwd().clone().setY(v.pitch*0.4);
    const from = v.pos.clone().addScaledVector(fwd, 3).add(new THREE.Vector3(0, -0.3, 0));
    const p = this.makeShell(from, fwd, v.def.rocketDmg, v.def.rocketRadius, 55);
  },
  makeShell(from, dir, dmg, radius, speed, ownerV){
    const p = {mesh:null, body:null, life:5, dmg, radius, speed, dead:false, ownerV: ownerV||null, remote:true};
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.1, 8), new THREE.MeshLambertMaterial({color:0x6a6a5a}));
    mesh.position.copy(from);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize());
    G.scene.add(mesh);
    const body = new CANNON.Body({mass:2, shape:new CANNON.Sphere(0.18)});
    body.position.set(from.x, from.y, from.z);
    body.velocity.set(dir.x*speed, dir.y*speed, dir.z*speed);
    body.collisionFilterGroup = 16; body.collisionFilterMask = -1;
    body.userData = {proj:p};
    G.world.addBody(body);
    p.mesh = mesh; p.body = body;
    body.addEventListener("collide", (e)=>{
      if (p.dead) return;
      const ud = e.body.userData;
      const pt = new THREE.Vector3(body.position.x, body.position.y, body.position.z);
      if (ud && ud.npc) NPCs.damage(ud.npc, p.dmg, pt, from);
      W.explosion(pt, p.radius, p.dmg, p.dmg*1.2, true);
      this.removeProj(p);
    });
    (this._vproj = this._vproj||[]).push(p);
    return p;
  },

  bomberBomb(v){
    this.bombCd = v.def.bombRate || 1.6;
    let dmg = v.def.bombDmg, radius = v.def.bombRadius, color = 0x3a3a3a, nuke = false;
    if (v.bombMode === 1){
      const b = CFG.BOMBS.pow;
      if ((Eco.ammo[b.ammo]||0) <= 0){ UI.toast("强力航弹已耗尽，切回普通航弹","warn"); v.bombMode = 0; }
      else { dmg = b.dmg; radius = b.radius; color = 0x5a6a3a; Eco.ammo[b.ammo]--; Eco.save(); }
    } else if (v.bombMode === 2){
      const b = CFG.BOMBS.nuke;
      if ((Eco.ammo[b.ammo]||0) <= 0){ UI.toast("小型核弹已耗尽，切回普通航弹","warn"); v.bombMode = 0; }
      else { dmg = b.dmg; radius = b.radius; color = 0x8a8a5a; nuke = true; Eco.ammo[b.ammo]--; Eco.save(); }
    }
    Audio.click();
    const p = {
      mesh:null, body:null, life:12,
      dmg, radius, dead:false, bomb:true, nuke, remote:true,
    };
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(nuke?0.55:0.35, nuke?0.55:0.35, nuke?2.2:1.5, 8), new THREE.MeshLambertMaterial({color}));
    mesh.position.copy(v.pos).add(new THREE.Vector3(0, -1.2, 0));
    mesh.rotation.x = Math.PI/2;
    G.scene.add(mesh);
    const body = new CANNON.Body({mass: nuke?80:40, shape:new CANNON.Sphere(nuke?0.7:0.4)});
    body.position.set(mesh.position.x, mesh.position.y, mesh.position.z);
    body.velocity.set(v.vel.x, v.vel.y - 3, v.vel.z);
    body.collisionFilterGroup = 16; body.collisionFilterMask = -1;
    body.userData = {proj:p};
    G.world.addBody(body);
    p.mesh = mesh; p.body = body;
    body.addEventListener("collide", (e)=>{
      if (p.dead) return;
      const pt = new THREE.Vector3(body.position.x, body.position.y, body.position.z);
      if (p.nuke) W.bigExplosion(pt, p.radius, p.dmg, p.dmg*1.5);
      else W.explosion(pt, p.radius, p.dmg, p.dmg*1.4, true);
      this.removeProj(p);
    });
    (this._vproj = this._vproj||[]).push(p);
  },

  removeProj(p){
    if (p.dead) return;
    p.dead = true;
    if (p.body) G.world.removeBody(p.body);
    if (p.mesh) G.scene.remove(p.mesh);
    const a = this._vproj;
    if (a){ const i = a.indexOf(p); if (i>=0) a.splice(i,1); }
  },

  updateFly(v, dt){
    const def = v.def;
    const fwd = v.fwd();
    if (v.kind === "heli"){
      // 悬停直升机
      const climb = (Input.key("Space")?1:0) - (Input.key("ControlLeft")||Input.key("ControlRight")?1:0);
      v.pitch += (Input.axisZ())*0.5*dt;
      v.pitch = Math.max(-0.45, Math.min(0.45, v.pitch));
      v.yaw -= Input.axisX()*0.9*dt;
      const sp = def.speed * G.player.speedMult() * (1 - Math.abs(v.pitch)*0.45);
      v.vel.set(
        Math.sin(v.yaw)*Math.cos(v.pitch)*sp,
        climb*7 - (v.pitch > 0 ? Math.sin(v.pitch)*sp : 0),
        Math.cos(v.yaw)*Math.cos(v.pitch)*sp
      );
    } else {
      // 轰炸机：持续飞行
      v.speed = Math.min(def.speed * G.player.speedMult(), v.speed + def.speed*0.4*dt);
      v.pitch += Input.axisZ()*0.35*dt;
      v.pitch = Math.max(-0.42, Math.min(0.42, v.pitch));
      v.yaw -= Input.axisX()*0.55*dt;
      v.vel.set(
        Math.sin(v.yaw)*Math.cos(v.pitch)*v.speed,
        Math.sin(v.pitch)*v.speed,
        Math.cos(v.yaw)*Math.cos(v.pitch)*v.speed
      );
      // 最低高度保护
      if (v.pos.y < 3.2){
        v.pos.y = Math.max(3.2, v.pos.y);
        if (v.pitch < 0) v.pitch = 0.08;
      }
    }
    v.pos.addScaledVector(v.vel, dt);
    if (v.pos.y < 2.6){
      // 坠机：安全弹射落地继续行动
      v.pos.y = 2.6;
      if (G.player && !G.player.dead) G.player.damage(25, "坠机");
      this.removeVehicle(v, true);
      return;
    }
    // 边界
    const b = CFG.LAYOUT.bounds;
    v.pos.x = Math.max(-b.x+3, Math.min(b.x-3, v.pos.x));
    v.pos.z = Math.max(b.zN+3, Math.min(b.zS-3, v.pos.z));
    if (v.pos.y > 90) v.pos.y = 90;
    v.grp.position.copy(v.pos);
    v.grp.rotation.set(v.pitch, v.yaw, 0);
    for (const r of v.rotors) r.rotation.y += dt*26;
    v.body.position.set(v.pos.x, v.pos.y, v.pos.z);
    W.spatial.move(v, v.pos);
    // 撞楼
    const sp = Math.hypot(v.vel.x, v.vel.z);
    if (sp > 8){
      const px = v.pos.x + v.vel.x*0.08, pz = v.pos.z + v.vel.z*0.08;
      const hits = W.spatial.queryCircle(px, pz, 3);
      for (const s of hits){
        if (s.dead || s.isPropEntry || s.isPortal) continue;
        const pt = s.pos || s.mesh.position;
        if (Math.abs(pt.y - v.pos.y) > 5) continue;
        if (s.kind === "tile" || s.kind === "fieldtile") continue;
        W.damageSeg(s, def.ram*1.5, pt, v.vel.clone().normalize());
        // 撞楼仅减速，不消耗耐久（只有遭到攻击才消耗耐久）
        v.speed *= 0.4;
        v.pitch = 0.2;
        FX.sparks(pt, 0xffd070);
        FX.shake(0.5);
      }
    }
  },
};

/* ---------- 载具模型（按真实车辆构造：轮胎+轮毂、油箱、驾驶舱、履带、螺旋桨） ---------- */
function buildVehicleMesh(kind){
  const grp = new THREE.Group();
  grp.rotation.order = "YXZ";
  const wheels = [], rotors = [];
  let arm = null, turret = null, barrel = null;
  const steel = W.mats.steel, dark = W.mats.dark, black = W.mats.black;
  const tire = new THREE.MeshLambertMaterial({color:0x1c1c20});
  const rim = new THREE.MeshLambertMaterial({color:0xb8bec6});
  const glassMat = W.mats.glass;
  const redLight = new THREE.MeshBasicMaterial({color:0xff3020});
  const headLight = new THREE.MeshBasicMaterial({color:0xfff0c0});
  const olive = new THREE.MeshLambertMaterial({color:0x4a5a3a});
  const desert = new THREE.MeshLambertMaterial({color:0x9a8a6a});
  const camo = new THREE.MeshLambertMaterial({color:0x5a6248});
  const mkBox = (sx,sy,sz,x,y,z,mat,opts)=>{ const m = new THREE.Mesh(W.geos.box, mat); m.scale.set(sx,sy,sz); m.position.set(x,y,z); if(opts&&opts.rx!==undefined){ m.rotation.x = opts.rx; } if(opts&&opts.rz!==undefined){ m.rotation.z = opts.rz; } m.castShadow = true; grp.add(m); return m; };
  const mkTube = (r,h,x,y,z,mat,axis)=>{ // axis: 'x'|'y'|'z'（圆柱轴向）
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,10), mat);
    if (axis==="x"){ m.rotation.z = Math.PI/2; }
    else if (axis==="z"){ m.rotation.x = Math.PI/2; }
    m.position.set(x,y,z);
    m.castShadow = true;
    grp.add(m);
    return m;
  };
  const mkCone = (r,h,x,y,z,mat,rot)=>{
    const m = new THREE.Mesh(new THREE.ConeGeometry(r,h,8), mat);
    m.position.set(x,y,z);
    if (rot==="fwd"){ m.rotation.x = -Math.PI/2; }
    if (rot==="back"){ m.rotation.x = Math.PI/2; }
    m.castShadow = true;
    grp.add(m);
    return m;
  };
  // 车轮：轮胎+轮毂+轮轴（轴向X，可自转）
  const wheel = (r, w, x, y, z)=>{
    const t = mkTube(r, w, x, y, z, tire, "x");
    const ri = mkTube(r*0.55, w+0.02, x, y, z, rim, "x");
    const hub = mkTube(r*0.18, w+0.06, x, y, z, steel, "x");
    wheels.push(t);
    return t;
  };

  switch(kind){
    case "bike":{
      // 车轮（后-0.85 / 前+0.85）
      wheel(0.45, 0.07, 0, 0.45, -0.85);
      wheel(0.45, 0.07, 0, 0.45, 0.85);
      // 车架（菱形）
      const crank = {x:0, y:0.5, z:-0.1};
      mkTube(0.035, 0.62, 0, 0.95, -0.52, dark, "y");            // 座管
      mkTube(0.035, 1.05, 0, 1.0, 0.1, dark, "z");               // 上管(座→头)
      mkTube(0.035, 0.85, 0, 0.62, 0.42, dark, "z");             // 下管(五通→头)
      mkTube(0.035, 0.4, 0, 0.85, 0.6, dark, "y");               // 头管
      mkTube(0.03, 0.75, 0, 0.55, -0.48, dark, "z");             // 后上叉
      mkTube(0.03, 0.85, 0, 0.5, -0.15, dark, "z");              // 后下叉
      mkTube(0.03, 0.85, 0, 0.62, 0.42, dark, "z");              // 前叉
      // 车把/鞍座/脚踏/曲柄
      mkTube(0.03, 0.7, 0, 1.12, 0.62, dark, "x");               // 车把
      mkBox(0.3, 0.09, 0.2, 0, 1.28, -0.55, black);              // 鞍座
      mkTube(0.025, 0.36, 0, 0.5, -0.1, dark, "x");              // 曲柄
      mkBox(0.14, 0.05, 0.09, 0, 0.32, -0.08, black);            // 脚踏1
      mkBox(0.14, 0.05, 0.09, 0, 0.68, -0.12, black);            // 脚踏2
      break;
    }
    case "ebike":{
      wheel(0.45, 0.09, 0, 0.45, -0.85);
      wheel(0.45, 0.09, 0, 0.45, 0.85);
      mkTube(0.035, 0.62, 0, 0.95, -0.52, dark, "y");
      mkTube(0.035, 1.05, 0, 1.0, 0.1, dark, "z");
      mkTube(0.035, 0.85, 0, 0.62, 0.42, dark, "z");
      mkTube(0.03, 0.75, 0, 0.55, -0.48, dark, "z");
      mkTube(0.03, 0.85, 0, 0.5, -0.15, dark, "z");
      mkTube(0.03, 0.85, 0, 0.62, 0.42, dark, "z");
      mkTube(0.03, 0.7, 0, 1.12, 0.62, dark, "x");
      mkBox(0.3, 0.09, 0.2, 0, 1.28, -0.55, black);
      mkBox(0.26, 0.34, 0.5, 0, 0.78, 0.28, W.mats.blue);        // 电池盒
      mkTube(0.025, 0.36, 0, 0.5, -0.1, dark, "x");
      mkBox(0.14, 0.05, 0.09, 0, 0.32, -0.08, black);
      mkBox(0.14, 0.05, 0.09, 0, 0.68, -0.12, black);
      // 后轮毂电机
      mkTube(0.22, 0.14, 0, 0.45, -0.85, steel, "x");
      break;
    }
    case "moto":{
      wheel(0.44, 0.12, 0, 0.44, 0.85);
      wheel(0.5, 0.14, 0, 0.5, -0.85);
      // 车身
      mkBox(0.34, 0.3, 1.15, 0, 0.78, -0.05, W.mats.red);        // 发动机
      mkBox(0.38, 0.28, 0.85, 0, 1.02, 0.25, W.mats.red);        // 油箱(前斜)
      mkBox(0.36, 0.14, 0.75, 0, 1.06, -0.6, black);             // 座垫
      mkTube(0.035, 0.6, 0, 0.9, 0.85, dark, "y");               // 前叉
      mkTube(0.03, 0.6, 0, 1.18, 0.75, dark, "x");               // 车把
      mkTube(0.04, 0.55, 0, 0.5, -0.25, steel, "z");             // 排气
      mkTube(0.05, 0.12, 0, 0.98, 0.5, headLight, "z");          // 大灯
      mkBox(0.05, 0.16, 0.1, -0.32, 1.18, 0.7, black);           // 后视镜
      mkBox(0.05, 0.16, 0.1, 0.32, 1.18, 0.7, black);
      mkBox(0.3, 0.05, 0.42, 0, 0.55, 0.72, W.mats.red);         // 前挡泥
      mkBox(0.3, 0.05, 0.5, 0, 0.6, -0.85, W.mats.red);          // 后挡泥
      break;
    }
    case "car":{
      // 车轮（前1.6 后-1.5）
      wheel(0.38, 0.22, -0.95, 0.38, 1.6);
      wheel(0.38, 0.22, 0.95, 0.38, 1.6);
      wheel(0.38, 0.22, -0.95, 0.38, -1.5);
      wheel(0.38, 0.22, 0.95, 0.38, -1.5);
      // 车身
      mkBox(1.92, 0.5, 4.5, 0, 0.62, 0, W.mats.blue);            // 底盘
      mkBox(1.9, 0.3, 1.1, 0, 0.88, 1.85, W.mats.blue);          // 引擎盖
      mkBox(1.9, 0.3, 0.9, 0, 0.9, -1.95, W.mats.blue);          // 后备箱
      mkBox(1.8, 0.62, 2.0, 0, 1.18, -0.05, W.mats.blue);        // 车厢
      // 玻璃
      mkBox(1.7, 0.5, 0.06, 0, 1.32, 0.98, glassMat);            // 前挡风
      mkBox(1.7, 0.45, 0.06, 0, 1.28, -1.05, glassMat);          // 后挡风
      mkBox(0.06, 0.4, 1.4, 0.86, 1.2, 0, glassMat);             // 侧窗
      mkBox(0.06, 0.4, 1.4, -0.86, 1.2, 0, glassMat);
      // 车灯/后视镜
      mkBox(0.4, 0.12, 0.06, -0.6, 0.75, 2.26, headLight);
      mkBox(0.4, 0.12, 0.06, 0.6, 0.75, 2.26, headLight);
      mkBox(0.42, 0.1, 0.06, -0.6, 0.85, -2.26, redLight);
      mkBox(0.42, 0.1, 0.06, 0.6, 0.85, -2.26, redLight);
      mkBox(0.05, 0.12, 0.18, -0.97, 1.2, 1.05, black);
      mkBox(0.05, 0.12, 0.18, 0.97, 1.2, 1.05, black);
      break;
    }
    case "excavator":{
      // 履带
      mkBox(0.7, 0.75, 3.6, -1.05, 0.5, 0, black);
      mkBox(0.7, 0.75, 3.6, 1.05, 0.5, 0, black);
      for (let i=0;i<4;i++){
        wheel(0.28, 0.2, -1.05, 0.28, -1.35+i*0.9);
        wheel(0.28, 0.2, 1.05, 0.28, -1.35+i*0.9);
      }
      // 底盘+驾驶室
      mkBox(2.0, 0.5, 2.6, 0, 1.0, 0, desert);
      mkBox(1.5, 1.3, 1.5, 0.1, 1.85, 0.1, desert);               // 驾驶室
      mkBox(1.2, 0.7, 0.08, -0.35, 1.9, 0.86, glassMat);         // 前窗
      mkBox(0.7, 0.5, 0.08, 0.5, 1.85, 0.86, glassMat);
      mkBox(1.8, 0.6, 0.8, -0.4, 1.0, -1.3, steel);              // 配重
      // 动臂（液压缸）
      arm = new THREE.Group();
      arm.position.set(0.1, 1.55, 0.7);
      const boom = mkBox(0.32, 0.3, 3.3, 0, 0.65, 1.55, desert);
      boom.position.set(0, 0.65, 1.55);
      arm.add(boom);
      const cyl1 = mkTube(0.07, 1.6, 0.35, 0.9, 1.5, steel, "y");
      arm.add(cyl1);
      const stick = mkBox(0.26, 0.24, 2.1, 0, 1.95, 3.1, desert);
      arm.add(stick);
      const cyl2 = mkTube(0.06, 1.2, 0, 1.75, 2.7, steel, "y");
      arm.add(cyl2);
      const bucket = mkBox(1.05, 0.55, 0.85, 0, 2.35, 3.95, dark);
      arm.add(bucket);
      for (let i=0;i<3;i++){
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 6), steel);
        tooth.rotation.x = -Math.PI/2;
        tooth.position.set(-0.3+i*0.3, 2.28, 4.42);
        arm.add(tooth);
      }
      grp.add(arm);
      break;
    }
    case "apc":{
      // 8轮
      for (let i=0;i<4;i++){
        wheel(0.5, 0.32, -1.35, 0.5, -2.1+i*1.4);
        wheel(0.5, 0.32, 1.35, 0.5, -2.1+i*1.4);
      }
      // 车体（斜面车首）
      mkBox(2.6, 1.0, 5.6, 0, 1.3, 0, olive);
      mkBox(2.4, 0.9, 1.0, 0, 1.85, 2.7, olive);
      mkBox(2.4, 0.5, 0.9, 0, 1.5, 3.15, olive);
      mkBox(2.5, 0.14, 5.2, 0, 1.85, -0.2, olive);
      // 观察窗
      mkBox(1.6, 0.18, 0.08, 0, 1.75, 2.75, glassMat);
      mkBox(0.4, 0.18, 0.08, -0.7, 1.75, 2.75, glassMat);
      mkBox(0.4, 0.18, 0.08, 0.7, 1.75, 2.75, glassMat);
      // 炮塔
      turret = new THREE.Group();
      turret.position.set(0, 2.0, -0.4);
      const dome = mkBox(1.4, 0.6, 1.6, 0, 0.1, 0, olive);
      dome.position.set(0, 0.1, 0);
      turret.add(dome);
      barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8), dark);
      barrel.rotation.x = Math.PI/2;
      barrel.position.set(0.2, 0.2, 1.4);
      turret.add(barrel);
      grp.add(turret);
      mkBox(0.12, 0.7, 0.8, 0, 1.9, -3.0, olive);                // 后门
      break;
    }
    case "tank":{
      // 车体+履带
      mkBox(3.3, 0.85, 6.4, 0, 1.0, 0, camo);
      mkBox(3.1, 0.5, 1.6, 0, 1.35, 2.9, camo);
      mkBox(0.7, 0.7, 7.0, -2.0, 0.6, 0, black);
      mkBox(0.7, 0.7, 7.0, 2.0, 0.6, 0, black);
      for (let i=0;i<6;i++){
        wheel(0.42, 0.26, -2.0, 0.5, -2.5+i*1.0);
        wheel(0.42, 0.26, 2.0, 0.5, -2.5+i*1.0);
      }
      // 炮塔+主炮
      turret = new THREE.Group();
      turret.position.set(0, 1.55, 0.2);
      const dome2 = mkBox(1.9, 0.75, 2.3, 0, 0.3, 0, camo);
      dome2.position.set(0, 0.3, 0);
      turret.add(dome2);
      const mantlet = new THREE.Mesh(W.geos.box, camo);
      mantlet.scale.set(1.1, 0.8, 0.6);
      mantlet.position.set(0, 0.3, 1.3);
      turret.add(mantlet);
      barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 4.4, 10), dark);
      barrel.rotation.x = Math.PI/2;
      barrel.position.set(0, 0.35, 3.0);
      turret.add(barrel);
      const brake = new THREE.Mesh(W.geos.box, dark);
      brake.scale.set(0.3, 0.3, 0.4);
      brake.position.set(0, 0.35, 5.25);
      turret.add(brake);
      grp.add(turret);
      // 舱盖/天线
      mkBox(0.6, 0.12, 0.6, -0.6, 0.75, -0.4, camo);
      mkTube(0.015, 1.1, 0.6, 1.0, 0.6, dark, "y");
      break;
    }
    case "heli":{
      // 机身
      mkBox(1.5, 1.15, 4.4, 0, 1.5, 0, steel);
      mkCone(1.0, 1.6, 0, 1.5, 2.8, glassMat, "fwd");
      mkBox(0.42, 0.4, 3.2, 0, 1.7, -3.2, steel);                // 尾梁
      mkBox(0.5, 1.0, 0.14, 0, 2.0, -4.7, steel);                // 垂尾
      mkBox(1.4, 0.14, 0.5, 0, 1.5, -4.9, steel);                // 平尾
      // 主旋翼
      const rotorHub = mkBox(0.35, 0.3, 0.5, 0, 2.35, 0, dark);
      const blade1 = mkBox(0.18, 0.05, 6.6, 0, 2.45, 0, dark);
      rotors.push(blade1);
      const blade2 = mkBox(6.6, 0.05, 0.18, 0, 2.45, 0, dark);
      rotors.push(blade2);
      // 尾桨
      const tailR = mkTube(0.16, 1.3, 0, 1.9, -4.7, dark, "x");
      rotors.push(tailR);
      // 发动机罩+滑橇
      mkBox(1.1, 0.6, 1.6, 0, 2.15, -0.6, dark);
      mkBox(0.14, 0.5, 2.0, -0.55, 0.35, 0.2, dark);
      mkBox(0.14, 0.5, 2.0, 0.55, 0.35, 0.2, dark);
      mkBox(1.2, 0.1, 0.2, 0, 0.62, 0.2, dark);
      // 火箭巢
      mkBox(0.2, 0.2, 0.9, -1.05, 1.4, 0.6, dark);
      mkBox(0.2, 0.2, 0.9, 1.05, 1.4, 0.6, dark);
      break;
    }
    case "bomber":{
      // 机身
      mkTube(0.85, 6.4, 0, 1.35, 0, steel, "z");
      mkCone(0.85, 1.4, 0, 1.35, 3.9, glassMat, "fwd");
      // 机翼（双发）
      mkBox(11.2, 0.2, 2.3, 0, 1.4, -0.7, steel);
      mkBox(0.8, 0.14, 1.6, 0, 0.95, -0.7, steel);
      // 发动机+螺旋桨
      for (const s of [-1,1]){
        mkTube(0.42, 1.5, s*2.9, 1.45, -1.4, dark, "z");
        const prop = mkBox(2.5, 0.07, 0.12, s*2.9, 1.45, -2.25, dark);
        rotors.push(prop);
      }
      // 尾翼
      mkBox(2.6, 0.14, 1.0, 0, 1.5, -3.0, steel);
      mkBox(0.16, 1.1, 1.2, 0, 1.9, -3.0, steel);
      mkBox(0.14, 0.16, 1.0, 0, 2.45, -3.0, steel);
      // 驾驶舱
      mkBox(0.7, 0.5, 1.2, 0, 1.85, 2.4, glassMat);
      break;
    }
  }
  return {grp, wheels, rotors, arm, turret, barrel};
}
