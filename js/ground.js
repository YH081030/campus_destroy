/* ============================================================
 * 地面 / 道路 / 空气墙 —— 全部可破坏
 * 四叉树多分辨率网格：道路12m / 精细区24m / 校区草地48m / 野外96m
 * ============================================================ */
"use strict";
/* 共享建造工具 */
const SU = window.SU = {
  diff(){ return CFG.DIFFS[G.diff]; },
  hp(kind){ return CFG.SEG[kind].hp * this.diff().bhp; },
  val(kind){ return CFG.SEG[kind].value * this.diff().bval; },
  /* 物理可破坏段（盒子） */
  boxSeg(kind, x, y, z, sx, sy, sz, mat, opts){
    opts = opts||{};
    const mesh = new THREE.Mesh(W.geos.box, mat);
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, y, z);
    if (opts.euler) mesh.rotation.set(opts.euler.x||0, opts.euler.y||0, opts.euler.z||0);
    mesh.castShadow = false;
    mesh.receiveShadow = (kind==="tile"||kind==="fieldtile"||kind==="slab"||kind==="roof");
    G.scene.add(mesh);
    const body = new CANNON.Body({mass:0, shape:new CANNON.Box(new CANNON.Vec3(sx/2, sy/2, sz/2))});
    body.position.set(x, y, z);
    if (opts.quat3){
      mesh.quaternion.copy(opts.quat3);
      body.quaternion.set(opts.quat3.x, opts.quat3.y, opts.quat3.z, opts.quat3.w);
    } else if (opts.euler) body.quaternion.setFromEuler(opts.euler.x||0, opts.euler.y||0, opts.euler.z||0);
    body.collisionFilterGroup = 1; body.collisionFilterMask = -1;
    const seg = {
      kind, mesh, body,
      hp: this.hp(kind), maxHp: this.hp(kind),
      value: this.val(kind),
      color: mat.color.getHex(),
      size: (sx+sy+sz)/3,
      dead:false, floor: opts.floor||0, building: opts.building||null,
      onDestroyed: opts.onDestroyed||null,
    };
    W.addSeg(seg);
    return seg;
  },
  /* 非物理装饰（无碰撞） */
  decor(geo, mat, x, y, z, euler, scale){
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x,y,z);
    if (euler) m.rotation.set(euler.x||0, euler.y||0, euler.z||0);
    if (scale) m.scale.setScalar(scale);
    m.castShadow = false; m.receiveShadow = false;
    G.scene.add(m);
    return m;
  },
  /* 实例化道具条目 */
  instanced(geo, mat, count){
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.userData.props = [];
    G.scene.add(mesh);
    W.addBlockerMesh(mesh, null);
    return mesh;
  },
  propEntry(opts){
    const e = {
      isPropEntry:true, kind: opts.kind, hp: this.hp(opts.kind), maxHp: this.hp(opts.kind),
      value: this.val(opts.kind), dead:false,
      pos: new THREE.Vector3(opts.x, opts.y, opts.z),
      size: opts.size||0.5, color: opts.color||0x8a8a88,
      floor: opts.floor||0,
      onDestroyed: opts.onDestroyed||null,
      meshes: [],
    };
    W.spatial.add(e);
    return e;
  },
  damageProp(e, dmg, point, dir){
    if (!e || e.dead || e.kind==="water") return;
    e.hp -= dmg;
    if (e.hp <= 0){
      e.dead = true;
      W.spatial.remove(e);
      for (const m of e.meshes){
        const m4 = new THREE.Matrix4().makeScale(0,0,0);
        m.mesh.setMatrixAt(m.instanceId, m4);
        m.mesh.instanceMatrix.needsUpdate = true;
      }
      if (e.value > 0){
        Eco.addDamage(e.value);
        W.spawnDebris(e.pos, e.size, e.color, dir||new THREE.Vector3(0,1,0), e.kind==="tree"?4:2);
      }
      if (e.onDestroyed) e.onDestroyed(e, point);
    }
  },
  setInstance(mesh, idx, x, y, z, ry, sx, sy, sz){
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry||0, 0));
    const s = new THREE.Vector3(sx||1, sy||1, sz||1);
    m4.compose(new THREE.Vector3(x,y,z), q, s);
    mesh.setMatrixAt(idx, m4);
    mesh.instanceMatrix.needsUpdate = true;
  },
  letterTexture(ch, color, bg){
    const c = document.createElement("canvas");
    c.width = 256; c.height = 256;
    const ctx = c.getContext("2d");
    if (bg){ ctx.fillStyle = bg; ctx.fillRect(0,0,256,256); }
    ctx.fillStyle = color || "#e8c85a";
    ctx.font = "bold 200px 'Microsoft YaHei', sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(ch, 128, 132);
    return new THREE.CanvasTexture(c);
  },
};

const Ground = window.Ground = {
  build(){
    this.buildGrid();
    this.buildAirWalls(CFG.LAYOUT);
    this.buildRoadMarkings(CFG.LAYOUT);
  },

  /* ---------- 分区（按瓦片范围求交，避免大瓦片污染道路边缘） ---------- */
  inCampus(x, z, c){
    return x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1;
  },
  zoneOf(x, z, size){
    const L = CFG.LAYOUT;
    const h = (size||12)/2;
    const x0 = x-h, x1 = x+h, z0 = z-h, z1 = z+h;
    const over = (ax0,az0,ax1,az1)=> x0 < ax1 && x1 > ax0 && z0 < az1 && z1 > az0;
    // 校内道路（优先）
    for (const r of L.internalRoads){
      if (over(r.x0, r.z0, r.x1, r.z1)) return "road";
    }
    // 主干道（连接两校的长路）
    if (over(L.roadMain.x0, L.roadMain.z0, L.roadMain.x1, L.roadMain.z1)) return "road";
    // 北侧支路
    if (over(L.roadNorth.x0, L.roadNorth.z0, L.roadNorth.x1, L.roadNorth.z1)) return "road";
    // 人行道
    if (over(L.roadMain.x0, L.sidewalkN.z0, L.roadMain.x1, L.sidewalkN.z1)) return "sidewalk";
    if (over(L.roadMain.x0, L.sidewalkS.z0, L.roadMain.x1, L.sidewalkS.z1)) return "sidewalk";
    // M校
    if (over(L.campusA.x0, L.campusA.z0, L.campusA.x1, L.campusA.z1)){
      const lk = L.lake;
      const ex = (x-lk.cx)/lk.rx, ez = (z-lk.cz)/lk.rz;
      if (ex*ex + ez*ez <= 1.05) return "lake";
      const pa = L.plazaA;
      if (over(pa.cx-pa.rx, pa.cz-pa.rz, pa.cx+pa.rx, pa.cz+pa.rz)) return "plaza";
      const f = L.fieldA;
      if (over(f.x0-4, f.z0-4, f.x1+4, f.z1+4)) return "field";
      const c = L.courtsA;
      if (over(c.x0-2, c.z0-2, c.x1+2, c.z1+2)) return "court";
      const p = L.parkingA;
      if (over(p.x0-2, p.z0-2, p.x1+2, p.z1+2)) return "road";
      return "grass";
    }
    if (over(L.campusB.x0, L.campusB.z0, L.campusB.x1, L.campusB.z1)){
      const pb = L.plazaB;
      if (over(pb.cx-pb.rx, pb.cz-pb.rz, pb.cx+pb.rx, pb.cz+pb.rz)) return "plaza";
      const f = L.fieldB;
      if (over(f.x0-4, f.z0-4, f.x1+4, f.z1+4)) return "field";
      const c = L.courtsB;
      if (over(c.x0-2, c.z0-2, c.x1+2, c.z1+2)) return "court";
      const p = L.parkingB;
      if (over(p.x0-2, p.z0-2, p.x1+2, p.z1+2)) return "road";
      return "grass";
    }
    return "grass";
  },

  requiredSize(x, z, size){
    const L = CFG.LAYOUT;
    const h = size/2;
    const x0 = x-h, x1 = x+h, z0 = z-h, z1 = z+h;
    const over = (ax0,az0,ax1,az1)=> x0 < ax1 && x1 > ax0 && z0 < az1 && z1 > az0;
    // 校内道路（12m 细分）
    for (const r of L.internalRoads){
      if (over(r.x0, r.z0, r.x1, r.z1)) return 12;
    }
    if (over(L.roadMain.x0, L.roadMain.z0, L.roadMain.x1, L.roadMain.z1)) return 12;
    if (over(L.roadNorth.x0, L.roadNorth.z0, L.roadNorth.x1, L.roadNorth.z1)) return 12;
    if (over(L.roadMain.x0, L.sidewalkN.z0, L.roadMain.x1, L.sidewalkN.z1)) return 12;
    if (over(L.roadMain.x0, L.sidewalkS.z0, L.roadMain.x1, L.sidewalkS.z1)) return 12;
    const fine24 = [
      [L.plazaA.cx-L.plazaA.rx, L.plazaA.cz-L.plazaA.rz, L.plazaA.cx+L.plazaA.rx, L.plazaA.cz+L.plazaA.rz],
      [L.plazaB.cx-L.plazaB.rx, L.plazaB.cz-L.plazaB.rz, L.plazaB.cx+L.plazaB.rx, L.plazaB.cz+L.plazaB.rz],
      [L.fieldA.x0-4, L.fieldA.z0-4, L.fieldA.x1+4, L.fieldA.z1+4],
      [L.fieldB.x0-4, L.fieldB.z0-4, L.fieldB.x1+4, L.fieldB.z1+4],
      [L.courtsA.x0-2, L.courtsA.z0-2, L.courtsA.x1+2, L.courtsA.z1+2],
      [L.courtsB.x0-2, L.courtsB.z0-2, L.courtsB.x1+2, L.courtsB.z1+2],
      [L.parkingA.x0-2, L.parkingA.z0-2, L.parkingA.x1+2, L.parkingA.z1+2],
      [L.parkingB.x0-2, L.parkingB.z0-2, L.parkingB.x1+2, L.parkingB.z1+2],
      [L.lake.cx-L.lake.rx, L.lake.cz-L.lake.rz, L.lake.cx+L.lake.rx, L.lake.cz+L.lake.rz],
    ];
    for (const r of fine24){
      if (over(r[0], r[1], r[2], r[3])) return 24;
    }
    for (const c of [L.campusA, L.campusB]){
      if (over(c.x0, c.z0, c.x1, c.z1)) return 48;
    }
    return 96;
  },

  matFor(zone){
    const M = W.mats;
    switch(zone){
      case "road": return {mat:M.road, kind:"tile"};
      case "sidewalk": return {mat:M.sidewalk, kind:"tile"};
      case "plaza": return {mat:M.plaza, kind:"tile"};
      case "field": return {mat:M.field, kind:"fieldtile"};
      case "court": return {mat:M.court, kind:"tile"};
      case "lake": return {mat:M.lake, kind:"fieldtile", yOff:-1.2};
      case "grass": return {mat:M.grass, kind:"fieldtile"};
    }
    return {mat:M.grass, kind:"fieldtile"};
  },

  tile(x, z, cell, zone){
    const m = this.matFor(zone);
    const yTop = m.yOff ? m.yOff : 0;
    const th = W.terrainH ? W.terrainH(x, z) : 0; // 地形高度
    const surfY = yTop + th;          // 表面高度
    const H = 60;                     // 瓦片高度（覆盖±20m地形，避免缝隙）
    const y = surfY - H/2;
    const mesh = new THREE.Mesh(W.geos.box, m.mat);
    mesh.scale.set(cell, H, cell);
    mesh.position.set(x, y, z);
    mesh.castShadow = false; mesh.receiveShadow = true;
    G.scene.add(mesh);
    const body = new CANNON.Body({mass:0, shape:new CANNON.Box(new CANNON.Vec3(cell/2, H/2, cell/2))});
    body.position.set(x, y, z);
    body.collisionFilterGroup = 1; body.collisionFilterMask = -1;
    const seg = {
      kind: m.kind, mesh, body,
      hp: SU.hp(m.kind), maxHp: SU.hp(m.kind),
      value: SU.val(m.kind),
      color: m.mat.color.getHex(), size: cell, dead:false,
      floor:0, building:null, surfaceY: surfY,
      onDestroyed: (s, p)=>{
        const crater = new THREE.Mesh(
          new THREE.CylinderGeometry(Math.min(cell*0.4, 5), Math.min(cell*0.55, 6), 0.4, 10),
          new THREE.MeshLambertMaterial({color: m.kind==="fieldtile" ? 0x4a3a24 : 0x2e2e34})
        );
        crater.position.set(s.mesh.position.x, s.surfaceY + 0.2, s.mesh.position.z);
        crater.receiveShadow = true;
        G.scene.add(crater);
      },
    };
    W.addSeg(seg);
  },

  /* ---------- 四叉树细分 ---------- */
  buildGrid(){
    // 基础96m网格覆盖整个地图（多出边界少许）
    for (let x = -2736; x <= 2784; x += 96){
      for (let z = -2352; z <= 384; z += 96){
        this.subdivide(x, z, 96, 0);
      }
    }
  },
  subdivide(x, z, size, depth){
    const need = this.requiredSize(x, z, size);
    if (size <= need || depth >= 3){
      this.tile(x, z, size, this.zoneOf(x, z, size));
      return;
    }
    const h = size/2;
    this.subdivide(x-h/2, z-h/2, h, depth+1);
    this.subdivide(x+h/2, z-h/2, h, depth+1);
    this.subdivide(x-h/2, z+h/2, h, depth+1);
    this.subdivide(x+h/2, z+h/2, h, depth+1);
  },

  buildAirWalls(L){
    const b = L.bounds;
    const H = L.airwallH;
    const mat = new THREE.MeshBasicMaterial({
      color: 0x66ccff, transparent:true, opacity:0.05, side:THREE.DoubleSide, depthWrite:false,
    });
    const walls = [
      { x:0,  z:b.zN, sx:b.x*2, sz:1 },
      { x:0,  z:b.zS, sx:b.x*2, sz:1 },
      { x:b.x, z:(b.zN+b.zS)/2, sx:1, sz:(b.zS-b.zN) },
      { x:-b.x,z:(b.zN+b.zS)/2, sx:1, sz:(b.zS-b.zN) },
    ];
    for (const w of walls){
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w.sx, H), mat);
      mesh.position.set(w.x, H/2, w.z);
      mesh.rotation.y = (w.sx>w.sz) ? 0 : Math.PI/2;
      G.scene.add(mesh);
      const body = new CANNON.Body({
        mass:0,
        shape: new CANNON.Box(new CANNON.Vec3(Math.max(w.sx,w.sz)/2, H/2, 0.3)),
      });
      body.position.set(w.x, H/2, w.z);
      if (w.sx > w.sz) body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), Math.PI/2);
      body.collisionFilterGroup = 1; body.collisionFilterMask = -1;
      G.world.addBody(body);
    }
  },

  buildRoadMarkings(L){
    const white = new THREE.MeshBasicMaterial({color:0xe8e8e0});
    const yellow = new THREE.MeshBasicMaterial({color:0xd8c040});
    const dash = new THREE.PlaneGeometry(3, 0.12);
    const instN = (L.roadMain.x1 - L.roadMain.x0)/6;
    const mk = (geo, mat, count, y, get)=>{
      const m = new THREE.InstancedMesh(geo, mat, count);
      for (let i=0;i<count;i++){
        const p = get(i);
        SU.setInstance(m, i, p.x, y, p.z, 0);
      }
      m.receiveShadow = false;
      G.scene.add(m);
      return m;
    };
    mk(dash, yellow, instN, 0.35, i=>({x:L.roadMain.x0+3+i*6, z:32}));
    mk(dash, white, instN, 0.35, i=>({x:L.roadMain.x0+3+i*6, z:26}));
    mk(dash, white, instN, 0.35, i=>({x:L.roadMain.x0+3+i*6, z:38}));
    const instN2 = (L.roadNorth.z1 - L.roadNorth.z0)/6;
    mk(dash, yellow, instN2, 0.35, i=>({x:0, z:L.roadNorth.z0+3+i*6}));
    // 校门口斑马线
    const stripe = new THREE.PlaneGeometry(0.8, 20);
    const instC = new THREE.InstancedMesh(stripe, white, 20);
    let ci = 0;
    for (const gate of [1500, -1750]){
      for (let i=0;i<10;i++){
        SU.setInstance(instC, ci++, gate-9+i*2, 0.34, 21.5, 0);
      }
    }
    G.scene.add(instC);
    // 校内道路中心虚线
    for (const r of L.internalRoads){
      const horizontal = (r.x1 - r.x0) > (r.z1 - r.z0);
      if (horizontal){
        const n = Math.max(1, Math.round((r.x1 - r.x0)/8));
        mk(dash, yellow, n, 0.35, i=>({x:r.x0+4+i*8, z:(r.z0+r.z1)/2}));
      } else {
        const n = Math.max(1, Math.round((r.z1 - r.z0)/8));
        mk(dash, white, n, 0.35, i=>({x:(r.x0+r.x1)/2, z:r.z0+4+i*8}));
      }
    }
  },
};
