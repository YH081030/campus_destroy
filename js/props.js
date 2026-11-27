/* ============================================================
 * 道具 —— 树 / 路灯 / 长椅 / 公交站 / 旗杆 / 交通灯（全部可破坏）
 * ============================================================ */
"use strict";
/* ============================================================
 * 真实树木模型构建（合并几何：锥形树干 + 分枝 + 不规则树冠）
 * 阔叶树=多扁球树冠；针叶树=分层锥裙树冠
 * ============================================================ */
function mergeGeoms(geoms){
  let vc = 0, ic = 0;
  for (const g of geoms){ vc += g.attributes.position.count; ic += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(vc*3);
  const idx = new Uint32Array(ic);
  let vO = 0, iO = 0, base = 0;
  for (const g of geoms){
    pos.set(g.attributes.position.array, vO);
    if (g.index){
      const gi = g.index.array;
      for (let i=0;i<gi.length;i++) idx[iO+i] = gi[i] + base;
      iO += gi.length;
    } else {
      for (let i=0;i<g.attributes.position.count;i++) idx[iO+i] = base + i;
      iO += g.attributes.position.count;
    }
    base += g.attributes.position.count;
    vO += g.attributes.position.array.length;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  return geo;
}
function _cyl(rTop, rBottom, len, x, y, z, seg){
  const g = new THREE.CylinderGeometry(rTop, rBottom, len, seg||8);
  g.translate(x, y, z);
  return g;
}
function _cone(r, len, x, y, z, seg){
  const g = new THREE.ConeGeometry(r, len, seg||9);
  g.translate(x, y, z);
  return g;
}
function _sph(r, x, y, z, sy){
  const g = new THREE.SphereGeometry(r, 8, 6);
  if (sy && sy !== 1) g.scale(1, sy, 1);
  g.translate(x, y, z);
  return g;
}
function _branch(rTop, rBottom, len, base, dir){
  const d = dir.clone().normalize();
  const g = new THREE.CylinderGeometry(rTop, rBottom, len, 5);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), d);
  const mid = base.clone().addScaledVector(d, len/2);
  g.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1,1,1)));
  return g;
}
/* 阔叶树：锥形主干 + 主枝/次枝 + 多扁球冠 */
function broadleafWoodGeo(){
  const g = [];
  g.push(_cyl(0.13, 0.4, 3.4, 0, 1.7, 0, 8));
  for (let i=0;i<4;i++){
    const a = (i/4)*Math.PI*2 + 0.42;
    const dir = new THREE.Vector3(Math.sin(a)*0.62, 0.75, Math.cos(a)*0.62);
    g.push(_branch(0.05, 0.15, 2.4, new THREE.Vector3(Math.sin(a)*0.24, 2.7, Math.cos(a)*0.24), dir));
  }
  for (let i=0;i<3;i++){
    const a = (i/3)*Math.PI*2 + 1.1;
    const dir = new THREE.Vector3(Math.sin(a)*0.72, 0.55, Math.cos(a)*0.72);
    g.push(_branch(0.04, 0.09, 1.7, new THREE.Vector3(Math.sin(a)*0.8, 4.1, Math.cos(a)*0.8), dir));
  }
  return mergeGeoms(g);
}
function broadleafLeafGeo(){
  const g = [];
  const lobes = [
    [-1.6, 4.3, 0.3, 1.5, 1.2],
    [1.5, 4.4, -0.4, 1.5, 1.2],
    [0.0, 5.6, 0.0, 1.75, 1.35],
    [1.0, 6.3, 0.8, 1.3, 1.1],
    [-0.9, 6.5, -0.7, 1.3, 1.1],
    [0.1, 7.1, 0.2, 1.1, 1.0],
    [-0.3, 5.0, 1.3, 1.25, 1.05],
    [0.4, 4.8, -1.2, 1.2, 1.0],
  ];
  for (const l of lobes) g.push(_sph(l[3], l[0], l[1], l[2], l[4]));
  return mergeGeoms(g);
}
/* 针叶树：笔直锥形主干 + 分层锥裙树冠 */
function coniferWoodGeo(){
  const g = [];
  g.push(_cyl(0.04, 0.26, 8.5, 0, 4.25, 0, 8));
  return mergeGeoms(g);
}
function coniferLeafGeo(){
  const g = [];
  const tiers = [
    [2.4, 1.2, 1.6],
    [2.0, 1.15, 3.4],
    [1.6, 1.1, 5.1],
    [1.2, 1.0, 6.7],
    [0.6, 0.9, 8.2],
  ];
  for (const t of tiers) g.push(_cone(t[0], t[1]*2, 0, t[2]+t[1], 0, 9));
  return mergeGeoms(g);
}

const Props = window.Props = {
  build(){
    const L = CFG.LAYOUT;
    this.trees(L);
    this.rocks(L);
    this.streetlights(L);
    this.benches(L);
    this.busStops(L);
    this.flagpoles(L);
    this.trafficLights(L);
    this.roadCovers(L);
    this.roadSigns(L);
    this.roadHouses(L);
  },

  /* ---------- 树木（真实模型：阔叶树/针叶树，高度 5~30 米） ---------- */
  trees(L){
    const spots = [];
    const add = (x,z,s,kind)=>{ if (!spots.some(p=>Math.abs(p.x-x)<5 && Math.abs(p.z-z)<5)) spots.push({x,z,s,kind}); };
    const rnd = (a,b)=>a+Math.random()*(b-a);
    const rndS = ()=>{
      const r = Math.random();
      if (r < 0.55) return rnd(0.6, 1.2);
      if (r < 0.85) return rnd(1.2, 2.2);
      return rnd(2.2, 3.4);
    };
    const kind = ()=> Math.random() < 0.62 ? "broad" : "conifer";
    // 主路两侧行道树（5.4km）
    for (let x=-2688; x<=2688; x+=10){
      add(x + rnd(-2,2), 12, rnd(0.8,1.6), kind());
      add(x + rnd(-2,2), 57, rnd(0.8,1.6), kind());
    }
    // 北支路两侧
    for (let z=-2300; z<=10; z+=12){ add(-17, z, rnd(0.8,1.6), kind()); add(17, z, rnd(0.8,1.6), kind()); }
    // 校区内部草坪（加种）
    const ca = L.campusA, cb = L.campusB;
    for (let i=0;i<320;i++) add(rnd(ca.x0+8,ca.x1-8), rnd(ca.z0+8,ca.z1-8), rndS(), kind());
    for (let i=0;i<260;i++) add(rnd(cb.x0+8,cb.x1-8), rnd(cb.z0+8,cb.z1-8), rndS(), kind());
    // 湖边柳树（阔叶）
    const lk = L.lake;
    for (let i=0;i<24;i++){
      const a = Math.random()*Math.PI*2;
      add(lk.cx + Math.cos(a)*lk.rx*1.12, lk.cz + Math.sin(a)*lk.rz*1.12, rnd(1.0,1.6), "broad");
    }
    // 荒地随机（加种）
    for (let i=0;i<300;i++){
      const x = rnd(-2650,2650), z = rnd(-2300,300);
      if ((x>ca.x0-20&&x<ca.x1+20&&z>ca.z0-20&&z<ca.z1+20)||(x>cb.x0-20&&x<cb.x1+20&&z>cb.z0-20&&z<cb.z1+20)) continue;
      add(x, z, rndS(), kind());
    }

    const broad = spots.filter(p=>p.kind==="broad");
    const conifer = spots.filter(p=>p.kind==="conifer");
    const broadWood = SU.instanced(broadleafWoodGeo(), W.mats.trunk, broad.length);
    const broadLeaf = SU.instanced(broadleafLeafGeo(), W.mats.canopy, broad.length);
    const coniferWood = SU.instanced(coniferWoodGeo(), W.mats.trunk, conifer.length);
    const coniferLeaf = SU.instanced(coniferLeafGeo(), W.mats.canopy, conifer.length);
    const place = (p, i, woodM, leafM)=>{
      const s = p.s;
      const ry = Math.random()*Math.PI*2;
      const gy = W.terrainH ? W.terrainH(p.x, p.z) : 0;
      SU.setInstance(woodM, i, p.x, gy, p.z, ry, s, s, s);
      SU.setInstance(leafM, i, p.x, gy, p.z, ry, s, s, s);
      const e = SU.propEntry({kind:"tree", x:p.x, y:3.5*s + gy, z:p.z, size:1.3*s, color:0x5a6a3a});
      e.flammable = true;
      e.hitR = 4.0*s; // 命中球体覆盖树干+树冠，便于弹体/火球命中与点燃
      e.meshes = [{mesh:woodM, instanceId:i},{mesh:leafM, instanceId:i}];
      woodM.userData.props[i] = e;
      leafM.userData.props[i] = e;
    };
    broad.forEach((p,i)=>place(p, i, broadWood, broadLeaf));
    conifer.forEach((p,i)=>place(p, i, coniferWood, coniferLeaf));
  },

  /* ---------- 石块（大小不一，草地/野外） ---------- */
  rocks(L){
    const rnd = (a,b)=>a+Math.random()*(b-a);
    const ca = L.campusA, cb = L.campusB;
    const spots = [];
    const add = (x,z,s)=>{ if (!spots.some(p=>Math.abs(p.x-x)<3 && Math.abs(p.z-z)<3)) spots.push({x,z,s}); };
    for (let i=0;i<700;i++) add(rnd(ca.x0+8,ca.x1-8), rnd(ca.z0+8,ca.z1-8), rnd(0.4,1.8));
    for (let i=0;i<600;i++) add(rnd(cb.x0+8,cb.x1-8), rnd(cb.z0+8,cb.z1-8), rnd(0.4,1.8));
    for (let i=0;i<1100;i++){
      const x = rnd(-2650,2650), z = rnd(-2300,300);
      if ((x>ca.x0-20&&x<ca.x1+20&&z>ca.z0-20&&z<ca.z1+20)||(x>cb.x0-20&&x<cb.x1+20&&z>cb.z0-20&&z<cb.z1+20)) continue;
      add(x, z, rnd(0.4,2.4));
    }
    const mat = new THREE.MeshLambertMaterial({color:0x8a8480});
    for (const p of spots) this.rock(p.x, p.z, p.s, mat);
  },
  rock(x, z, s, mat){
    const gy = W.terrainH ? W.terrainH(x, z) : 0;
    const grp = new THREE.Group();
    const n = 2 + Math.floor(Math.random()*2);
    for (let i=0;i<n;i++){
      const m = new THREE.Mesh(W.geos.sphere, mat);
      const r = s*(0.5+Math.random()*0.5);
      m.scale.set(r*(0.7+Math.random()*0.4), r*(0.45+Math.random()*0.3), r*(0.7+Math.random()*0.4));
      m.position.set((Math.random()-0.5)*s*0.7, m.scale.y*0.35, (Math.random()-0.5)*s*0.7);
      m.rotation.set(Math.random()*3, Math.random()*3, Math.random()*3);
      m.castShadow = false;
      grp.add(m);
    }
    grp.position.set(x, gy, z);
    G.scene.add(grp);
    const body = new CANNON.Body({mass:0, shape:new CANNON.Box(new CANNON.Vec3(s*0.8, s*0.5, s*0.8))});
    body.position.set(x, gy + s*0.4, z);
    body.collisionFilterGroup = 1; body.collisionFilterMask = -1;
    const seg = {
      kind:"prop", mesh:grp, body,
      hp:SU.hp("prop")*3, maxHp:SU.hp("prop")*3, value:SU.val("prop")*2,
      color:0x8a8480, size:s*1.5, dead:false, floor:0, building:null,
      onDestroyed:(s2,p)=>W.spawnDebris(p, 0.5, 0x8a8480, new THREE.Vector3(0,1,0), 3),
    };
    W.addSeg(seg);
  },

  /* ---------- 路灯 ---------- */
  streetlights(L){
    const spots = [];
    for (let x=-2688; x<=2688; x+=24){
      spots.push({x, z:17, ry:0});
      spots.push({x, z:48, ry:Math.PI});
    }
    for (let z=-2300; z<=6; z+=24){ spots.push({x:-8, z, ry:-Math.PI/2}); spots.push({x:8, z, ry:Math.PI/2}); }
    for (let x=530; x<=2470; x+=28){ spots.push({x, z:-13, ry:Math.PI}); }
    for (let x=-2470; x<=-1030; x+=28){ spots.push({x, z:-13, ry:Math.PI}); }

    const poles = SU.instanced(new THREE.CylinderGeometry(0.16, 0.24, 8, 6), W.mats.dark, spots.length);
    const arms = SU.instanced(new THREE.BoxGeometry(0.3, 2.2, 0.3), W.mats.dark, spots.length);
    const bulbs = SU.instanced(new THREE.SphereGeometry(0.3, 6, 5), new THREE.MeshBasicMaterial({color:0xfff0c0}), spots.length);
    spots.forEach((p, i)=>{
      SU.setInstance(poles, i, p.x, 4, p.z, 0);
      SU.setInstance(arms, i, p.x, 7.4, p.z+1.2, p.ry);
      SU.setInstance(bulbs, i, p.x, 8.3, p.z+1.2, p.ry);
      const e = SU.propEntry({kind:"lamp", x:p.x, y:5, z:p.z, size:0.6, color:0x3a3a42});
      e.meshes = [{mesh:poles, instanceId:i},{mesh:arms, instanceId:i},{mesh:bulbs, instanceId:i}];
      poles.userData.props[i] = e; arms.userData.props[i] = e; bulbs.userData.props[i] = e;
    });
  },

  /* ---------- 长椅 ---------- */
  benches(L){
    const spots = [];
    for (let x=620; x<=2380; x+=20){ spots.push({x, z:-120, ry:0}); }
    for (let x=-2380; x<=-1120; x+=20){ spots.push({x, z:-120, ry:0}); }
    for (const f of [L.fieldA, L.fieldB]){
      for (let i=0;i<3;i++){
        spots.push({x:f.x0-6, z:f.z0+15+i*20, ry:Math.PI/2});
        spots.push({x:f.x1+6, z:f.z0+15+i*20, ry:-Math.PI/2});
      }
    }
    for (let x=-2500; x<=2500; x+=240){ spots.push({x, z:60, ry:Math.PI}); }
    const seat = SU.instanced(new THREE.BoxGeometry(2.2, 0.12, 0.7), W.mats.wood, spots.length);
    const legs = SU.instanced(new THREE.BoxGeometry(0.15, 0.6, 0.6), W.mats.steel, spots.length*2);
    spots.forEach((p, i)=>{
      SU.setInstance(seat, i, p.x, 0.62, p.z, p.ry);
      SU.setInstance(legs, i*2, p.x-0.8, 0.3, p.z, p.ry);
      SU.setInstance(legs, i*2+1, p.x+0.8, 0.3, p.z, p.ry);
      const e = SU.propEntry({kind:"prop", x:p.x, y:0.6, z:p.z, size:0.8, color:0x9a6a3a});
      e.meshes = [{mesh:seat, instanceId:i},{mesh:legs, instanceId:i*2},{mesh:legs, instanceId:i*2+1}];
      seat.userData.props[i] = e; legs.userData.props[i*2] = e; legs.userData.props[i*2+1] = e;
    });
  },

  /* ---------- 公交站 ---------- */
  busStops(L){
    const mk = (x,z,ry)=>{
      const grp = new THREE.Group();
      const roof = new THREE.Mesh(new THREE.BoxGeometry(8, 0.2, 2.4), W.mats.dark);
      roof.position.set(0, 3.0, 0);
      grp.add(roof);
      for (const sx of [-3.6, 3.6]){
        const pole = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.0, 0.2), W.mats.steel);
        pole.position.set(sx, 1.5, 0);
        grp.add(pole);
      }
      const glass = new THREE.Mesh(new THREE.BoxGeometry(7.4, 1.4, 0.1), W.mats.glass);
      glass.position.set(0, 2.2, -1.1);
      grp.add(glass);
      const bench = new THREE.Mesh(new THREE.BoxGeometry(6, 0.15, 0.6), W.mats.wood);
      bench.position.set(0, 0.5, -1.3);
      grp.add(bench);
      grp.position.set(x, 0, z);
      grp.rotation.y = ry;
      G.scene.add(grp);
      const body = new CANNON.Body({mass:0, shape:new CANNON.Box(new CANNON.Vec3(4, 1.6, 1.4))});
      body.position.set(x, 1.6, z);
      body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), ry);
      body.collisionFilterGroup = 1; body.collisionFilterMask = -1;
      const seg = {
        kind:"prop", mesh:grp, body,
        hp:SU.hp("prop")*3, maxHp:SU.hp("prop")*3, value:SU.val("prop")*4,
        color:0x7a8290, size:3, dead:false, floor:0, building:null,
        onDestroyed:(s, p)=>W.spawnDebris(p, 0.8, 0x7a8290, new THREE.Vector3(0,1,0), 3),
      };
      W.addSeg(seg);
    };
    mk(600, 44.5, 0); mk(-600, 44.5, 0); mk(1800, 44.5, 0); mk(-1800, 44.5, 0);
    mk(1500, 16, Math.PI); mk(-1750, 16, Math.PI);
  },

  /* ---------- 旗杆 ---------- */
  flagpoles(L){
    const mk = (x, z, color)=>{
      const grp = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 12, 6), W.mats.steel);
      pole.position.y = 6;
      grp.add(pole);
      const flagGeo = new THREE.PlaneGeometry(2.4, 1.5);
      flagGeo.translate(1.2, 0, 0);
      const flag = new THREE.Mesh(flagGeo, new THREE.MeshLambertMaterial({color, side:THREE.DoubleSide}));
      flag.position.set(0, 11, 0);
      grp.add(flag);
      grp.position.set(x, 0, z);
      G.scene.add(grp);
      const body = new CANNON.Body({mass:0, shape:new CANNON.Cylinder(0.12, 0.12, 12, 6)});
      body.position.set(x, 6, z);
      body.collisionFilterGroup = 1; body.collisionFilterMask = -1;
      const seg = {
        kind:"prop", mesh:grp, body,
        hp:SU.hp("prop"), maxHp:SU.hp("prop"), value:SU.val("prop"),
        color:0x7a8290, size:1.5, dead:false, floor:0, building:null,
        onDestroyed:(s,p)=>W.spawnDebris(p, 0.5, 0x7a8290, new THREE.Vector3(0,1,0), 2),
      };
      W.addSeg(seg);
    };
    mk(1500, -300, 0xd04040);
    mk(-1750, -300, 0x4060d0);
  },

  /* ---------- 交通灯 ---------- */
  trafficLights(L){
    const mk = (x, z, ry)=>{
      const grp = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.2, 0.3), W.mats.dark);
      pole.position.y = 2.6;
      grp.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.0, 0.7), W.mats.black);
      head.position.y = 5.2;
      grp.add(head);
      const colors = [0xd03030, 0xd8b020, 0x30c040];
      colors.forEach((c, i)=>{
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), new THREE.MeshBasicMaterial({color:c}));
        lamp.position.set(0, 5.85 - i*0.6, 0);
        grp.add(lamp);
      });
      grp.position.set(x, 0, z);
      grp.rotation.y = ry;
      G.scene.add(grp);
      const body = new CANNON.Body({mass:0, shape:new CANNON.Box(new CANNON.Vec3(0.4, 3, 0.4))});
      body.position.set(x, 3, z);
      body.collisionFilterGroup = 1; body.collisionFilterMask = -1;
      const seg = {
        kind:"prop", mesh:grp, body,
        hp:SU.hp("prop")*0.8, maxHp:SU.hp("prop")*0.8, value:SU.val("prop")*0.6,
        color:0x3a3a42, size:1.2, dead:false, floor:0, building:null,
        onDestroyed:(s,p)=>W.spawnDebris(p, 0.5, 0x3a3a42, new THREE.Vector3(0,1,0), 2),
      };
      W.addSeg(seg);
    };
    mk(1492, 16, 0); mk(1508, 48, Math.PI); mk(-1742, 16, 0); mk(-1758, 48, Math.PI);
  },

  /* ---------- 路边随机掩体 ---------- */
  roadCovers(L){
    const rnd = (a,b)=>a+Math.random()*(b-a);
    // 主干道两侧（5.4km，随机间距）
    let x = -2580;
    while (x < 2580){
      const side = Math.random() > 0.5 ? 1 : -1;
      const z = side > 0 ? 18 + rnd(-1.5, 0.5) : 47 + rnd(-0.5, 1.5);
      this.coverCluster(x + rnd(-6, 6), z, rnd(0, Math.PI));
      x += rnd(110, 210);
    }
    // 北侧支路两侧
    let z2 = -2250;
    while (z2 < -120){
      const side = Math.random() > 0.5 ? 1 : -1;
      this.coverCluster(side*19 + rnd(-2, 2), z2 + rnd(-8, 8), Math.PI/2 + rnd(-0.4, 0.4));
      z2 += rnd(160, 280);
    }
    // 校门口
    this.coverCluster(1500, 9, 0);
    this.coverCluster(-1750, 9, 0);
    this.coverCluster(0, 60, 0);
  },
  coverCluster(x, z, ry){
    const rnd = (a,b)=>a+Math.random()*(b-a);
    const n = 2 + Math.floor(Math.random()*3);
    for (let i=0;i<n;i++){
      const kind = Math.floor(Math.random()*4);
      const ox = x + rnd(-2.4, 2.4), oz = z + rnd(-0.8, 0.8);
      const ry2 = ry + rnd(-0.35, 0.35);
      if (kind === 0){
        // 水泥隔离墩
        SU.boxSeg("cover", ox, 0.55, oz, 3.2, 1.1, 0.55, W.mats.concrete, {euler:{y:ry2}});
      } else if (kind === 1){
        // 沙袋堆
        SU.boxSeg("cover", ox-0.45, 0.3, oz, 0.7, 0.6, 0.7, W.mats.green, {euler:{y:ry2}});
        SU.boxSeg("cover", ox+0.45, 0.3, oz, 0.7, 0.6, 0.7, W.mats.green, {euler:{y:ry2}});
        SU.boxSeg("cover", ox, 0.85, oz, 0.7, 0.6, 0.7, W.mats.green, {euler:{y:ry2}});
      } else if (kind === 2){
        // 混凝土块
        SU.boxSeg("cover", ox, 0.65, oz, 1.3, 1.3, 1.3, W.mats.concrete, {euler:{y:ry2}});
      } else {
        // 木箱堆
        SU.boxSeg("cover", ox, 0.5, oz, 1.0, 1.0, 1.0, W.mats.wood, {euler:{y:ry2}});
        SU.boxSeg("cover", ox+0.6, 0.5, oz+0.4, 1.0, 1.0, 1.0, W.mats.wood, {euler:{y:ry2}});
      }
    }
  },

  /* ---------- 路牌 ---------- */
  signTexture(text, bgColor, textColor){
    const c = document.createElement("canvas");
    c.width = 512; c.height = 160;
    const ctx = c.getContext("2d");
    ctx.fillStyle = bgColor || "#1a5a8a";
    ctx.fillRect(0,0,512,160);
    ctx.strokeStyle = "#e8e8e0";
    ctx.lineWidth = 10;
    ctx.strokeRect(8,8,496,144);
    ctx.fillStyle = textColor || "#ffffff";
    ctx.font = "bold 88px 'Microsoft YaHei', sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text || "", 256, 82);
    return new THREE.CanvasTexture(c);
  },
  warnTexture(){
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#e8c830";
    ctx.fillRect(0,0,256,256);
    ctx.strokeStyle = "#202020";
    ctx.lineWidth = 14;
    ctx.strokeRect(12,12,232,232);
    ctx.fillStyle = "#202020";
    ctx.font = "bold 150px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("!", 128, 140);
    return new THREE.CanvasTexture(c);
  },
  roadSigns(L){
    // 指路牌（仅字母代号，无任何地名）
    this.sign(0, 15, 0, "→ M校    D校 ←", "#1a5a8a");
    this.sign(1500, 15, 0, "M校 ↑", "#1a5a8a");
    this.sign(-1750, 15, 0, "↑ D校", "#1a5a8a");
    this.sign(2620, 15, Math.PI, "撤离点 →", "#1a6a3a");
    this.sign(-2620, 15, 0, "← 撤离点", "#1a6a3a");
    this.sign(0, -60, 0, "↑ 撤离点", "#1a6a3a");
    // 沿途警示牌
    let x = -2400;
    const rnd = (a,b)=>a+Math.random()*(b-a);
    while (x < 2400){
      this.warnSign(x + rnd(-20,20), 12, Math.random() > 0.5 ? 0 : Math.PI);
      x += rnd(450, 800);
    }
  },
  sign(x, z, ry, text, bg){
    const grp = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 3.6, 6), W.mats.steel);
    pole.position.y = 1.8;
    grp.add(pole);
    const board = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.1, 0.1), W.mats.dark);
    board.position.y = 3.3;
    grp.add(board);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.1),
      new THREE.MeshLambertMaterial({map:this.signTexture(text, bg), transparent:false}));
    face.position.set(0, 3.3, 0.08);
    grp.add(face);
    grp.position.set(x, 0, z);
    grp.rotation.y = ry;
    G.scene.add(grp);
    const body = new CANNON.Body({mass:0, shape:new CANNON.Box(new CANNON.Vec3(0.5, 2.0, 0.5))});
    body.position.set(x, 2, z);
    body.collisionFilterGroup = 1; body.collisionFilterMask = -1;
    const seg = {
      kind:"sign", mesh:grp, body,
      hp:SU.hp("sign"), maxHp:SU.hp("sign"), value:SU.val("sign"),
      color:0x7a8290, size:1.8, dead:false, floor:0, building:null,
      onDestroyed:(s,p)=>W.spawnDebris(p, 0.5, 0x7a8290, new THREE.Vector3(0,1,0), 3),
    };
    W.addSeg(seg);
  },
  warnSign(x, z, ry){
    const grp = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.8, 6), W.mats.steel);
    pole.position.y = 1.4;
    grp.add(pole);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 0.08), W.mats.dark);
    board.position.y = 2.9;
    grp.add(board);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1),
      new THREE.MeshLambertMaterial({map:this.warnTexture()}));
    face.position.set(0, 2.9, 0.06);
    grp.add(face);
    grp.position.set(x, 0, z);
    grp.rotation.y = ry;
    G.scene.add(grp);
    const body = new CANNON.Body({mass:0, shape:new CANNON.Box(new CANNON.Vec3(0.4, 1.6, 0.4))});
    body.position.set(x, 1.6, z);
    body.collisionFilterGroup = 1; body.collisionFilterMask = -1;
    const seg = {
      kind:"sign", mesh:grp, body,
      hp:SU.hp("sign"), maxHp:SU.hp("sign"), value:SU.val("sign"),
      color:0xe8c830, size:1.2, dead:false, floor:0, building:null,
      onDestroyed:(s,p)=>W.spawnDebris(p, 0.4, 0xe8c830, new THREE.Vector3(0,1,0), 2),
    };
    W.addSeg(seg);
  },

  /* ---------- 路边平房（掩体） ---------- */
  roadHouses(L){
    const rnd = (a,b)=>a+Math.random()*(b-a);
    let x = -2550;
    while (x < 2550){
      const side = Math.random() > 0.5 ? 1 : -1;
      const z = side > 0 ? rnd(0.5, 6) : rnd(58, 63.5);
      this.house(x + rnd(-6, 6), z, side > 0 ? 0 : Math.PI);
      x += rnd(260, 420);
    }
    let z2 = -2200;
    while (z2 < -150){
      const side = Math.random() > 0.5 ? 1 : -1;
      this.house(side*rnd(18, 26), z2 + rnd(-8, 8), side > 0 ? -Math.PI/2 : Math.PI/2);
      z2 += rnd(300, 520);
    }
  },
  house(x, z, ry){
    const w = 8 + Math.random()*5, d = 6 + Math.random()*3, h = 3.4;
    const grp = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({color: 0xc8b898});
    const box = new THREE.Mesh(W.geos.box, mat);
    box.scale.set(w, h, d);
    box.position.y = h/2;
    box.castShadow = false; box.receiveShadow = true;
    grp.add(box);
    // 斜屋顶
    const roof = new THREE.Mesh(W.geos.box, W.mats.roof);
    roof.scale.set(w+0.6, 0.9, d+0.6);
    roof.position.y = h + 0.4;
    roof.castShadow = false; roof.receiveShadow = true;
    grp.add(roof);
    // 门（正面）
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.1, 0.12), W.mats.door);
    door.position.set(0, 1.05, d/2 + 0.06);
    grp.add(door);
    // 窗×2
    for (const sx of [-w/4, w/4]){
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 0.1), W.mats.glass);
      win.position.set(sx, 2.0, d/2 + 0.05);
      grp.add(win);
    }
    grp.position.set(x, 0, z);
    grp.rotation.y = ry;
    G.scene.add(grp);
    const bw = Math.abs(Math.cos(ry)) > 0.5 ? w : d;
    const bd = Math.abs(Math.cos(ry)) > 0.5 ? d : w;
    const body = new CANNON.Body({mass:0, shape:new CANNON.Box(new CANNON.Vec3(bw/2, (h+0.9)/2, bd/2))});
    body.position.set(x, (h+0.9)/2, z);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), ry);
    body.collisionFilterGroup = 1; body.collisionFilterMask = -1;
    const seg = {
      kind:"house", mesh:grp, body,
      hp:SU.hp("house"), maxHp:SU.hp("house"), value:SU.val("house"),
      color:0xc8b898, size:(w+d+h)/3, dead:false, floor:0, building:null,
      onDestroyed:(s,p)=>{
        FX.shake(0.6);
        FX.burst(p, 0x8a8578, 8, 4, 0.8);
        W.spawnDebris(p, 0.8, 0x9a948a, new THREE.Vector3(0,1,0), 4);
      },
    };
    W.addSeg(seg);
  },
};
