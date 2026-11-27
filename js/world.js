/* ============================================================
 * 世界核心 —— 场景/物理/可破坏物/爆炸/残骸
 *
 * 碰撞分组:
 *  group 1: 静态(建筑/地面/道具) 与 残骸(动态但掩体类)
 *  group 2: 玩家            group 4: 怪物
 *  group 8: 载具(运动学)    group 16: 弹体
 * ============================================================ */
"use strict";
const G = window.G = {
  scene:null, camera:null, renderer:null, world:null, clock:null,
  state:"boot", paused:false, diff:5,
  run:null, player:null, time:0, camShake:0,
  sun:null, sunTarget:null,
};

const W = window.W = {
  segs: [],            // 全部可破坏段
  blockers: [],        // 非物理的子弹阻挡物(实例化课桌等)
  debris: [],          // 物理残骸
  fires: [],           // 燃烧对象
  _boomQueue: [],      // 大爆炸延迟队列（防连锁递归闪退）
  _boomDepth: 0,
  _bigExplosion: 0,
  spatial: null,
  debrisCount: 0,
  _ray: null,
  bedrock: null,
  mats: {},            // 共享材质
  geos: {},            // 共享几何
  lakes: [],           // 湖面网格
  waters: [],          // 水面数据（射线水花用）

  init(){
    const scene = G.scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x151823, 700, 2600);
    G.skyColor = new THREE.Color(0x2a2e3e);
    scene.background = G.skyColor;

    const camera = G.camera = new THREE.PerspectiveCamera(72, innerWidth/innerHeight, 0.1, 4000);
    camera.rotation.order = "YXZ";

    const renderer = G.renderer = new THREE.WebGLRenderer({canvas:document.getElementById("c3d"), antialias:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // 画质提升：ACES 色调映射 + sRGB 输出 + 物理感光照
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputEncoding = THREE.sRGBEncoding;

    // 天空渐变穹顶（天顶→地平线，随昼夜变化）
    const skyGeo = new THREE.SphereGeometry(2600, 20, 14);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top:    { value: new THREE.Color(0x4a72a8) },
        mid:    { value: new THREE.Color(0x9ab4c8) },
        horizon:{ value: new THREE.Color(0xd8ccb0) },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y, -1.0, 1.0);
          vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.55)) : mix(mid, horizon, clamp(-h*2.0,0.0,1.0));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const sky = G.sky = new THREE.Mesh(skyGeo, skyMat);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    scene.add(sky);
    G.skyUniforms = skyMat.uniforms;

    // 光照
    const hemi = new THREE.HemisphereLight(0x9fb2d8, 0x3a3228, 0.75);
    scene.add(hemi);
    const amb = new THREE.AmbientLight(0x33405a, 0.9);
    scene.add(amb);
    const sun = G.sun = new THREE.DirectionalLight(0xffe0b0, 1.15);
    sun.position.set(140, 180, 60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90;
    sc.near = 20; sc.far = 500;
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    const st = G.sunTarget = new THREE.Object3D();
    scene.add(st);
    sun.target = st;
    G.hemi = hemi; G.amb = amb;
    // 昼夜：手动选择或按系统时间自动
    try{ G.todMode = localStorage.getItem("xinglan-tod") || "auto"; }catch(e){ G.todMode = "auto"; }
    this.applyTimeOfDay();

    // 物理世界
    const world = G.world = new CANNON.World();
    world.gravity.set(0, CFG.GRAVITY, 0);
    // cannon 0.6.2 的 GridBroadphase 依赖旧API body.shape，补别名
    if (!CANNON.Body.prototype.__shapeAlias){
      Object.defineProperty(CANNON.Body.prototype, "shape", {
        get(){ return this.shapes[0]; },
        set(v){ if (v) this.addShape(v); },
        configurable:true,
      });
      CANNON.Body.prototype.__shapeAlias = true;
    }
    // 网格宽阶段：超大世界按 ~60m 网格分桶配对（SAP 在 1.7 万刚体下退化）
    world.broadphase = new CANNON.GridBroadphase(
      new CANNON.Vec3(-2800, -120, -2450),
      new CANNON.Vec3(2800, 200, 450),
      90, 3, 47
    );
    // 去重逻辑在大配对量下字符串键爆炸，改为跳过（重复接触由求解器消化）
    world.broadphase.makePairsUnique = function(){};
    world.solver.iterations = 10;
    // 防御：过滤延迟删除队列导致的残留配对（undefined 刚体）
    const _np = world.narrowphase;
    const _origGC = _np.getContacts.bind(_np);
    _np.getContacts = function(biArr, bjArr, w, contactPairs, cpPool, feArr, fePool){
      if (!biArr || !bjArr) return 0;
      for (let k=biArr.length-1;k>=0;k--) if (!biArr[k] || !biArr[k].shapes) biArr.splice(k,1), bjArr.splice(k,1);
      if (biArr.length === 0) return 0;
      return _origGC(biArr, bjArr, w, contactPairs, cpPool, feArr, fePool);
    };
    // 大量刚体时禁用 O(N²) 碰撞矩阵（碰撞事件改为每步触发；处理器均有 dead 保护）
    for (const cm of [world.collisionMatrix, world.collisionMatrixPrevious]){
      cm.setNumObjects = function(){};
      cm.set = function(){};
      cm.get = function(){ return undefined; };
    }
    // 步进中移除刚体的安全队列（避免内部迭代崩溃）
    W._rmQ = [];
    const _origRemove = world.removeBody.bind(world);
    world.removeBody = (b)=>{
      if (G.__stepping){
        if (W._rmQ.indexOf(b) < 0) W._rmQ.push(b);
        return;
      }
      _origRemove(b);
    };
    W._flushRm = ()=>{ for (const b of W._rmQ) _origRemove(b); W._rmQ.length = 0; };
    const cm = world.defaultContactMaterial;
    cm.friction = 0.3; cm.restitution = 0.25;
    world.defaultContactMaterial.contactEquationStiffness = 1e7;
    world.defaultContactMaterial.contactEquationRelaxation = 4;

    // 基岩(防跌落)
    const rock = new CANNON.Body({mass:0, shape:new CANNON.Box(new CANNON.Vec3(400,0.5,400))});
    rock.position.set(0, -4, 0);
    rock.aabbNeedsUpdate = true;
    rock.collisionFilterGroup = 1; rock.collisionFilterMask = 62;
    world.addBody(rock);
    this.bedrock = rock;

    this._ray = new THREE.Raycaster();
    this._ray.far = 500;

    // 共享材质/几何
    const M = this.mats = {};
    M.wall = new THREE.MeshLambertMaterial({color:0xe8e2d2});
    M.brick = new THREE.MeshLambertMaterial({color:0xa05846});
    M.glass = new THREE.MeshLambertMaterial({color:0x9fc4d8, transparent:true, opacity:0.35});
    M.silver = new THREE.MeshLambertMaterial({color:0xb8bcc2});
    M.roof = new THREE.MeshLambertMaterial({color:0x5c5c66});
    M.floor = new THREE.MeshLambertMaterial({color:0x8b8b93});
    M.concrete = new THREE.MeshLambertMaterial({color:0x9a9a98});
    M.grass = new THREE.MeshLambertMaterial({color:0x4d7a3a});
    M.path = new THREE.MeshLambertMaterial({color:0xb8b2a4});
    M.road = new THREE.MeshLambertMaterial({color:0x3a3a40});
    M.sidewalk = new THREE.MeshLambertMaterial({color:0x8f8a80});
    M.plaza = new THREE.MeshLambertMaterial({color:0xc4c0b2});
    M.field = new THREE.MeshLambertMaterial({color:0x3f8f4f});
    M.track = new THREE.MeshLambertMaterial({color:0xb0553a});
    M.court = new THREE.MeshLambertMaterial({color:0x4a7ab8});
    M.lake = new THREE.MeshLambertMaterial({color:0x2a5a7a, transparent:true, opacity:0.8});
    M.wood = new THREE.MeshLambertMaterial({color:0x9a6a3a});
    M.dark = new THREE.MeshLambertMaterial({color:0x3a3a42});
    M.light = new THREE.MeshLambertMaterial({color:0xd8d8d0});
    M.door = new THREE.MeshLambertMaterial({color:0x6a4a2a});
    M.black = new THREE.MeshLambertMaterial({color:0x151a20});
    M.cream = new THREE.MeshLambertMaterial({color:0xeee6c8});
    M.blue = new THREE.MeshLambertMaterial({color:0x3a6ea8});
    M.green = new THREE.MeshLambertMaterial({color:0x2e7a3a});
    M.red = new THREE.MeshLambertMaterial({color:0x9a3030});
    M.trunk = new THREE.MeshLambertMaterial({color:0x6a4a30});
    M.canopy = new THREE.MeshLambertMaterial({color:0x3a6a30});
    M.steel = new THREE.MeshLambertMaterial({color:0x7a8290});
    M.stone = new THREE.MeshLambertMaterial({color:0x9a948a});
    const geo = this.geos = {};
    geo.box = new THREE.BoxGeometry(1,1,1);
    geo.cyl = new THREE.CylinderGeometry(0.5,0.5,1,8);
    geo.cone = new THREE.ConeGeometry(0.5,1,7);
    geo.sphere = new THREE.SphereGeometry(0.5,8,6);
    geo.torus = new THREE.TorusGeometry(0.5,0.06,6,16);
    geo.plane = new THREE.PlaneGeometry(1,1);
    this._sharedGeo = new Set(Object.values(geo).map(g=>g.uuid));
  },

  reset(){
    // 清空全部
    for (const s of this.segs){
      if (s.body) G.world.removeBody(s.body);
      if (s.mesh){ s.mesh.parent && s.mesh.parent.remove(s.mesh); }
    }
    this.segs = []; this.blockers = [];
    for (const d of this.debris){
      if (d.body) G.world.removeBody(d.body);
      if (d.mesh){ d.mesh.parent && d.mesh.parent.remove(d.mesh); }
    }
    this.debris = []; this.debrisCount = 0;
    this.fires = [];
    this.lakes = [];
    this.waters = [];
    this.spatial = new Spatial(8);
    // 清理场景中残留（保留相机/太阳/FX粒子池）
    for (let i=G.scene.children.length-1;i>=0;i--){
      const c = G.scene.children[i];
      if (c === G.camera || c === G.sun || c === G.sunTarget || c === G.sky) continue;
      if (c.userData && c.userData.maxLife !== undefined) continue; // FX 池
      G.scene.remove(c);
      if (c.geometry && !this._sharedGeo.has(c.geometry.uuid)){
        try{c.geometry.dispose();}catch(e){}
      }
      if (c.material && c.material.map && c.material.map.isCanvasTexture){
        // 保留引用即可
      }
      if (c.traverse) c.traverse(o=>{
        if (o!==c && o.geometry && !this._sharedGeo.has(o.geometry.uuid)){ try{o.geometry.dispose();}catch(e){} }
      });
    }
    // 移除物理体中非基岩
    const bodies = G.world.bodies.slice();
    for (const b of bodies){
      if (b === this.bedrock) continue;
      G.world.removeBody(b);
    }
    FX.reset();
  },

  _disposeMesh(m){
    if (m.geometry && this.geos && Object.values(this.geos).indexOf(m.geometry)<0){
      // 共享几何由 geos 管理，不释放；实例化/独立几何释放
      if (!m.geometry.__shared) try{m.geometry.dispose();}catch(e){}
    }
  },

  /* ---------- 注册可破坏段 ---------- */
  addSeg(seg){
    seg.id = this.segs.length;
    this.segs.push(seg);
    if (seg.body){
      seg.body.userData = {seg:seg};
      seg.body.aabbNeedsUpdate = true; // 位置可能晚于构造，强制刷新AABB
      if (!seg.dynamic){
        // 静态体彼此不产生接触对（大幅降低物理计算量）
        seg.body.collisionFilterGroup = 1;
        seg.body.collisionFilterMask = 62; // 与除静态外的一切碰撞
      }
      G.world.addBody(seg.body);
      if (seg.body.type !== CANNON.Body.STATIC) this.spatial.move(seg, seg.mesh.position);
    } else {
      // 非物理：加入 blockers
      this.blockers.push(seg.mesh);
    }
    this.spatial.add(seg);
    return seg;
  },
  addBlockerMesh(mesh, ref){
    mesh.userData.ref = ref;
    this.blockers.push(mesh);
    return mesh;
  },

  /* ---------- 伤害 ---------- */
  damageSeg(seg, dmg, point, dir, src){
    if (!seg || seg.dead) return;
    seg.hp -= dmg;
    if (seg.hp <= 0) this.destroySeg(seg, point, dir, src, -seg.hp);
  },
  destroySeg(seg, point, dir, src, over){
    if (!seg || seg.dead) return;
    seg.dead = true;
    over = over || 0;
    const p = point ? point.clone() : seg.mesh.position.clone();
    const d = dir ? dir.clone() : new THREE.Vector3(0,1,0);

    if (seg.kind === "glass"){
      this.glassShatter(p, seg);
    } else if (seg.kind !== "debris" && seg.value > 0){
      Eco.addDamage(seg.value);
      // 按伤害大小决定碎裂数量/尺寸/速度（伤害越大碎得越碎、飞得越远）
      const baseN = seg.kind === "tile" || seg.kind === "fieldtile" ? 4 : Math.max(2, Math.min(6, Math.round(seg.size*4)));
      const extra = Math.min(10, Math.round(over/120));
      // 大爆炸中减少碎片，防止连锁爆炸卡顿/闪退
      const n = this._bigExplosion > 0 ? Math.min(2, baseN + extra) : baseN + extra;
      const spd = Math.min(14, 4.5 + over*0.012);
      const sizeMul = Math.max(0.55, 1 - over*0.0006);
      this.spawnDebris(p, (seg.size||0.6)*sizeMul, seg.color, d, n, spd);
    }
    // 残骸被打烂 → 更小残骸 + 地面粉末印记
    if (seg.kind === "debris"){
      const s = seg.size;
      if (s > 0.45){
        const n = s > 1.4 ? 5 : 3; // 大碎片碎成更多小碎片
        this.spawnDebris(p, s*0.4, seg.color, d, n);
        const gy = this.groundY(p.x, p.z, p.y + 30);
        this.scorch(new THREE.Vector3(p.x, gy, p.z), Math.min(2.5, s*0.9), 0x3a3a38, 0.38);
      }
    }
    this._removeSeg(seg);
    if (seg.onDestroyed) seg.onDestroyed(seg, p);
    if (seg.building) Buildings.onSegDestroyed(seg); // 结构失稳检测（坍塌）
  },
  _removeSeg(seg){
    if (seg.body) G.world.removeBody(seg.body);
    if (seg.mesh){
      seg.mesh.parent && seg.mesh.parent.remove(seg.mesh);
      if (seg.mesh.geometry && !seg.mesh.geometry.__shared) try{seg.mesh.geometry.dispose();}catch(e){}
    }
    this.spatial.remove(seg);
    if (!seg.body){
      const i = this.blockers.indexOf(seg.mesh);
      if (i>=0) this.blockers.splice(i,1);
    }
    const i2 = this.segs.indexOf(seg);
    if (i2>=0) this.segs.splice(i2,1);
  },

  /* ---------- 残骸 ---------- */
  spawnDebris(pos, size, color, dir, count, spd){
    count = count || 2;
    spd = spd || 4;
    for (let i=0;i<count;i++){
      if (this.debrisCount >= CFG.DEBRIS_CAP){
        this.recycleDebris();
        if (this.debrisCount >= CFG.DEBRIS_CAP) return;
      }
      const s = size*(0.45+Math.random()*0.55);
      const mat = new THREE.MeshLambertMaterial({color: color || 0x8a8a88});
      const mesh = new THREE.Mesh(this.geos.box, mat);
      const sx = s, sy = s*0.6, sz = s;
      mesh.scale.set(sx,sy,sz);
      mesh.position.copy(pos);
      mesh.position.y += sy*0.4;
      mesh.rotation.set(Math.random()*3, Math.random()*3, Math.random()*3);
      mesh.castShadow = false; mesh.receiveShadow = false;
      G.scene.add(mesh);
      const mass = sx*sy*sz*1400;
      const body = new CANNON.Body({
        mass: Math.min(mass, 900),
        shape: new CANNON.Box(new CANNON.Vec3(sx/2, sy/2, sz/2)),
        material: null,
      });
      body.position.set(mesh.position.x, mesh.position.y, mesh.position.z);
      body.quaternion.set(mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w);
      body.aabbNeedsUpdate = true;
      const vx = (Math.random()-0.5)*spd, vz = (Math.random()-0.5)*spd;
      const vy = spd*0.4 + Math.random()*spd*0.5;
      const dx = (dir ? dir.x : 0) * 0.6 + (Math.random()-0.5);
      const dz = (dir ? dir.z : 0) * 0.6 + (Math.random()-0.5);
      body.velocity.set(vx + dx*spd*0.5, vy, vz + dz*spd*0.5);
      body.angularVelocity.set(Math.random()*6, Math.random()*6, Math.random()*6);
      body.allowSleep = true;
      body.sleepSpeedLimit = 0.6; body.sleepTimeLimit = 0.35;
      // 空气阻力：碎片快速沉降落地，不在天上飘太久
      body.linearDamping = 0.12; body.angularDamping = 0.6;
      body.collisionFilterGroup = 32; body.collisionFilterMask = -1;
      const seg = { kind:"debris", mesh, body, hp: CFG.SEG.debris.hp, value:0, size:s, color:color||0x8a8a88, dead:false, dynamic:true, onDestroyed:null };
      body.userData = {seg:seg};
      G.world.addBody(body);
      this.debris.push(seg);
      this.debrisCount++;
      this.spatial.move(seg, mesh.position);
    }
  },
  recycleDebris(){
    const d = this.debris[0];
    if (!d) return;
    this.debris.splice(0,1);
    this.debrisCount--;
    if (d.body) G.world.removeBody(d.body);
    if (d.mesh){ d.mesh.parent && d.mesh.parent.remove(d.mesh); try{d.mesh.material.dispose();}catch(e){} }
    this.spatial.remove(d);
  },

  glassShatter(p, seg){
    FX.burst(p, 0xbfe0f0, 10, 4, 0.6);
    Audio.hit();
  },

  /* ---------- 残骸同步（网格跟随刚体 + 空间索引更新） ---------- */
  updateDebris(dt){
    for (const d of this.debris){
      if (d.dead || !d.body) continue;
      d.mesh.position.set(d.body.position.x, d.body.position.y, d.body.position.z);
      d.mesh.quaternion.set(d.body.quaternion.x, d.body.quaternion.y, d.body.quaternion.z, d.body.quaternion.w);
      d._syncT = (d._syncT||0) - dt;
      if (d._syncT <= 0){
        d._syncT = 1.0;
        this.spatial.move(d, d.mesh.position);
      }
    }
  },

  /* ---------- 爆炸 ---------- */
  explosion(pos, radius, dmg, impulse, fromPlayer){
    impulse = impulse || dmg*0.9;
    // 视觉
    FX.fireball(pos, radius);
    FX.shake(Math.min(1.4, radius*0.06));
    Audio.explosion(radius > 9);
    // 重型武器在地下留下大型弹坑
    if (dmg >= 800){
      const gy = this.groundY(pos.x, pos.z, pos.y + 40);
      this.crater(new THREE.Vector3(pos.x, gy, pos.z), Math.min(14, radius*0.85));
    }
    // 空间查询
    const hits = this.spatial.queryCircle(pos.x, pos.z, radius + 2);
    for (const s of hits){
      const mp = s.pos || s.mesh.position;
      const d = Math.sqrt((mp.x-pos.x)**2 + (mp.y-pos.y)**2 + (mp.z-pos.z)**2);
      if (d > radius) continue;
      const f = 1 - d/radius;
      const eff = dmg * f * (s.kind==="glass" ? 4 : 1);
      if (this.flammable(s)){
        this.ignite(s);
        // 可燃物（树木/草地/房屋/车辆/油罐）也受直接伤害，可被正常攻击破坏
        if (s.isPropEntry) SU.damageProp(s, eff, mp, mp.clone().sub(pos).normalize());
        else this.damageSeg(s, eff, mp);
        continue;
      }
      if (s.isPropEntry){
        SU.damageProp(s, eff, mp, mp.clone().sub(pos).normalize());
        continue;
      }
      if (s.isPortal){
        Portals.hit(s, eff, mp);
        continue;
      }
      if (s.npc || s.vehicle) continue; // 怪物/载具由下方列表处理
      if (s.kind === "debris" || s.dynamic){
        if (s.body){
          const dir = mp.clone().sub(pos).normalize();
          s.body.applyImpulse(
            new CANNON.Vec3(dir.x, dir.y, dir.z).scale(impulse*f*Math.min(s.body.mass,300)),
            new CANNON.Vec3(mp.x, mp.y, mp.z)
          );
          if (eff > 20) this.damageSeg(s, eff, mp, dir);
        }
      } else {
        this.damageSeg(s, eff, mp);
      }
    }
    // NPC
    for (const n of NPCs.list.slice()){
      const d = n.pos.distanceTo(pos);
      if (d > radius) continue;
      const f = 1 - d/radius;
      NPCs.damage(n, dmg*f, pos, "explosion");
    }
    // 玩家
    if (G.player && !G.player.dead){
      const pp = G.player.pos;
      const d = pp.distanceTo(pos);
      if (d < radius*0.85){
        const f = 1 - d/radius;
        G.player.damage(dmg*f*0.3, "爆炸");
      }
    }
    // 载具
    for (const v of Vehicles.list){
      if (v.dead) continue;
      const d = v.pos.distanceTo(pos);
      if (d < radius){
        const f = 1 - d/radius;
        Vehicles.damage(v, dmg*f, pos);
      }
    }
  },

  /* 大型爆炸（油罐/气罐/核弹）：爆炸 + 冲击波(更大半径杀伤) + 强震屏 */
  bigExplosion(pos, radius, dmg, impulse){
    this._boomQueue.push({ pos: pos.clone(), radius, dmg, impulse });
    if (this._boomDepth > 0) return; // 已在处理队列中
    this._boomDepth++;
    let guard = 0;
    while (this._boomQueue.length && guard++ < 40){
      const b = this._boomQueue.shift();
      this._doBoom(b.pos, b.radius, b.dmg, b.impulse);
    }
    this._boomQueue.length = 0;
    this._boomDepth--;
  },
  _doBoom(pos, radius, dmg, impulse){
    this._bigExplosion++;
    try{
      // 无条件抹去半径50米内一切场景物品
      const wipe = this.spatial.queryCircle(pos.x, pos.z, 50);
      for (const s of wipe){
        const mp = s.pos || s.mesh.position;
        const d2 = Math.hypot(mp.x-pos.x, mp.z-pos.z);
        if (d2 > 50) continue;
        if (s.isPropEntry) SU.damageProp(s, 1e9, mp, new THREE.Vector3(0,1,0));
        else if (!s.npc && !s.vehicle && !s.isPortal && s.kind !== "debris") this.damageSeg(s, 1e9, mp);
      }
      this.explosion(pos, radius, dmg, impulse, true);
      this.shockwaveDamage(pos, radius, dmg, impulse);
    } finally {
      this._bigExplosion--;
    }
    FX.shockwave(pos, radius*1.8);
    FX.shake(2.4);
    Audio.explosion(true);
  },
  /* 冲击波：在主爆炸半径之外，以更大半径造成递减杀伤 + 击飞 */
  shockwaveDamage(pos, radius, dmg, impulse){
    const outer = radius * 1.8;
    const hits = this.spatial.queryCircle(pos.x, pos.z, outer + 2);
    for (const s of hits){
      const mp = s.pos || s.mesh.position;
      const d = Math.sqrt((mp.x-pos.x)**2 + (mp.y-pos.y)**2 + (mp.z-pos.z)**2);
      if (d <= radius || d > outer) continue; // 只影响主爆炸之外的环区
      const f = 1 - (d - radius) / (outer - radius);
      const eff = dmg * 0.6 * f;
      if (s.isPropEntry){
        SU.damageProp(s, eff, mp, mp.clone().sub(pos).normalize());
        continue;
      }
      if (s.isPortal || s.npc || s.vehicle) continue;
      if (s.kind === "debris" || s.dynamic){
        if (s.body){
          const dir = mp.clone().sub(pos).normalize();
          s.body.applyImpulse(new CANNON.Vec3(dir.x, dir.y, dir.z).scale(impulse*0.9*f*Math.min(s.body.mass,300)), new CANNON.Vec3(mp.x, mp.y, mp.z));
          if (eff > 15) this.damageSeg(s, eff, mp, dir);
        }
      } else {
        this.damageSeg(s, eff, mp);
      }
    }
    // NPC（躲在障碍物后大幅减伤）
    for (const n of NPCs.list.slice()){
      const d = n.pos.distanceTo(pos);
      if (d <= radius || d > outer) continue;
      const f = 1 - (d - radius) / (outer - radius);
      let cover = 1;
      if (d < 160){
        cover = this.coverFactor(pos, n.pos, 1);
      }
      NPCs.damage(n, dmg*0.7*f*cover, pos, "冲击波");
    }
    // 玩家（躲在障碍物后大幅减伤）
    if (G.player && !G.player.dead){
      const d = G.player.pos.distanceTo(pos);
      if (d > radius && d < outer){
        const f = 1 - (d - radius) / (outer - radius);
        const cover = this.coverFactor(pos, G.player.pos, 1.7);
        G.player.damage(dmg*0.3*f*cover, "冲击波");
      }
    }
    // 载具
    for (const v of Vehicles.list){
      const d = v.pos.distanceTo(pos);
      if (d > radius && d < outer){
        const f = 1 - (d - radius) / (outer - radius);
        let cover = 1;
        if (d < 160) cover = this.coverFactor(pos, v.pos, 2);
        Vehicles.damage(v, dmg*0.7*f*cover, pos);
      }
    }
  },
  /* 遮挡系数：目标被建筑/掩体挡住时返回0.15（大幅减伤），否则1 */
  coverFactor(pos, target, ty){
    const from = new THREE.Vector3(pos.x, pos.y + 2, pos.z);
    const to = new THREE.Vector3(target.x, target.y + (ty||1), target.z);
    const clear = W.raycastLOS(from, to, {ignoreNpc:true, ignoreProps:true, ignoreVehicle:true, ignorePlayer:true});
    return clear ? 1 : 0.15;
  },

  /* ---------- 防空 / 大阵拦截 ---------- */
  intercept(pos, dmg){
    dmg = dmg || 100;
    // 防空系统（概率拦截远程武器，概率较低）
    for (const t of G.airDefense || []){
      if (t.seg.dead || t.cooldown > 0) continue;
      const d = Math.hypot(pos.x - t.pos.x, pos.z - t.pos.z);
      if (d < t.range && Math.random() < 0.25){
        t.cooldown = 2.5;
        this.interceptBoom(pos);
        Eco.addDamage(Math.round(dmg * 0.5)); // 拦截导弹计入破坏价值
        return true;
      }
    }
    // 防护大阵（矩形覆盖校园，不覆盖围墙外加油站；玩家在大阵内部时其武器不拦截）
    for (const f of G.formations || []){
      if (f.down) continue;
      const inside = pos.x > f.x0 && pos.x < f.x1 && pos.z > f.z0 && pos.z < f.z1;
      if (!inside) continue;
      // 玩家在大阵内部造成的伤害不拦截
      if (G.player && !G.player.dead && G.player.pos.x > f.x0 && G.player.pos.x < f.x1 && G.player.pos.z > f.z0 && G.player.pos.z < f.z1) continue;
      const cost = Math.min(f.maxEnergy, Math.max(30, dmg * 0.06));
      f.energy -= cost;
      this.interceptBoom(pos);
      Eco.addDamage(Math.round(dmg * 0.5));    // 拦截导弹计入破坏价值
      Eco.addDamage(Math.round(cost * 100));   // 大阵能量损失计入破坏价值
      if (f.energy <= 0){
        f.energy = 0;
        if (!f.destroyed){
          f.destroyed = true;
          Eco.addDamage(1000000);              // 大阵摧毁计入破坏价值
          UI.toast("防护大阵被击破！", "danger");
        }
        f.down = true; f.downT = 60;
      }
      return true;
    }
    return false;
  },
  /* 拦截爆炸效果 */
  interceptBoom(pos){
    const pt = new THREE.Vector3(pos.x, Math.max(1, pos.y), pos.z);
    FX.fireball(pt, 5);
    FX.sparks(pt, 0x80d0ff);
    FX.shake(0.35);
    Audio.explosion(false);
  },
  /* 大阵能量恢复 + 防空冷却 + 穹顶视觉 */
  updateDefenses(dt){
    for (const f of G.formations || []){
      if (f.down){
        f.downT -= dt;
        f.dome.material.opacity = 0.04;
        f.dome.material.color.setHex(0x604040);
        if (f.downT <= 0) f.down = false; // 一分钟后开始恢复
      } else if (f.energy < f.maxEnergy){
        f.energy = Math.min(f.maxEnergy, f.energy + f.maxEnergy*0.03*dt); // 缓慢恢复
        f.dome.material.opacity = 0.13;
        f.dome.material.color.setHex(0x40c8e0);
      }
    }
    for (const t of G.airDefense || []){
      if (t.cooldown > 0) t.cooldown -= dt;
    }
  },

  /* ---------- 燃烧系统 ---------- */
  flammable(ref){
    if (!ref || ref.dead) return false;
    if (ref.isPropEntry) return ref.kind === "tree";
    return ref.kind === "house" || ref.kind === "fieldtile" || ref.flammable === true;
  },
  ignite(ref){
    if (!ref || ref.dead || ref._burning) return;
    let dmg = 45, ttl = 5;
    if (ref.isPropEntry){ dmg = 50; ttl = 5; }       // 树木
    else if (ref.kind === "house"){ dmg = 260; ttl = 6; } // 平房
    else if (ref.kind === "fieldtile"){ dmg = 240; ttl = 5; } // 草地（快速烧毁）
    else { dmg = 60; ttl = 6; }                       // 汽车/自行车/电动车
    ref._burning = true;
    const p = ref.isPropEntry ? ref.pos : (ref.pos || ref.mesh.position);
    const size = ref.isPropEntry ? (ref.hitR || ref.size || 1.5) : (ref.size || 2.5);
    // 火光（持续发光精灵，令火势更明显）
    let glow = null;
    if (FX.tex){
      glow = new THREE.Sprite(new THREE.SpriteMaterial({map: FX.tex, color:0xff8030, transparent:true, opacity:0.55, depthWrite:false}));
      glow.scale.setScalar(Math.max(3, size*2.2));
      glow.position.set(p.x, p.y + size*0.3, p.z);
      G.scene.add(glow);
    }
    this.fires.push({ ref, ttl, dmg, lastEmit: 0, explosive: !!ref.explosive, px: p.x, pz: p.z, size, glow });
  },
  burnScorch(f){
    // 燃烧结束：露出烧焦地面
    const gy = this.groundY(f.px, f.pz, 200);
    const r = Math.min(8, Math.max(1.8, f.size * 0.85));
    this.scorch(new THREE.Vector3(f.px, gy, f.pz), r, 0x1a120c, 0.6);
  },
  updateFires(dt){
    for (let i=this.fires.length-1;i>=0;i--){
      const f = this.fires[i];
      f.ttl -= dt;
      f.lastEmit -= dt;
      const ref = f.ref;
      // 燃烧结束（对象烧毁或被移除）→ 留下焦土
      if (!ref || ref.dead){
        this.burnScorch(f);
        if (f.glow){ G.scene.remove(f.glow); f.glow.material.dispose(); }
        if (ref) ref._burning = false;
        this.fires.splice(i,1);
        continue;
      }
      const p = ref.isPropEntry ? ref.pos : (ref.pos || ref.mesh.position);
      // 持续灼烧伤害
      if (ref.isPropEntry) SU.damageProp(ref, f.dmg*dt, p, new THREE.Vector3(0,1,0));
      else W.damageSeg(ref, f.dmg*dt, p, new THREE.Vector3(0,1,0));
      // 火焰 + 黑烟（大物件多高度喷射，更明显）
      if (f.lastEmit <= 0){
        f.lastEmit = 0.08;
        const isTree = ref.isPropEntry && ref.kind === "tree";
        const baseH = ref.isPropEntry ? p.y + 0.5 : (p.y + (ref.mesh && ref.mesh.scale ? ref.mesh.scale.y*0.2 : 1.0));
        const big = isTree || (f.size > 3);
        FX.flame(new THREE.Vector3(p.x + (Math.random()-0.5)*1.0, baseH, p.z + (Math.random()-0.5)*1.0), big);
        if (big){
          FX.flame(new THREE.Vector3(p.x + (Math.random()-0.5)*1.2, baseH + f.size*0.45, p.z + (Math.random()-0.5)*1.2), true);
        }
      }
      // 火光呼吸
      if (f.glow){
        f.glow.position.set(p.x, p.y + f.size*0.3, p.z);
        f.glow.material.opacity = 0.4 + Math.sin(G.time*14 + f.px)*0.18;
      }
      // 火焰蔓延：燃烧物点燃附近可燃物（草地/树木等）
      f.spreadT = (f.spreadT===undefined ? 0 : f.spreadT) - dt;
      if (f.spreadT <= 0){
        f.spreadT = 0.8;
        if (this.fires.length < 400){
          const near = this.spatial.queryCircle(p.x, p.z, 8);
          for (const o of near){
            if (o === ref || o._burning || !this.flammable(o)) continue;
            if (Math.random() < 0.4){
              this.ignite(o);
              if (this.fires.length >= 400) break;
            }
          }
        }
      }
      // 燃尽：爆炸物（汽车/电动车）引爆
      if (f.ttl <= 0){
        if (f.glow){ G.scene.remove(f.glow); f.glow.material.dispose(); }
        ref._burning = false;
        this.fires.splice(i,1);
        if (f.explosive && !ref.dead){
          const pp = ref.isPropEntry ? ref.pos : (ref.pos || ref.mesh.position);
          if (ref.isPropEntry) SU.damageProp(ref, 1e9, pp, new THREE.Vector3(0,1,0));
          else W.damageSeg(ref, 1e9, pp, new THREE.Vector3(0,1,0));
        }
        this.burnScorch(f);
      }
    }
  },

  /* ---------- 地面印记 / 弹坑 ---------- */
  groundY(x, z, yFrom){
    const gy = this.groundHeightStatic(x, z, yFrom);
    return (gy !== undefined && isFinite(gy)) ? gy : 0;
  },
  scorch(pos, r, color, opacity){
    // 粉末/焦土印记（贴地暗色圆盘）
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(r, 16),
      new THREE.MeshBasicMaterial({color: color||0x161310, transparent:true, opacity: opacity===undefined?0.5:opacity, depthWrite:false})
    );
    m.rotation.x = -Math.PI/2;
    m.position.set(pos.x, pos.y + 0.03, pos.z);
    G.scene.add(m);
  },
  crater(pos, r){
    // 大坑：仅在地面（按地形高度）留下焦土变色；范围场景由爆炸移除
    const gy = this.terrainH ? this.terrainH(pos.x, pos.z) : 0;
    const scorch = new THREE.Mesh(
      new THREE.CircleGeometry(r, 26),
      new THREE.MeshBasicMaterial({color:0x120e0a, transparent:true, opacity:0.7, depthWrite:false})
    );
    scorch.rotation.x = -Math.PI/2;
    scorch.position.set(pos.x, gy + 0.06, pos.z);
    G.scene.add(scorch);
  },

  /* ---------- 射线 ----------
   * 网格DDA遍历空间哈希 + 自实现球/盒/柱相交（cannon凸体射线有远面bug）
   * 返回: { seg, prop, npc, vehicle, player, point, normal, dist } */
  raycast(from, to, opts){
    opts = opts||{};
    const res = { seg:null, prop:null, npc:null, vehicle:null, player:false, point:null, normal:null, dist:Infinity };
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 1e-6) return res;
    dir.divideScalar(len);
    // DDA
    const cell = this.spatial.cell;
    let cx = Math.floor(from.x/cell), cz = Math.floor(from.z/cell);
    const sX = dir.x > 0 ? 1 : -1;
    const sZ = dir.z > 0 ? 1 : -1;
    let tMaxX = dir.x !== 0 ? ((sX>0 ? (cx+1)*cell - from.x : from.x - cx*cell) / Math.abs(dir.x)) : Infinity;
    let tMaxZ = dir.z !== 0 ? ((sZ>0 ? (cz+1)*cell - from.z : from.z - cz*cell) / Math.abs(dir.z)) : Infinity;
    const tDeltaX = dir.x !== 0 ? cell/Math.abs(dir.x) : Infinity;
    const tDeltaZ = dir.z !== 0 ? cell/Math.abs(dir.z) : Infinity;
    let curT = 0;
    const seen = new Set();
    let guard = 0;
    const at = (t)=> new THREE.Vector3(from.x+dir.x*t, from.y+dir.y*t, from.z+dir.z*t);
    const hitProp = (ref, t)=>{
      if (t < 0 || t >= res.dist || t > len) return;
      res.dist = t;
      res.prop = ref;
      res.point = at(t);
      res.normal = dir.clone().negate();
      res.seg = null; res.npc = null; res.vehicle = null; res.player = false;
    };
    const hitNpc = (ref, t)=>{
      if (t < 0 || t >= res.dist || t > len) return;
      res.dist = t;
      res.npc = ref;
      res.point = at(t);
      res.normal = dir.clone().negate();
      res.seg = null; res.prop = null; res.vehicle = null; res.player = false;
    };
    while (guard++ < 900 && curT <= len){
      const key = cx + "," + cz;
      if (!seen.has(key)){
        seen.add(key);
        const list = this.spatial.map.get(key);
        if (list){
          for (let i=0;i<list.length;i++){
            const ref = list[i];
            if (ref.dead) continue;
            if (ref.isPropEntry){
              if (opts.ignoreProps) continue;
              const t = raySphereT(from, dir, ref.pos, Math.max(0.2, ref.hitR || ref.size*0.5));
              if (t !== null) hitProp(ref, t);
            } else if (ref.isPortal){
              const t = raySphereT(from, dir, ref.pos, ref.hitR || 2.2);
              if (t !== null) hitProp(ref, t);
            } else if (ref.npc){
              if (!opts.ignoreNpc){
                const c2 = ref.pos;
                const t = raySphereT(from, dir, new THREE.Vector3(c2.x, c2.y, c2.z), ref.def.r + 0.1);
                if (t !== null) hitNpc(ref, t);
              }
            } else if (ref.vehicle){
              if (opts.ignoreVehicle) continue;
              const t = raySphereT(from, dir, ref.pos, Math.max(1.3, (ref.hx||2.5) * 1.15));
              if (t !== null && t < res.dist){
                res.dist = t; res.vehicle = ref; res.point = at(t); res.normal = dir.clone().negate();
                res.seg = null; res.prop = null; res.npc = null; res.player = false;
              }
            } else if (ref.body){
              if (opts.skipSelf && ref.body === opts.skipSelf) continue;
              if (opts.mask !== undefined && !(opts.mask & ref.body.collisionFilterGroup)) continue;
              let t = null;
              const sh = ref.body.shapes[0];
              if (sh){
                if (sh.type === CANNON.Shape.types.SPHERE){
                  t = raySphereT(from, dir, ref.body.position, sh.radius);
                } else if (sh.type === CANNON.Shape.types.CYLINDER){
                  t = rayBoxT(from, dir, ref.body.position,
                    new THREE.Vector3(sh.radiusTop||sh.radiusBottom||0.5, sh.height/2, sh.radiusBottom||sh.radiusTop||0.5),
                    ref.body.quaternion);
                } else {
                  t = rayBoxT(from, dir, ref.body.position, sh.halfExtents, ref.body.quaternion);
                }
              }
              if (t !== null && t < res.dist && t <= len){
                res.dist = t;
                res.point = at(t);
                res.normal = dir.clone().negate();
                const ud = ref.body.userData;
                if (ud && ud.seg){
                  res.seg = ud.seg;
                  res.prop = null; res.npc = null; res.vehicle = null; res.player = false;
                } else if (ud && ud.vehicle){
                  res.vehicle = ud.vehicle;
                  res.seg = null; res.prop = null; res.npc = null; res.player = false;
                } else if (ud && ud.npc){
                  res.npc = ud.npc;
                  res.seg = null; res.prop = null; res.vehicle = null; res.player = false;
                } else if (ud && ud.player){
                  if (!opts.ignorePlayer){
                    res.player = true;
                    res.seg = null; res.prop = null; res.npc = null; res.vehicle = null;
                  }
                }
              }
            }
          }
        }
      }
      if (tMaxX < tMaxZ){ curT = tMaxX; tMaxX += tDeltaX; cx += sX; }
      else { curT = tMaxZ; tMaxZ += tDeltaZ; cz += sZ; }
    }
    // 玩家（显式）
    if (!opts.ignorePlayer && G.player && !G.player.dead){
      const pp = G.player.pos;
      const t = raySphereT(from, dir, new THREE.Vector3(pp.x, pp.y+1.0, pp.z), 0.6);
      if (t !== null && t < res.dist){
        res.dist = t;
        res.player = true;
        res.point = at(t);
        res.normal = dir.clone().negate();
        res.seg = null; res.prop = null; res.npc = null; res.vehicle = null;
      }
    }
    // 水面（椭圆平面）
    for (const w of this.waters){
      if (w.dead) continue;
      if (Math.abs(dir.y) < 1e-5) continue;
      const t = (w.y - from.y)/dir.y;
      if (t <= 0 || t >= res.dist || t > len) continue;
      const p = at(t);
      const ex = (p.x-w.cx)/w.rx, ez = (p.z-w.cz)/w.rz;
      if (ex*ex + ez*ez <= 1.06){
        res.dist = t;
        res.point = p;
        res.normal = new THREE.Vector3(0,1,0);
        res.seg = null; res.npc = null; res.vehicle = null;
        res.prop = w;
      }
    }
    return res;
  },
  raycastLOS(from, to, opts){
    const res = this.raycast(from, to, opts);
    const len = from.distanceTo(to);
    if (!(res.seg || res.prop || res.npc || res.vehicle)) return true;
    if (res.dist >= len - 0.4) return true; // 命中在终点附近=可见
    return false;
  },

  /* ---------- 地面高度(仅静态与残骸) ---------- */
  groundHeight(x, z, yFrom){
    yFrom = yFrom || 300;
    const res = this.raycast(
      new THREE.Vector3(x, yFrom, z),
      new THREE.Vector3(x, -80, z),
      {mask: 1|32, ignoreNpc:true, ignorePlayer:true, ignoreProps:true, ignoreVehicle:true}
    );
    if (res.point) return res.point.y;
    return 0;
  },

  /* ---------- 地面高度(仅静态地形，载具用，避免被残骸垫飞) ---------- */
  groundHeightStatic(x, z, yFrom){
    yFrom = yFrom || 300;
    const res = this.raycast(
      new THREE.Vector3(x, yFrom, z),
      new THREE.Vector3(x, -80, z),
      {mask: 1, ignoreNpc:true, ignorePlayer:true, ignoreProps:true, ignoreVehicle:true}
    );
    if (res.point) return res.point.y;
    return 0;
  },

  /* ---------- 地形高度（校园/道路平坦，野外平滑小山丘，±20m） ---------- */
  flatFactor(x, z){
    const L = CFG.LAYOUT;
    const inside = (x0,z0,x1,z1)=> x>x0 && x<x1 && z>z0 && z<z1;
    const rectDist = (x0,z0,x1,z1)=>{
      const dx = Math.max(x0-x, 0, x-x1);
      const dz = Math.max(z0-z, 0, z-z1);
      return Math.hypot(dx, dz);
    };
    const zones = [
      [L.campusA.x0-40, L.campusA.z0-40, L.campusA.x1+40, L.campusA.z1+40],
      [L.campusB.x0-40, L.campusB.z0-40, L.campusB.x1+40, L.campusB.z1+40],
      [L.roadMain.x0-6, L.roadMain.z0-6, L.roadMain.x1+6, L.roadMain.z1+6],
      [L.roadNorth.x0-6, L.roadNorth.z0-2, L.roadNorth.x1+6, L.roadNorth.z1+2],
    ];
    let minD = 1e9;
    for (const [x0,z0,x1,z1] of zones){
      if (inside(x0,z0,x1,z1)) return 0;
      minD = Math.min(minD, rectDist(x0,z0,x1,z1));
    }
    const lk = L.lake;
    const ex = (x-lk.cx)/lk.rx, ez = (z-lk.cz)/lk.rz;
    if (ex*ex + ez*ez < 1.1) return 0;
    return Math.min(1, minD / 40); // 距平坦区40米内平滑过渡
  },
  terrainH(x, z){
    const raw = Math.sin(x*0.0035)*Math.cos(z*0.0045)*9
      + Math.sin(x*0.010 + 1.3)*Math.cos(z*0.008 + 0.7)*6
      + Math.cos(x*0.0018 + z*0.0026)*5;
    return raw * this.flatFactor(x, z); // 约 ±20m，与道路/校园平滑衔接
  },

  /* ---------- 昼夜（手动选择白天/黑夜/自动） ---------- */
  applyTimeOfDay(){
    const mode = G.todMode || "auto";
    const h = new Date().getHours();
    let isDay;
    if (mode === "day") isDay = true;
    else if (mode === "night") isDay = false;
    else isDay = h >= 6 && h < 18;
    G.isDay = isDay;
    if (isDay){
      G.skyColor.setHex(0x2a2e3e);
      G.scene.fog.color.setHex(0xd8ccb0);
      G.hemi.color.setHex(0xbfd4ec);
      G.hemi.groundColor.setHex(0x3a3228);
      G.hemi.intensity = 0.8;
      G.amb.color.setHex(0x33405a);
      G.amb.intensity = 0.95;
      G.sun.color.setHex(0xffe6c0);
      G.sun.intensity = 1.25;
      if (G.skyUniforms){
        G.skyUniforms.top.value.setHex(0x4a72a8);
        G.skyUniforms.mid.value.setHex(0x9ab4c8);
        G.skyUniforms.horizon.value.setHex(0xd8ccb0);
      }
    } else {
      G.skyColor.setHex(0x0a0d1a);
      G.scene.fog.color.setHex(0x0a0d1a);
      G.hemi.color.setHex(0x4a5a80);
      G.hemi.groundColor.setHex(0x1a1c24);
      G.hemi.intensity = 0.24;
      G.amb.color.setHex(0x2a3550);
      G.amb.intensity = 0.32;
      G.sun.color.setHex(0x8a9ad8);
      G.sun.intensity = 0.4;
      if (G.skyUniforms){
        G.skyUniforms.top.value.setHex(0x0a1224);
        G.skyUniforms.mid.value.setHex(0x1a2440);
        G.skyUniforms.horizon.value.setHex(0x2a3050);
      }
    }
  },

  shake(amt){ G.camShake = Math.min(2.2, Math.max(G.camShake, amt)); },

  registerLake(mesh){
    this.lakes.push(mesh);
    this.waters.push({
      water:true, kind:"water", dead:false,
      y: mesh.position.y,
      cx: mesh.position.x, cz: mesh.position.z,
      rx: mesh.scale.x, rz: mesh.scale.z,
    });
  },
};

/* 射线-球体相交，返回 t 或 null */
function raySphereT(from, dir, center, radius){
  const ox = from.x - center.x, oy = from.y - center.y, oz = from.z - center.z;
  const b = ox*dir.x + oy*dir.y + oz*dir.z;
  const c = ox*ox + oy*oy + oz*oz - radius*radius;
  if (c > 0 && b > 0) return null;
  const disc = b*b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : (c <= 0 ? 0 : null);
}

/* 射线-盒相交（支持旋转），返回 t 或 null */
const _rbTmp = {q:null, v1:null, v2:null};
function rayBoxT(from, dir, center, half, quat){
  if (!half) return null;
  let ox = from.x - center.x, oy = from.y - center.y, oz = from.z - center.z;
  let dx = dir.x, dy = dir.y, dz = dir.z;
  if (quat && (quat.x !== 0 || quat.y !== 0 || quat.z !== 0)){
    if (!_rbTmp.q){ _rbTmp.q = new CANNON.Quaternion(); _rbTmp.v1 = new CANNON.Vec3(); _rbTmp.v2 = new CANNON.Vec3(); }
    const inv = _rbTmp.q;
    inv.set(-quat.x, -quat.y, -quat.z, quat.w); // 单位四元数共轭=逆
    const v1 = _rbTmp.v1.set(ox, oy, oz), v2 = _rbTmp.v2.set(dx, dy, dz);
    inv.vmult(v1, v1);
    inv.vmult(v2, v2);
    ox = v1.x; oy = v1.y; oz = v1.z;
    dx = v2.x; dy = v2.y; dz = v2.z;
  }
  let tmin = 0, tmax = Infinity;
  const hx = half.x, hy = half.y, hz = half.z;
  if (Math.abs(dx) < 1e-8){ if (ox < -hx || ox > hx) return null; }
  else {
    let t1 = (-hx - ox)/dx, t2 = (hx - ox)/dx;
    if (t1 > t2){ const tt = t1; t1 = t2; t2 = tt; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (Math.abs(dy) < 1e-8){ if (oy < -hy || oy > hy) return null; }
  else {
    let t1 = (-hy - oy)/dy, t2 = (hy - oy)/dy;
    if (t1 > t2){ const tt = t1; t1 = t2; t2 = tt; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (Math.abs(dz) < 1e-8){ if (oz < -hz || oz > hz) return null; }
  else {
    let t1 = (-hz - oz)/dz, t2 = (hz - oz)/dz;
    if (t1 > t2){ const tt = t1; t1 = t2; t2 = tt; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (tmin < 0) return tmax >= 0 ? 0 : null;
  return tmin;
}

/* ============================================================
 * 空间哈希
 * ============================================================ */
function Spatial(cell){
  this.cell = cell;
  this.map = new Map();
  this.stamp = 0;
}
Spatial.prototype.key = function(x,z){ return Math.floor(x/this.cell)+","+Math.floor(z/this.cell); };
Spatial.prototype._pos = function(ref){ return ref.pos || ref.mesh.position; };
Spatial.prototype._range = function(ref){
  if (ref.body){
    if (ref.body.aabbNeedsUpdate) ref.body.computeAABB();
    const a = ref.body.aabb;
    const cl = this.cell;
    const x0 = Math.floor(a.lowerBound.x/cl), x1 = Math.floor(a.upperBound.x/cl);
    const z0 = Math.floor(a.lowerBound.z/cl), z1 = Math.floor(a.upperBound.z/cl);
    // 防御超大范围
    if (x1-x0 > 24 || z1-z0 > 24) return null;
    return {x0, x1, z0, z1};
  }
  const p = this._pos(ref);
  const c = this.key(p.x, p.z);
  const m = c.split(",").map(Number);
  return {x0:m[0], x1:m[0], z0:m[1], z1:m[1]};
};
Spatial.prototype.add = function(ref){
  const r = this._range(ref);
  if (!r){ ref._cells = []; return; }
  const cells = [];
  for (let i=r.x0;i<=r.x1;i++){
    for (let j=r.z0;j<=r.z1;j++){
      const k = i+","+j;
      let a = this.map.get(k);
      if (!a){ a = []; this.map.set(k, a); }
      a.push(ref);
      cells.push(k);
    }
  }
  ref._cells = cells;
};
Spatial.prototype.move = function(ref, pos){
  if (ref.body){
    // 刚体尺寸对象：重新按AABB注册
    this.remove(ref);
    this.add(ref);
    return;
  }
  const k = this.key(pos.x, pos.z);
  if (ref._cells && ref._cells.length === 1 && ref._cells[0] === k) return;
  this.remove(ref);
  let a = this.map.get(k);
  if (!a){ a = []; this.map.set(k, a); }
  a.push(ref);
  ref._cells = [k];
};
Spatial.prototype.remove = function(ref){
  const cells = ref._cells;
  if (!cells) return;
  for (const k of cells){
    const a = this.map.get(k);
    if (a){
      const i = a.indexOf(ref);
      if (i>=0) a.splice(i,1);
      if (!a.length) this.map.delete(k);
    }
  }
  ref._cells = null;
};
Spatial.prototype.queryCircle = function(x,z,r){
  const out = [];
  const cl = this.cell;
  const x0 = Math.floor((x-r)/cl), x1 = Math.floor((x+r)/cl);
  const z0 = Math.floor((z-r)/cl), z1 = Math.floor((z+r)/cl);
  const stamp = ++this.stamp;
  for (let i=x0;i<=x1;i++) for (let j=z0;j<=z1;j++){
    const a = this.map.get(i+","+j);
    if (a) for (const ref of a){
      if (ref._stamp === stamp) continue;
      ref._stamp = stamp;
      out.push(ref);
    }
  }
  return out;
};

/* ============================================================
 * FX —— 粒子/闪光/震屏
 * ============================================================ */
const FX = window.FX = {
  pool: [], poolIdx: 0, MAX: 320,
  tex: null, lightPool: [], lightIdx: 0, dust: [],
  init(){
    if (this.tex) return;
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(32,32,2,32,32,30);
    g.addColorStop(0,"rgba(255,255,255,1)");
    g.addColorStop(0.4,"rgba(255,255,255,0.7)");
    g.addColorStop(1,"rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,64,64);
    this.tex = new THREE.CanvasTexture(c);
    for (let i=0;i<this.MAX;i++){
      const m = new THREE.Sprite(new THREE.SpriteMaterial({map:this.tex, color:0xffffff, transparent:true, opacity:0, depthWrite:false}));
      m.visible = false;
      m.userData = {life:0, maxLife:1, vel:new THREE.Vector3(), grav:0, grow:0, fade:true};
      G.scene.add(m);
      this.pool.push(m);
    }
    for (let i=0;i<3;i++){
      const l = new THREE.PointLight(0xffc070, 0, 60, 1.6);
      G.scene.add(l);
      this.lightPool.push(l);
    }
    for (let i=0;i<60;i++){
      const m = new THREE.Sprite(new THREE.SpriteMaterial({map:this.tex, color:0x555555, transparent:true, opacity:0, depthWrite:false}));
      m.visible = false;
      m.userData = {life:0, maxLife:1, vel:new THREE.Vector3(), grav:-0.2, grow:2.4, fade:true};
      G.scene.add(m);
      this.dust.push(m);
    }
  },
  reset(){ /* 池常驻 */ },
  get(){
    const p = this.pool[this.poolIdx];
    this.poolIdx = (this.poolIdx+1) % this.MAX;
    return p;
  },
  burst(pos, color, count, speed, size){
    count = count||8;
    for (let i=0;i<count;i++){
      const p = this.get();
      p.visible = true;
      p.position.copy(pos);
      p.material.color.setHex(color);
      const u = p.userData;
      u.maxLife = u.life = 0.25 + Math.random()*0.35;
      u.vel.set((Math.random()-0.5)*speed, Math.random()*speed*0.7+1, (Math.random()-0.5)*speed);
      u.grav = -6;
      u.grow = 0;
      u.fade = true;
      p.scale.setScalar((size||0.5)*(0.6+Math.random()*0.8));
      p.material.opacity = 0.9;
    }
  },
  fireball(pos, radius){
    const p = this.get();
    p.visible = true;
    p.position.copy(pos);
    p.material.color.setHex(0xffb040);
    const u = p.userData;
    u.maxLife = u.life = 0.35;
    u.vel.set(0,0,0); u.grav = 0; u.grow = radius*7; u.fade = true;
    p.scale.setScalar(radius*0.9);
    p.material.opacity = 1;
    // 烟尘
    for (let i=0;i<Math.min(14, radius*1.2);i++){
      const d = this.dust[(this.poolIdx*7+i*3)%this.dust.length];
      d.visible = true;
      d.position.copy(pos).add(new THREE.Vector3((Math.random()-0.5)*radius*0.8, 0.5, (Math.random()-0.5)*radius*0.8));
      const du = d.userData;
      du.maxLife = du.life = 0.8 + Math.random()*0.9;
      du.vel.set((Math.random()-0.5)*3, 2+Math.random()*3, (Math.random()-0.5)*3);
      du.grav = -0.5; du.grow = 2.2;
      d.material.color.setHex(0x55504a);
      d.scale.setScalar(radius*0.5*(0.6+Math.random()*0.8));
      d.material.opacity = 0.75;
    }
    const l = this.lightPool[this.lightIdx];
    this.lightIdx = (this.lightIdx+1) % this.lightPool.length;
    l.position.copy(pos);
    l.intensity = Math.min(4, radius*0.5);
    l.userData = {life:0.12, maxLife:0.12};
  },
  sparks(pos, color){
    this.burst(pos, color||0xffd070, 4, 3, 0.35);
  },
  muzzle(pos, dir){
    const p = this.get();
    p.visible = true;
    p.position.copy(pos);
    p.material.color.setHex(0xffd080);
    const u = p.userData;
    u.maxLife = u.life = 0.06;
    u.vel.copy(dir||new THREE.Vector3()).multiplyScalar(2);
    u.grav = 0; u.grow = 0; u.fade = true;
    p.scale.setScalar(0.7);
    p.material.opacity = 0.95;
    const l = this.lightPool[this.lightIdx];
    this.lightIdx = (this.lightIdx+1) % this.lightPool.length;
    l.position.copy(pos);
    l.intensity = 2.2;
    l.userData = {life:0.05, maxLife:0.05};
  },
  goo(pos, color){
    this.burst(pos, color||0x66cc44, 6, 3.5, 0.5);
  },
  flame(pos, big){
    // 火焰（橙红，上升，闪烁）
    const s = big ? 1.7 : 1.0;
    const p = this.get();
    p.visible = true;
    p.position.copy(pos);
    p.material.color.setHex(Math.random() < 0.5 ? 0xffa030 : 0xff5818);
    const u = p.userData;
    u.maxLife = u.life = 0.5 + Math.random()*0.55;
    u.vel.set((Math.random()-0.5)*1.1, 2.6 + Math.random()*2.2, (Math.random()-0.5)*1.1);
    u.grav = 0.5; u.grow = 0.6; u.fade = true;
    p.scale.setScalar(s * (1.6 + Math.random()*1.5));
    p.material.opacity = 0.95;
    // 黑烟（上升，扩散）
    const d = this.dust[Math.floor(Math.random()*this.dust.length)];
    d.visible = true;
    d.position.copy(pos).add(new THREE.Vector3((Math.random()-0.5)*0.7, 0.6, (Math.random()-0.5)*0.7));
    const du = d.userData;
    du.maxLife = du.life = 0.9 + Math.random()*0.8;
    du.vel.set((Math.random()-0.5)*0.6, 2.0 + Math.random()*1.5, (Math.random()-0.5)*0.6);
    du.grav = -0.2; du.grow = 1.8;
    d.material.color.setHex(0x383838);
    d.scale.setScalar(s * (1.4 + Math.random()*1.1));
    d.material.opacity = 0.6;
  },
  shockwave(pos, maxR){
    // 冲击波扩张环
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1.0, 48),
      new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:0.75, side:THREE.DoubleSide, depthWrite:false})
    );
    ring.rotation.x = -Math.PI/2;
    ring.position.set(pos.x, Math.max(0, pos.y) + 1.5, pos.z);
    ring.userData = { life:0.7, maxLife:0.7, maxR: Math.min(120, maxR) };
    G.scene.add(ring);
    (this._waves = this._waves||[]).push(ring);
  },
  update(dt){
    for (const w of (this._waves||[]).slice()){
      w.userData.life -= dt;
      if (w.userData.life <= 0){
        G.scene.remove(w);
        w.geometry.dispose(); w.material.dispose();
        this._waves.splice(this._waves.indexOf(w),1);
        continue;
      }
      const k = 1 - w.userData.life/w.userData.maxLife;
      const r = w.userData.maxR * k;
      w.scale.set(r, r, 1);
      w.material.opacity = 0.75 * (1 - k);
    }
    for (const p of this.pool){
      if (!p.visible) continue;
      const u = p.userData;
      u.life -= dt;
      if (u.life <= 0){ p.visible = false; continue; }
      p.position.addScaledVector(u.vel, dt);
      u.vel.y += u.grav*dt;
      if (u.grow) p.scale.multiplyScalar(1 + u.grow*dt);
      if (u.fade) p.material.opacity = Math.max(0, u.life/u.maxLife);
    }
    for (const d of this.dust){
      if (!d.visible) continue;
      const u = d.userData;
      u.life -= dt;
      if (u.life <= 0){ d.visible = false; continue; }
      d.position.addScaledVector(u.vel, dt);
      u.vel.y += u.grav*dt;
      if (u.grow) d.scale.multiplyScalar(1 + u.grow*dt);
      d.material.opacity = Math.max(0, (u.life/u.maxLife)*0.7);
    }
    for (const l of this.lightPool){
      if (l.intensity <= 0) continue;
      if (l.userData && l.userData.life !== undefined){
        l.userData.life -= dt;
        l.intensity = Math.max(0, l.userData.life/l.userData.maxLife* (l.userData.maxInt||4));
      } else {
        l.intensity *= 0.8;
      }
    }
    if (G.camShake > 0) G.camShake = Math.max(0, G.camShake - dt*3);
  },
  shake(amt){ G.camShake = Math.min(2.2, Math.max(G.camShake, amt)); },
};
