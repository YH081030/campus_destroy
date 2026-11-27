/* ============================================================
 * 玩家 —— 第一人称、体力/护甲/受伤影响、升级加成
 * ============================================================ */
"use strict";
const PlayerC = window.PlayerC = {
  body: null,
  pos: new THREE.Vector3(0, 0, 70),
  vel: new THREE.Vector3(),
  yaw: Math.PI, pitch: 0,
  vy: 0, onGround: true, step: 0,
  hp: 100, maxHp: 100,
  armor: 0, armorMax: 0,
  stamina: 100, maxStamina: 100,
  dead: false, invuln: 0, hurtTimer: 0,
  vehicle: null, berserkT: 0, prone: false,
  hover: false, teleportCd: 0, teleporting: false, teleportT: 0,
  warCryT: 0, ironBodyT: 0, avatarT: 0, shieldHp: 0,

  init(){
    this.dead = false;
    this.maxHp = CFG.PLAYER.hp + Eco.upLevel("hp")*CFG.UPGRADES.hp.per + Eco.warriorLv()*2;
    this.hp = this.maxHp;
    this.armorMax = Eco.gearArmor() + Eco.upLevel("armor")*CFG.UPGRADES.armor.per;
    this.armor = this.armorMax;
    this.maxStamina = CFG.PLAYER.stamina + Eco.upLevel("stamina")*CFG.UPGRADES.stamina.per;
    this.stamina = this.maxStamina;
    const s = CFG.LAYOUT.spawn;
    this.pos.set(s.x, 0, s.z);
    this.yaw = Math.PI; this.pitch = 0;
    this.vy = 0; this.vehicle = null; this.invuln = 0;
    if (this.body){
      G.world.removeBody(this.body);
    }
    this.body = new CANNON.Body({mass:1, shape:new CANNON.Sphere(CFG.PLAYER.radius)});
    this.body.type = CANNON.Body.KINEMATIC;
    this.body.fixedRotation = true;
    this.body.position.set(this.pos.x, this.pos.y+0.85, this.pos.z);
    this.body.aabbNeedsUpdate = true;
    this.body.collisionFilterGroup = 2; this.body.collisionFilterMask = -1;
    this.body.userData = {player:true};
    G.world.addBody(this.body);
  },

  eyePos(){
    return this.pos.clone().add(new THREE.Vector3(0, this.prone ? 0.5 : CFG.PLAYER.eye, 0));
  },
  forward(){
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(Math.sin(this.yaw)*cp, Math.sin(this.pitch), Math.cos(this.yaw)*cp);
  },

  speedMult(){
    const u = 1 + Eco.upLevel("speed")*CFG.UPGRADES.speed.per + Eco.mageLv()*0.02;
    return u * (this.berserkT > 0 ? 1.3 : 1) * (this.warCryT > 0 ? 1.2 : 1) * (this.avatarT > 0 ? 1.5 : 1);
  },
  canFly(){ return Eco.upLevel("fly") > 0; },
  injuryFactor(){
    const r = this.hp/this.maxHp;
    if (r < 0.15) return 0.62;
    if (r < 0.35) return 0.8;
    return 1;
  },

  update(dt){
    if (this.dead) return;
    this.invuln -= dt; this.hurtTimer -= dt;
    if (this.berserkT > 0) this.berserkT -= dt;
    if (this.warCryT > 0) this.warCryT -= dt;
    if (this.ironBodyT > 0) this.ironBodyT -= dt;
    if (this.avatarT > 0) this.avatarT -= dt;
    if (this.vehicle){
      // 驾驶中
      this.pos.copy(this.vehicle.pos);
      return;
    }
    // 视线
    this.yaw -= Input.mouseDX * 0.0022;
    this.pitch -= Input.mouseDY * 0.0022;
    this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch));

    // 趴下/起身（Ctrl，仅在站立于地面时；空中 Ctrl 仍为飞行下降）
    if (Input.keyPressed("ControlLeft") && this.onGround){
      this.prone = !this.prone;
      Audio.click();
    }
    // 移动
    const fwd = Input.axisZ();
    const strafe = Input.axisX();
    const sprint = !this.prone && Input.sprintHeld() && fwd > 0 && this.stamina > 1;
    const proneMult = this.prone ? 0.34 : 1; // 匍匐/爬行：移速降为 34%
    const baseSpeed = CFG.PLAYER.speed * this.speedMult() * this.injuryFactor() * proneMult;
    const target = baseSpeed * (sprint ? (CFG.PLAYER.sprint/CFG.PLAYER.speed) : 1);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw); // 正确的右向量（向右=右移）
    let mx = (fx*fwd + rx*strafe);
    let mz = (fz*fwd + rz*strafe);
    const ml = Math.hypot(mx, mz);
    if (ml > 1){ mx /= ml; mz /= ml; }
    const accel = this.onGround ? 12 : 3;
    this.vel.x += (mx*target - this.vel.x) * Math.min(1, accel*dt);
    this.vel.z += (mz*target - this.vel.z) * Math.min(1, accel*dt);
    this.pos.x += this.vel.x*dt;
    this.pos.z += this.vel.z*dt;

    // 体力
    if (sprint && ml > 0.1){
      this.stamina = Math.max(0, this.stamina - 26*dt);
    } else {
      this.stamina = Math.min(this.maxStamina, this.stamina + (this.injuryFactor()<1?10:20)*dt);
    }

    // 跳跃/翻越围墙
    if (Input.keyPressed("Space")){
      if (this.prone){
        this.prone = false; // 趴下时按空格=起身
      } else if (this.onGround){
        // 尝试翻越围墙/校门
        const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        const eye = this.eyePos();
        const vres = W.raycast(eye, eye.clone().addScaledVector(fwd, CFG.VAULT.reach), {ignorePlayer:true, ignoreNpc:true});
        if (vres.seg && (vres.seg.kind === "cwall" || vres.seg.kind === "gate")){
          const top = vres.seg.mesh.position.y + vres.seg.mesh.scale.y/2;
          if (top <= this.pos.y + CFG.VAULT.maxTop && this.stamina >= CFG.VAULT.cost){
            const landX = this.pos.x + fwd.x * CFG.VAULT.dist;
            const landZ = this.pos.z + fwd.z * CFG.VAULT.dist;
            const landY = W.groundHeight(landX, landZ, top + 12);
            if (Math.abs(landY - this.pos.y) < 4){
              this.stamina -= CFG.VAULT.cost;
              this.pos.set(landX, Math.max(landY, top) + 0.05, landZ);
              this.vy = 3;
              this.onGround = false;
              Audio.click();
              return;
            }
          }
        }
        this.vy = CFG.PLAYER.jump * (1 + Eco.upLevel("jump")*CFG.UPGRADES.jump.per);
        this.onGround = false;
      }
    }
    if (!this.onGround){
      // 飞行能力（升级解锁）：空格上升，悬浮键=悬停，未悬浮=缓慢下落
      if (this.canFly()){
        // 悬浮开关（Tab 键 / 悬浮按钮）
        if (Input.keyPressed("Tab")) this.hover = !this.hover;
        if (Input.key("Space") && this.stamina > 0.5){
          this.vy = Math.max(this.vy, 5.5);
          this.stamina = Math.max(0, this.stamina - 11*dt);
        } else if (this.hover){
          this.vy = 0; // 悬停
        } else {
          this.vy += CFG.GRAVITY*dt; // 重力加速度下落
        }
      } else {
        this.vy += CFG.GRAVITY*dt;
      }
      this.pos.y += this.vy*dt;
    }
    // 地面
    const floorY = W.groundHeight(this.pos.x, this.pos.z, this.pos.y + 2.6);
    if (this.pos.y <= floorY + 0.03){
      this.pos.y = floorY;
      this.vy = 0;
      this.onGround = true;
    } else if (this.onGround){
      // 台阶：允许最高 0.62 的抬升
      if (floorY - this.pos.y <= 0.62 && floorY > this.pos.y){
        this.pos.y = floorY;
      } else if (floorY - this.pos.y > 0.62){
        // 高墙阻挡（物理接触处理）
      } else {
        this.onGround = false;
      }
    }
    // 边界钳制
    const b = CFG.LAYOUT.bounds;
    this.pos.x = Math.max(-b.x+1, Math.min(b.x-1, this.pos.x));
    this.pos.z = Math.max(b.zN+1, Math.min(b.zS-1, this.pos.z));
    if (this.pos.y < -30) this.pos.y = 5;

    // 同步物理
    this.body.position.set(this.pos.x, this.pos.y+0.85, this.pos.z);

    // 相机（three.js 相机看 -Z，偏移 π 使视线=前进方向，保证“上=前进”）
    const eye = this.eyePos();
    G.camera.position.copy(eye);
    G.camera.rotation.set(this.pitch, this.yaw + Math.PI, 0, "YXZ");
    // 摇晃
    if (G.camShake > 0){
      const s = G.camShake*0.06;
      G.camera.position.x += (Math.random()-0.5)*s;
      G.camera.position.y += (Math.random()-0.5)*s;
      G.camera.position.z += (Math.random()-0.5)*s;
    }
    // FOV
    const targetFov = Weapons.adsFov() || 72;
    if (Math.abs(G.camera.fov - targetFov) > 0.2){
      G.camera.fov += (targetFov - G.camera.fov)*Math.min(1, 12*dt);
      G.camera.updateProjectionMatrix();
    }
    // 太阳跟随
    G.sun.position.set(eye.x+140, 180, eye.z+60);
    G.sunTarget.position.copy(eye);
  },

  damage(amount, src){
    if (this.dead || this.invuln > 0) return;
    if (this.vehicle){
      Vehicles.damage(this.vehicle, amount*0.35, this.vehicle.pos);
      return;
    }
    let d = amount;
    if (this.ironBodyT > 0) d *= 0.3; // 钢铁之躯：减伤70%
    if (this.shieldHp > 0){
      const absorb = Math.min(this.shieldHp, d);
      this.shieldHp -= absorb;
      d -= absorb;
    }
    if (this.armor > 0){
      const absorbed = Math.min(this.armor, d);
      this.armor -= absorbed;
      d -= absorbed;
    }
    this.hp -= d;
    this.hurtTimer = 0.5;
    UI.damageFlash(d/this.maxHp);
    Audio.hurt();
    FX.shake(Math.min(1.2, d*0.02));
    if (this.hp <= 0){
      this.hp = 0;
      this.die(src);
    }
  },
  die(src){
    this.dead = true;
    UI.banner("行动失败", src ? `被 ${src} 消灭` : "阵亡", 0);
    Audio.die();
    G.state = "over";
    setTimeout(()=>{ Game.endRun("death"); }, 1800);
  },
};
