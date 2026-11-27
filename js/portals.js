/* ============================================================
 * 传送门 —— 12座怪物裂隙(巨大化，可破坏) + 3座撤离门(巨大光门)
 * 裂隙：造价1000万美元，破坏计入破坏价值，破坏后不再刷新怪物
 * ============================================================ */
"use strict";
/* 血条精灵工具（怪物/传送门共用） */
const HPBar = window.HPBar = {
  make(w, h, worldScale){
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({map:tex, transparent:true});
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(worldScale||1.9, (worldScale||1.9)*h/w, 1);
    sprite.visible = false;
    G.scene.add(sprite);
    return {
      sprite, tex, c,
      set(pct){
        const ctx = c.getContext("2d");
        ctx.clearRect(0,0,w,h);
        ctx.fillStyle = "rgba(8,10,14,0.75)";
        ctx.fillRect(0,0,w,h);
        ctx.fillStyle = pct>0.5 ? "#5ad85a" : (pct>0.25 ? "#e8b828" : "#e04848");
        ctx.fillRect(1,1,(w-2)*Math.max(0,Math.min(1,pct)), h-2);
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.strokeRect(0.5,0.5,w-1,h-1);
        tex.needsUpdate = true;
      },
      pos(x,y,z){ sprite.position.set(x,y,z); },
      show(){ sprite.visible = true; },
      hide(){ sprite.visible = false; },
      remove(){ G.scene.remove(sprite); },
    };
  },
};

const Portals = window.Portals = {
  spawns: [], exits: [],
  glowTex: null,
  SPAWN_R: 5.6,   // 怪物裂隙巨大化半径
  EXIT_R: 7.5,    // 撤离门巨大化半径

  build(){
    this.spawns = []; this.exits = [];
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(64,64,8,64,64,60);
    g.addColorStop(0,"rgba(255,255,255,0.9)");
    g.addColorStop(0.5,"rgba(255,255,255,0.25)");
    g.addColorStop(1,"rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,128,128);
    this.glowTex = new THREE.CanvasTexture(c);
    for (const p of CFG.LAYOUT.portals) this.makeSpawn(p);
    for (const e of CFG.LAYOUT.exits) this.makeExit(e);
  },

  beam(color, radius, height, opacity){
    // 垂直光柱（圆柱，双面，加色混合）
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(radius*0.92, radius, height, 20, 1, true),
      new THREE.MeshBasicMaterial({color, transparent:true, opacity, side:THREE.DoubleSide, depthWrite:false})
    );
    return m;
  },
  ringGeo(color, radius, opacity){
    const grp = new THREE.Group();
    // 主环（粗）
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.09, 10, 40),
      new THREE.MeshBasicMaterial({color, transparent:true, opacity})
    );
    torus.scale.setScalar(radius*2);
    grp.add(torus);
    // 外环（细）
    const torus2 = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.028, 8, 40),
      new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:Math.min(1, opacity+0.25)})
    );
    torus2.scale.setScalar(radius*2*1.06);
    grp.add(torus2);
    // 内涡旋圆面
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 32),
      new THREE.MeshBasicMaterial({color, transparent:true, opacity:0.28, side:THREE.DoubleSide, depthWrite:false})
    );
    glow.scale.setScalar(radius*1.8);
    grp.add(glow);
    // 地面符文圈
    const rune = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.05, 6, 40),
      new THREE.MeshBasicMaterial({color, transparent:true, opacity:0.6, depthWrite:false})
    );
    rune.rotation.x = Math.PI/2;
    rune.scale.setScalar(radius*1.7);
    rune.position.y = -radius*0.42;
    grp.add(rune);
    const rune2 = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.035, 6, 40),
      new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:0.35, depthWrite:false})
    );
    rune2.rotation.x = Math.PI/2;
    rune2.scale.setScalar(radius*1.35);
    rune2.position.y = -radius*0.42;
    grp.add(rune2);
    // 轨道粒子
    const parts = [];
    for (let i=0;i<16;i++){
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowTex, color, transparent:true, opacity:0.85, depthWrite:false}));
      sp.scale.setScalar(radius*0.45);
      sp.userData = {ang:(i/16)*Math.PI*2, r:radius*(0.9+Math.random()*0.3), speed:0.6+Math.random()*0.6, y:Math.random()*0.8};
      grp.add(sp);
      parts.push(sp);
    }
    return {grp, torus, glow, parts};
  },

  makeSpawn(cfg){
    const x = cfg.x, z = cfg.z;
    const R = this.SPAWN_R;
    const {grp, torus, glow, parts} = this.ringGeo(0xb040d8, R, 0.92);
    grp.position.set(x, R, z);
    G.scene.add(grp);
    // 巨大光柱
    const beam = this.beam(0xc050e8, R, R*3.4, 0.16);
    beam.position.set(x, R*2.4, z);
    G.scene.add(beam);
    // 地面暗色污染圈
    const stain = new THREE.Mesh(
      new THREE.CircleGeometry(R*1.05, 28),
      new THREE.MeshBasicMaterial({color:0x200a2a, transparent:true, opacity:0.5, depthWrite:false})
    );
    stain.rotation.x = -Math.PI/2;
    stain.position.set(x, 0.06, z);
    G.scene.add(stain);
    const p = {
      isPortal:true, kind:"spawn", dead:false, side:cfg.side,
      hp: CFG.PORTAL_HP * CFG.DIFFS[G.diff].bhp,
      maxHp: CFG.PORTAL_HP * CFG.DIFFS[G.diff].bhp,
      pos: new THREE.Vector3(x, R, z),
      hitR: R*0.95,
      grp, torus, glow, parts, beam, stain,
      cfg,
    };
    p.bar = HPBar.make(128, 14, R*1.35);
    p.bar.set(1);
    p.bar.pos(x, R*2.15, z);
    p.bar.show();
    W.addBlockerMesh(torus, p);
    W.addBlockerMesh(glow, p);
    W.spatial.add(p);
    this.spawns.push(p);
  },

  makeExit(cfg){
    const x = cfg.x, z = cfg.z;
    const R = this.EXIT_R;
    const {grp, torus, glow, parts} = this.ringGeo(0x38c8e0, R, 0.85);
    grp.position.set(x, R, z);
    G.scene.add(grp);
    // 巨大青色光柱
    const beam = this.beam(0x40d8f0, R, R*4.2, 0.2);
    beam.position.set(x, R*2.6, z);
    G.scene.add(beam);
    // 地面光圈
    const stain = new THREE.Mesh(
      new THREE.CircleGeometry(R*1.1, 28),
      new THREE.MeshBasicMaterial({color:0x0a2a33, transparent:true, opacity:0.55, depthWrite:false})
    );
    stain.rotation.x = -Math.PI/2;
    stain.position.set(x, 0.06, z);
    G.scene.add(stain);
    // 文字牌
    const tex = SU.letterTexture("撤");
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4), new THREE.MeshLambertMaterial({map:tex, transparent:true}));
    sign.position.set(0, R*1.25, 0);
    grp.add(sign);
    const e = {
      kind:"exit", pos:new THREE.Vector3(x, 0, z), grp, torus, glow, parts, beam, stain, cfg,
      hitR: R,
    };
    this.exits.push(e);
  },

  hit(p, dmg, point){
    if (!p || p.dead || p.kind!=="spawn") return;
    p.hp -= dmg;
    p.bar.set(p.hp/p.maxHp);
    FX.sparks(point || p.pos, 0xc060e0);
    if (p.hp <= 0){
      p.dead = true;
      p.bar.remove();
      W.spatial.remove(p);
      G.scene.remove(p.grp);
      if (p.beam) G.scene.remove(p.beam);
      if (p.stain) G.scene.remove(p.stain);
      // 拆除裂隙
      Eco.addDamage(CFG.PORTAL_VALUE);
      UI.toast(`裂隙摧毁！(${this.destroyed()}/12) 剩余怪物不再从此刷新`, "danger");
      Audio.portalDown();
      W.explosion(p.pos, 12, 900, 1600, true);
      FX.shake(1.6);
      if (this.destroyed() >= 12) UI.banner("所有裂隙已摧毁！", "消灭剩余怪物即可达成大胜", 4);
    }
  },

  alive(){ return this.spawns.filter(p=>!p.dead).length; },
  destroyed(){ return this.spawns.filter(p=>p.dead).length; },

  update(dt){
    const t = G.time;
    for (const p of this.spawns){
      if (p.dead) continue;
      p.torus.rotation.z += dt*0.6;
      p.glow.material.opacity = 0.22 + Math.sin(t*3 + p.pos.x)*0.1;
      p.glow.rotation.z += dt*0.4;
      for (const sp of p.parts){
        sp.userData.ang += dt*sp.userData.speed;
        const a = sp.userData.ang;
        const r = sp.userData.r + Math.sin(t*2+a)*0.25;
        sp.position.set(Math.cos(a)*r, Math.sin(a*1.3)*1.2 + 0.4, Math.sin(a)*r);
        sp.material.opacity = 0.5 + Math.sin(t*4+a)*0.35;
      }
      if (p.beam){
        p.beam.material.opacity = 0.12 + Math.sin(t*2.5 + p.pos.z)*0.06;
        p.beam.rotation.y += dt*0.2;
      }
    }
    for (const e of this.exits){
      e.torus.rotation.z -= dt*0.4;
      e.glow.material.opacity = 0.2 + Math.sin(t*2.5)*0.08;
      for (const sp of e.parts){
        sp.userData.ang += dt*sp.userData.speed;
        const a = sp.userData.ang;
        const r = sp.userData.r;
        sp.position.set(Math.cos(a)*r, Math.sin(a*1.2)*1.2, Math.sin(a)*r);
      }
      if (e.beam){
        e.beam.material.opacity = 0.16 + Math.sin(t*2)*0.07;
        e.beam.rotation.y -= dt*0.15;
      }
    }
    // 撤离提示（巨大化后增大交互距离）
    if (G.state!=="run" || !G.player || G.player.dead) return;
    let near = null;
    for (const e of this.exits){
      const d = Math.hypot(G.player.pos.x-e.pos.x, G.player.pos.z-e.pos.z);
      if (d < 6.5){ near = e; break; }
    }
    if (near){
      UI.interactText = `[F] 从${near.cfg.dir}撤离并结算`;
      if (Input.keyPressed("KeyF")) Game.endRun("exit");
    }
  },
};
