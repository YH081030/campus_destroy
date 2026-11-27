/* ============================================================
 * 建筑 —— 教学楼/宿舍/食堂/体育馆/新翼/围墙校门/湖/桥/凉亭等
 * 结构：墙段(窗台墙+玻璃+过梁)+立柱+楼板+隔墙+楼梯，可逐段破坏
 * 承重：墙/柱/隔墙，每层承重损失超 60% 触发整层坍塌
 * ============================================================ */
"use strict";
const Buildings = window.Buildings = {
  list: [],
  FH: 6.0,

  build(){
    this.list = [];
    for (const spec0 of CFG.LAYOUT.buildings){
      const spec = Object.assign({}, spec0);
      spec.w *= 1.5; spec.d *= 1.5; // 长宽放大1.5倍
      const bld = {
        spec, parts: [], props: [],
        supportInit: [], supportLeft: [], floors: spec.floors||1,
      };
      this.list.push(bld);
      if (window.__stopLoop) console.log("[B]", spec.kind, spec.side, "start");
      switch(spec.kind){
        case "teaching": this.genTeaching(spec, bld); break;
        case "dorm":     this.genDorm(spec, bld); break;
        case "dining":   this.genDining(spec, bld); break;
        case "wing":     this.genWing(spec, bld); break;
        case "gym":      this.genGym(spec, bld); break;
      }
      if (window.__stopLoop) console.log("[B]", spec.kind, spec.side, "done, parts:", bld.parts.length, "props:", bld.props.length);
    }
    this.genSkyBridge();
    this.genWalls();
    this.genLake();
    this.genSoccerField();
    this.genHoops();
    this.genBleachers();
    this.genParkingCars();
    this.genBikeSheds();
    this.genRoadVehicles();
    this.genGasStations();
    this.genFormations();
    this.genAirDefense();
    this.genBlocks();
    if (window.__stopLoop) console.log("[B] all done");
  },

  /* ---------- 承重统计与坍塌 ---------- */
  isSupport(kind){
    return kind==="col"||kind==="sill"||kind==="header"||kind==="wall"||kind==="intwall";
  },
  track(bld, seg){
    bld.parts.push(seg);
    if (this.isSupport(seg.kind) && seg.floor < bld.floors){
      bld.supportInit[seg.floor] = (bld.supportInit[seg.floor]||0)+1;
      bld.supportLeft[seg.floor] = (bld.supportLeft[seg.floor]||0)+1;
    }
  },
  onSegDestroyed(seg){
    if (!seg.building) return;
    const bld = seg.building;
    if (bld.destroyed) return;
    if (this.isSupport(seg.kind) && seg.floor < bld.floors){
      bld.supportLeft[seg.floor]--;
      const init = bld.supportInit[seg.floor]||1;
      const ratio = (bld.supportLeft[seg.floor]||0)/init;
      if (ratio < 0.40){
        this.collapseFloor(bld, seg.floor);
      }
    }
  },
  collapseFloor(bld, floor){
    bld.collapsed = bld.collapsed || [];
    if (bld.collapsed[floor]) return;
    bld.collapsed[floor] = true;
    UI.toast("⚠ 结构失稳！第"+(floor+1)+"层及以上坍塌", "danger");
    FX.shake(1.6);
    Audio.explosion(true);
    const pts = [];
    for (const s of bld.parts.slice()){
      if (s.dead) continue;
      if (s.floor >= floor){
        pts.push(s.mesh.position.clone());
        s.onDestroyed = null; // 防止递归
        W.destroySeg(s, s.mesh.position.clone(), new THREE.Vector3(0,-1,0));
      }
    }
    for (const e of bld.props.slice()){
      if (!e.dead && e.floor >= floor){
        SU.damageProp(e, 1e9, e.pos, new THREE.Vector3(0,-1,0));
      }
    }
    // 扬尘
    for (const p of pts) FX.burst(p, 0x8a8578, 2, 3, 0.8);
  },

  /* ---------- 通用外墙 ---------- */
  exterior(bld, spec, f, y0, mat, opts){
    opts = opts||{};
    const {cx, cz, w, d} = spec;
    const FH = this.FH;
    const wallH = opts.h || FH;
    const cell = 8;
    const edges = [
      {a0:cx-w/2, a1:cx+w/2, b:cz-d/2, axis:"x", s:-1},
      {a0:cx-w/2, a1:cx+w/2, b:cz+d/2, axis:"x", s:1},
      {a0:cz-d/2, a1:cz+d/2, b:cx-w/2, axis:"z", s:-1},
      {a0:cz-d/2, a1:cz+d/2, b:cx+w/2, axis:"z", s:1},
    ];
    const glassStyle = opts.glassStyle;
    // 立柱
    const colPts = [];
    const colSet = new Set();
    for (const e of edges){
      const n = Math.ceil((e.a1-e.a0)/cell);
      for (let i=0;i<=n;i++){
        const a = e.a0 + i*cell;
        const x = e.axis==="x" ? a : e.b;
        const z = e.axis==="x" ? e.b : a;
        const k = Math.round(x*10)+","+Math.round(z*10);
        if (!colSet.has(k)){ colSet.add(k); colPts.push([x,z]); }
      }
    }
    for (const [x, z] of colPts){
      // 跳过门洞范围内的立柱
      if (f===0 && opts.doorAt !== undefined && opts.doorW){
        const horiz = (opts.doorEdge === "south" || opts.doorEdge === "north");
        const along = horiz ? x : z;
        if (Math.abs(along - opts.doorAt) < opts.doorW/2 + 0.35) continue;
      }
      const seg = SU.boxSeg("col", x, y0+wallH/2, z, 0.5, wallH, 0.5, W.mats.concrete, {floor:f, building:bld});
      this.track(bld, seg);
    }
    // 墙面单元
    for (const e of edges){
      const n = Math.ceil((e.a1-e.a0)/cell);
      for (let i=0;i<n;i++){
        const len = Math.min(cell, e.a1 - (e.a0+i*cell));
        const mid = e.a0 + i*cell + len/2;
        const x = e.axis==="x" ? mid : e.b;
        const z = e.axis==="x" ? e.b : mid;
        // 门?
        const doorW = (f===0 && opts.doorW)||0;
        const doorAt = f===0 ? opts.doorAt : null;
        const edgeMatch =
          (opts.doorEdge==="all") ||
          (opts.doorEdge==="south" && e.s===1 && e.axis==="x") ||
          (opts.doorEdge==="north" && e.s===-1 && e.axis==="x") ||
          (opts.doorEdge==="west" && e.s===-1 && e.axis==="z") ||
          (opts.doorEdge==="east" && e.s===1 && e.axis==="z");
        // 门中心落在本格 [start, start+len) 半开区间内
        const cellStart = mid - len/2;
        const inCell = doorAt!==null && doorAt!==undefined && edgeMatch &&
          doorAt >= cellStart - 0.01 && doorAt < cellStart + len + 0.01 && !(doorAt >= cellStart + len);
        if (inCell){
          const dw = doorW;
          const leftLen = doorAt - cellStart;
          const rightLen = len - leftLen;
          const wL = leftLen - dw/2;
          const wR = rightLen - dw/2;
          const mkPiece = (off, w)=>{
            if (w <= 0.25) return;
            const px = e.axis==="x" ? off : x;
            const pz = e.axis==="x" ? z : off;
            const seg = SU.boxSeg("wall", px, y0+wallH/2, pz,
              e.axis==="x"?w:0.3, wallH, e.axis==="z"?w:0.3, mat, {floor:f, building:bld});
            this.track(bld, seg);
          };
          mkPiece(doorAt - dw/2 - wL/2, wL);
          mkPiece(doorAt + dw/2 + wR/2, wR);
          const door = SU.boxSeg("door", e.axis==="x"?doorAt:x, y0+1.2, e.axis==="x"?z:doorAt,
            e.axis==="x"?dw:0.18, 2.4, e.axis==="z"?dw:0.18, W.mats.door, {floor:f, building:bld});
          this.track(bld, door);
          const hd = SU.boxSeg("header", e.axis==="x"?doorAt:x, y0+2.4+(wallH-2.4)/2, e.axis==="x"?z:doorAt,
            e.axis==="x"?dw:0.3, wallH-2.4, e.axis==="z"?dw:0.3, mat, {floor:f, building:bld});
          this.track(bld, hd);
        } else if (glassStyle){
          const glass = SU.boxSeg("glass", x, y0+0.2+(wallH-0.4)/2, z, e.axis==="x"?len:0.08, wallH-0.44, e.axis==="z"?len:0.08, W.mats.glass, {floor:f, building:bld});
          this.track(bld, glass);
          const hd = SU.boxSeg("header", x, y0+wallH-0.12, z, e.axis==="x"?len:0.3, 0.24, e.axis==="z"?len:0.3, W.mats.silver, {floor:f, building:bld});
          this.track(bld, hd);
        } else {
          const sill = SU.boxSeg("sill", x, y0+0.5, z, e.axis==="x"?len:0.3, 1.0, e.axis==="z"?len:0.3, mat, {floor:f, building:bld});
          this.track(bld, sill);
          const gh = Math.max(1.4, wallH-1.4);
          const glass = SU.boxSeg("glass", x, y0+1.0+gh/2, z, e.axis==="x"?len:0.08, gh, e.axis==="z"?len:0.08, W.mats.glass, {floor:f, building:bld});
          this.track(bld, glass);
          const hd = SU.boxSeg("header", x, y0+wallH-0.2, z, e.axis==="x"?len:0.3, 0.4, e.axis==="z"?len:0.3, mat, {floor:f, building:bld});
          this.track(bld, hd);
        }
      }
    }
  },

  /* ---------- 走廊墙（带房间门） ---------- */
  corridorWall(bld, f, y0, s, wz, cx, w, roomsPerSide, roomW, margin){
    const FH = this.FH;
    margin = margin || 4;
    const start = cx-w/2+margin, end = cx+w/2-margin;
    const cell = 6;
    const n = Math.ceil((end-start)/cell);
    for (let i=0;i<n;i++){
      const len = Math.min(cell, end-(start+i*cell));
      const mid = start + i*cell + len/2;
      // 是否有房门
      let hasDoor = false;
      for (let r=0;r<roomsPerSide;r++){
        const rc = cx-w/2+margin + roomW/2 + r*roomW;
        if (Math.abs(rc-mid) < len/2 - 0.1) hasDoor = true;
      }
      if (hasDoor && len > 3){
        const dw = 1.5;
        const wL = (len-dw)/2;
        const o1 = SU.boxSeg("intwall", mid-dw/2-wL/2, y0+FH/2, wz, wL, FH, 0.25, W.mats.wall, {floor:f, building:bld});
        this.track(bld, o1);
        const o2 = SU.boxSeg("intwall", mid+dw/2+wL/2, y0+FH/2, wz, wL, FH, 0.25, W.mats.wall, {floor:f, building:bld});
        this.track(bld, o2);
        const door = SU.boxSeg("door", mid, y0+1.2, wz, dw, 2.4, 0.18, W.mats.door, {floor:f, building:bld});
        this.track(bld, door);
        const hd = SU.boxSeg("intwall", mid, y0+2.4+(FH-2.4)/2, wz, dw, FH-2.4, 0.25, W.mats.wall, {floor:f, building:bld});
        this.track(bld, hd);
      } else {
        const o1 = SU.boxSeg("intwall", mid, y0+FH/2, wz, len, FH, 0.25, W.mats.wall, {floor:f, building:bld});
        this.track(bld, o1);
      }
    }
  },

  /* ---------- 楼梯 ---------- */
  stairs(bld, f, y0, sx, cz, width, flightLen){
    const FH = this.FH;
    const rise = FH/2;
    const ang = Math.atan2(rise, flightLen);
    const zMid = cz;
    // 第一跑（z: zMid-flightLen → zMid，升 0→rise）
    const seg1 = SU.boxSeg("stairs", sx, y0+rise/2, zMid-flightLen/2, width, 0.22, Math.hypot(flightLen, rise), W.mats.concrete, {
      euler:{x:-ang, y:0, z:0}, floor:f, building:bld,
    });
    this.track(bld, seg1);
    this.stairVisual(sx, y0, zMid-flightLen/2, width, flightLen, rise, ang, seg1);
    // 平台（z: zMid → zMid+1.8）
    const land = SU.boxSeg("stairs", sx, y0+rise+0.12, zMid+0.9, width, 0.25, 1.8, W.mats.concrete, {floor:f, building:bld});
    this.track(bld, land);
    // 第二跑（z: zMid+1.8 → zMid+1.8+flightLen，升 rise→2rise）
    const z2c = zMid + 1.8 + flightLen/2;
    const seg2 = SU.boxSeg("stairs", sx, y0+rise+rise/2, z2c, width, 0.22, Math.hypot(flightLen, rise), W.mats.concrete, {
      euler:{x:-ang, y:0, z:0}, floor:f, building:bld,
    });
    this.track(bld, seg2);
    this.stairVisual(sx, y0+rise, z2c, width, flightLen, rise, ang, seg2);
  },
  stairVisual(sx, y0, zMid, width, flightLen, rise, ang, seg){
    // 台阶视觉（合并几何）
    const steps = [];
    const n = Math.max(6, Math.round(flightLen/0.42));
    const run = flightLen/n, rr = rise/n;
    for (let i=0;i<n;i++){
      steps.push({x:0, y:-rise/2 + (i+0.5)*rr, z:-flightLen/2 + (i+0.5)*run, sx:width, sy:rr+0.06, sz:run});
    }
    const geo = mergedBoxes(steps);
    const mesh = new THREE.Mesh(geo, W.mats.path);
    mesh.position.set(sx, y0+rise/2, zMid);
    mesh.rotation.x = -ang;
    mesh.castShadow = false;
    G.scene.add(mesh);
    const prev = seg.onDestroyed;
    seg.onDestroyed = (s, p)=>{ G.scene.remove(mesh); try{geo.dispose();}catch(e){} if(prev) prev(s,p); };
  },

  /* ---------- 屋顶 ---------- */
  roof(bld, spec, yTop){
    const {cx, cz, w, d} = spec;
    const seg = SU.boxSeg("roof", cx, yTop+0.15, cz, w+0.6, 0.3, d+0.6, W.mats.roof, {floor:bld.floors, building:bld});
    this.track(bld, seg);
    const h = 0.9;
    const p1 = SU.boxSeg("roof", cx, yTop+0.45, cz-d/2, w+0.6, h, 0.3, W.mats.roof, {floor:bld.floors, building:bld});
    const p2 = SU.boxSeg("roof", cx, yTop+0.45, cz+d/2, w+0.6, h, 0.3, W.mats.roof, {floor:bld.floors, building:bld});
    const p3 = SU.boxSeg("roof", cx-w/2, yTop+0.45, cz, 0.3, h, d+0.6, W.mats.roof, {floor:bld.floors, building:bld});
    const p4 = SU.boxSeg("roof", cx+w/2, yTop+0.45, cz, 0.3, h, d+0.6, W.mats.roof, {floor:bld.floors, building:bld});
    this.track(bld, p1); this.track(bld, p2); this.track(bld, p3); this.track(bld, p4);
  },

  /* ---------- 灯具 ---------- */
  lights(bld, spots){
    const light = new THREE.MeshBasicMaterial({color:0xfff2c8});
    const m = SU.instanced(new THREE.PlaneGeometry(2.0, 0.5), light, spots.length);
    spots.forEach((p, i)=>{
      const mesh = m;
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2, 0, 0));
      m4.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(1,1,1));
      mesh.setMatrixAt(i, m4);
      mesh.instanceMatrix.needsUpdate = true;
    });
  },

  /* ============================================================
   * 教学楼（M校4层 / D校6层）
   * ============================================================ */
  genTeaching(spec, bld){
    const {cx, cz, w, d, floors} = spec;
    const FH = this.FH;
    const mat = spec.side==="A" ? W.mats.cream : W.mats.brick;
    const corr = 2.4;
    const roomW = 8;
    const roomsPerSide = Math.floor((w-8)/roomW);
    const margin = (w - roomsPerSide*roomW)/2;
    const roomDepth = (d-corr)/2;
    for (let f=0; f<floors; f++){
      const y0 = f*FH;
      const slab = SU.boxSeg("slab", cx, y0+0.15, cz, w+0.6, 0.3, d+0.6, W.mats.floor, {floor:f, building:bld});
      this.track(bld, slab);
      this.exterior(bld, spec, f, y0, mat, {doorAt:cx, doorW:2.6, doorEdge:"south"});
      for (const s of [-1, 1]){
        const wz = cz + s*corr/2;
        this.corridorWall(bld, f, y0, s, wz, cx, w, roomsPerSide, roomW, margin);
        for (let i=0;i<=roomsPerSide;i++){
          const px = cx - w/2 + margin + i*roomW;
          const seg = SU.boxSeg("intwall", px, y0+FH/2, cz + s*(corr/2+roomDepth/2), 0.25, FH, roomDepth, W.mats.wall, {floor:f, building:bld});
          this.track(bld, seg);
        }
      }
      this.stairs(bld, f, y0, cx-w/2+margin/2, cz, 2.2, 4.6);
      this.stairs(bld, f, y0, cx+w/2-margin/2, cz, 2.2, 4.6);
      // 灯
      const spots = [];
      for (let i=0;i<roomsPerSide;i++){
        const rx = cx-w/2+margin+roomW/2+i*roomW;
        spots.push({x:rx, y:y0+FH-0.15, z:cz-(corr/2+roomDepth/2)});
        spots.push({x:rx, y:y0+FH-0.15, z:cz+(corr/2+roomDepth/2)});
      }
      for (let x=cx-w/2+margin+3; x<cx+w/2-margin-3; x+=8) spots.push({x, y:y0+FH-0.15, z:cz});
      this.lights(bld, spots);
    }
    this.roof(bld, spec, floors*FH);
    this.furnishRooms(bld, spec);
  },

  furnishRooms(bld, spec){
    const {cx, cz, w, d, floors} = spec;
    const FH = this.FH;
    const corr = 2.4;
    const roomW = 8;
    const roomsPerSide = Math.floor((w-8)/roomW);
    const margin = (w - roomsPerSide*roomW)/2;
    const roomDepth = (d-corr)/2;
    const roomCount = floors * roomsPerSide * 2;
    const deskCount = roomCount * 20;
    const deskBody = SU.instanced(new THREE.BoxGeometry(0.55, 0.7, 0.42), W.mats.wood, deskCount);
    const deskTop = SU.instanced(new THREE.BoxGeometry(0.66, 0.05, 0.5), W.mats.light, deskCount);
    const boards = SU.instanced(new THREE.BoxGeometry(3.6, 1.3, 0.1), new THREE.MeshLambertMaterial({color:0x2a4a34}), roomCount);
    const tdesks = SU.instanced(new THREE.BoxGeometry(1.2, 0.85, 0.6), W.mats.wood, roomCount);
    let di = 0;
    for (let f=0; f<floors; f++){
      const y0 = f*FH;
      for (let sI=0; sI<2; sI++){
        const s = sI===0 ? -1 : 1;
        for (let r=0; r<roomsPerSide; r++){
          const rx = cx-w/2+margin+roomW/2+r*roomW;
          const innerZ = cz + s*(corr/2 + 0.8);        // 讲台/黑板侧(靠走廊)
          const ri = f*roomsPerSide*2 + sI*roomsPerSide + r;
          // 黑板
          SU.setInstance(boards, ri, rx, y0+1.9, innerZ - s*0.1, 0);
          boards.userData.props[ri] = null;
          // 讲台桌
          SU.setInstance(tdesks, ri, rx, y0+0.42, innerZ + s*0.9, s<0?0:Math.PI);
          tdesks.userData.props[ri] = null;
          // 课桌 4行×5列
          for (let row=0; row<4; row++){
            for (let col=0; col<5; col++){
              const dx = rx - 2.2 + col*1.1;
              const dz = innerZ + s*(2.2 + row*1.35);
              const id = di;
              SU.setInstance(deskBody, id, dx, y0+0.38, dz, 0);
              SU.setInstance(deskTop, id, dx, y0+0.74, dz, 0);
              const e = SU.propEntry({kind:"desk", x:dx, y:y0+0.5, z:dz, size:0.6, color:0x9a6a3a, floor:f});
              e.meshes = [{mesh:deskBody, instanceId:id},{mesh:deskTop, instanceId:id}];
              deskBody.userData.props[id] = e;
              deskTop.userData.props[id] = e;
              bld.props.push(e);
              di++;
            }
          }
        }
      }
    }
    // 黑板/讲台桌的可破坏条目
    for (let f=0; f<floors; f++){
      const y0 = f*FH;
      for (let sI=0; sI<2; sI++){
        const s = sI===0?-1:1;
        for (let r=0; r<roomsPerSide; r++){
          const rx = cx-w/2+margin+roomW/2+r*roomW;
          const innerZ = cz + s*(corr/2 + 0.8);
          const ri = f*roomsPerSide*2 + sI*roomsPerSide + r;
          const eb = SU.propEntry({kind:"board", x:rx, y:y0+1.9, z:innerZ, size:0.8, color:0x2a4a34, floor:f});
          eb.meshes = [{mesh:boards, instanceId:ri}];
          boards.userData.props[ri] = eb;
          bld.props.push(eb);
          const et = SU.propEntry({kind:"table", x:rx, y:y0+0.45, z:innerZ + s*0.9, size:0.6, color:0x9a6a3a, floor:f});
          et.meshes = [{mesh:tdesks, instanceId:ri}];
          tdesks.userData.props[ri] = et;
          bld.props.push(et);
        }
      }
    }
  },

  /* ============================================================
   * 宿舍（M校，4层，无独立卫生间细节）
   * ============================================================ */
  genDorm(spec, bld){
    const {cx, cz, w, d, floors} = spec;
    const FH = this.FH;
    const mat = W.mats.cream;
    const corr = 2.4;
    const colN = 6, colW = (w-6)/colN;
    const margin = (w - colN*colW)/2;
    const rowsN = 2, rowD = (d-corr)/2/rowsN;
    for (let f=0; f<floors; f++){
      const y0 = f*FH;
      const slab = SU.boxSeg("slab", cx, y0+0.15, cz, w+0.6, 0.3, d+0.6, W.mats.floor, {floor:f, building:bld});
      this.track(bld, slab);
      this.exterior(bld, spec, f, y0, mat, {doorAt:cx, doorW:2.6, doorEdge:"south"});
      for (const s of [-1, 1]){
        const wz = cz + s*corr/2;
        this.corridorWall(bld, f, y0, s, wz, cx, w, colN, colW, margin);
        // 两排房间的中间隔墙（带门洞）
        const midZ = cz + s*(corr/2 + rowD);
        for (let i=0;i<colN;i++){
          const px = cx - w/2 + margin + colW/2 + i*colW;
          const seg = SU.boxSeg("intwall", px, y0+FH/2, midZ, colW-1.3, FH, 0.25, W.mats.wall, {floor:f, building:bld});
          this.track(bld, seg);
        }
        // 房间隔墙（两排都要）
        for (let r=0; r<rowsN; r++){
          const pz = cz + s*(corr/2 + rowD/2 + r*rowD);
          for (let i=0;i<=colN;i++){
            const px = cx - w/2 + margin + i*colW;
            const seg = SU.boxSeg("intwall", px, y0+FH/2, pz, 0.25, FH, rowD, W.mats.wall, {floor:f, building:bld});
            this.track(bld, seg);
          }
        }
      }
      this.stairs(bld, f, y0, cx-w/2+margin/2, cz, 2.2, 4.6);
      this.stairs(bld, f, y0, cx+w/2-margin/2, cz, 2.2, 4.6);
      const spots = [];
      for (let x=cx-w/2+margin+3; x<cx+w/2-margin-3; x+=6) spots.push({x, y:y0+FH-0.15, z:cz});
      this.lights(bld, spots);
    }
    this.roof(bld, spec, floors*FH);
    this.furnishDorm(bld, spec);
  },
  furnishDorm(bld, spec){
    const {cx, cz, w, d, floors} = spec;
    const FH = this.FH;
    const corr = 2.4;
    const colN = 6, colW = (w-6)/colN;
    const rowsN = 2, rowD = (d-corr)/2/rowsN;
    const roomCount = floors * colN * rowsN * 2;
    const bedCount = roomCount * 2;
    // 床（合并几何：上下铺）
    const bedGeo = mergedBoxes([
      {x:0, y:0.25, z:0, sx:2.0, sy:0.5, sz:0.95},
      {x:0, y:1.35, z:0, sx:2.0, sy:0.5, sz:0.95},
      {x:-0.85, y:0.9, z:0, sx:0.08, sy:1.8, sz:0.08},
      {x:0.85, y:0.9, z:0, sx:0.08, sy:1.8, sz:0.08},
      {x:0, y:0.35, z:0, sx:2.0, sy:0.12, sz:0.95},
      {x:0, y:1.45, z:0, sx:2.0, sy:0.12, sz:0.95},
    ]);
    const beds = SU.instanced(bedGeo, W.mats.steel, bedCount);
    const desks = SU.instanced(new THREE.BoxGeometry(0.9, 0.8, 0.5), W.mats.wood, roomCount);
    let bi = 0;
    for (let f=0; f<floors; f++){
      const y0 = f*FH;
      for (let sI=0; sI<2; sI++){
        const s = sI===0?-1:1;
        for (let r=0; r<rowsN; r++){
          for (let c=0; c<colN; c++){
            const rx = cx - w/2 + 3 + colW/2 + c*colW;
            const rz = cz + s*(corr/2 + rowD/2 + r*rowD);
            const ri = ((f*2 + sI)*rowsN + r)*colN + c;
            for (let k=0;k<2;k++){
              const id = bi;
              const bz = rz + (k===0 ? -0.8 : 1.2);
              SU.setInstance(beds, id, rx - 0.8, y0, bz, s<0?0:Math.PI);
              const e = SU.propEntry({kind:"bed", x:rx-0.8, y:y0+0.8, z:bz, size:1.1, color:0x7a8290, floor:f});
              e.meshes = [{mesh:beds, instanceId:id}];
              beds.userData.props[id] = e;
              bld.props.push(e);
              bi++;
            }
            SU.setInstance(desks, ri, rx + 0.9, y0+0.4, rz + 2.0, s<0?Math.PI/2:-Math.PI/2);
            const ed = SU.propEntry({kind:"desk", x:rx+0.9, y:y0+0.45, z:rz+2.0, size:0.5, color:0x9a6a3a, floor:f});
            ed.meshes = [{mesh:desks, instanceId:ri}];
            desks.userData.props[ri] = ed;
            bld.props.push(ed);
          }
        }
      }
    }
  },

  /* ============================================================
   * 食堂（2层，开敞大厅）
   * ============================================================ */
  genDining(spec, bld){
    const {cx, cz, w, d, floors} = spec;
    const FH = this.FH;
    const mat = W.mats.cream;
    for (let f=0; f<floors; f++){
      const y0 = f*FH;
      const slab = SU.boxSeg("slab", cx, y0+0.15, cz, w+0.6, 0.3, d+0.6, W.mats.floor, {floor:f, building:bld});
      this.track(bld, slab);
      this.exterior(bld, spec, f, y0, mat, {doorAt:cx, doorW:2.6, doorEdge:"south"});
      // 内部立柱
      for (const [px, pz] of [[cx-w/4, cz-d/4],[cx+w/4, cz-d/4],[cx-w/4, cz+d/4],[cx+w/4, cz+d/4]]){
        const col = SU.boxSeg("col", px, y0+FH/2, pz, 0.5, FH, 0.5, W.mats.concrete, {floor:f, building:bld});
        this.track(bld, col);
      }
      this.stairs(bld, f, y0, cx-w/2+2.2, cz, 2.2, 4.6);
      this.stairs(bld, f, y0, cx+w/2-2.2, cz, 2.2, 4.6);
      const spots = [];
      for (let x=cx-w/2+4; x<cx+w/2-4; x+=6)
        for (let z=cz-d/2+4; z<cz+d/2-4; z+=6) spots.push({x, y:y0+FH-0.15, z});
      this.lights(bld, spots);
    }
    this.roof(bld, spec, floors*FH);
    this.furnishDining(bld, spec);
  },
  furnishDining(bld, spec){
    const {cx, cz, w, d, floors} = spec;
    const FH = this.FH;
    const tableCount = floors * 24;
    const tables = SU.instanced(mergedBoxes([
      {x:0,y:0.72,z:0,sx:2.2,sy:0.08,sz:1.1},
      {x:-0.9,y:0.36,z:-0.4,sx:0.12,sy:0.72,sz:0.12},
      {x:0.9,y:0.36,z:-0.4,sx:0.12,sy:0.72,sz:0.12},
      {x:-0.9,y:0.36,z:0.4,sx:0.12,sy:0.72,sz:0.12},
      {x:0.9,y:0.36,z:0.4,sx:0.12,sy:0.72,sz:0.12},
    ]), W.mats.wood, tableCount);
    const benches = SU.instanced(new THREE.BoxGeometry(2.0, 0.5, 0.35), W.mats.wood, tableCount*2);
    let ti = 0;
    for (let f=0; f<floors; f++){
      const y0 = f*FH;
      for (let i=0;i<4;i++){
        for (let j=0;j<6;j++){
          const tx = cx - w/2 + 4 + j*((w-8)/5);
          const tz = cz - d/2 + 5 + i*((d-10)/3);
          if (Math.abs(tx-cx)<1.6 && Math.abs(tz-cz)<1.6) continue;
          const id = ti;
          SU.setInstance(tables, id, tx, y0, tz, 0);
          SU.setInstance(benches, id*2, tx, y0, tz-0.85, 0);
          SU.setInstance(benches, id*2+1, tx, y0, tz+0.85, Math.PI);
          const e = SU.propEntry({kind:"table", x:tx, y:y0+0.4, z:tz, size:1.0, color:0x9a6a3a, floor:f});
          e.meshes = [{mesh:tables, instanceId:id},{mesh:benches, instanceId:id*2},{mesh:benches, instanceId:id*2+1}];
          tables.userData.props[id] = e;
          benches.userData.props[id*2] = e;
          benches.userData.props[id*2+1] = e;
          bld.props.push(e);
          ti++;
        }
      }
    }
  },

  /* ============================================================
   * D校扩建新翼（玻璃幕墙，5层）
   * ============================================================ */
  genWing(spec, bld){
    const {cx, cz, w, d, floors} = spec;
    const FH = this.FH;
    const corr = 2.4;
    const roomW = 8;
    const roomsPerSide = Math.floor((w-8)/roomW);
    const margin = (w - roomsPerSide*roomW)/2;
    const roomDepth = (d-corr)/2;
    for (let f=0; f<floors; f++){
      const y0 = f*FH;
      const slab = SU.boxSeg("slab", cx, y0+0.15, cz, w+0.6, 0.3, d+0.6, W.mats.floor, {floor:f, building:bld});
      this.track(bld, slab);
      this.exterior(bld, spec, f, y0, W.mats.silver, {doorAt:cx, doorW:2.6, doorEdge:"south", glassStyle:true});
      for (const s of [-1, 1]){
        const wz = cz + s*corr/2;
        this.corridorWall(bld, f, y0, s, wz, cx, w, roomsPerSide, roomW, margin);
        for (let i=0;i<=roomsPerSide;i++){
          const px = cx - w/2 + margin + i*roomW;
          const seg = SU.boxSeg("intwall", px, y0+FH/2, cz + s*(corr/2+roomDepth/2), 0.25, FH, roomDepth, W.mats.wall, {floor:f, building:bld});
          this.track(bld, seg);
        }
      }
      this.stairs(bld, f, y0, cx-w/2+margin/2, cz, 2.2, 4.6);
      this.stairs(bld, f, y0, cx+w/2-margin/2, cz, 2.2, 4.6);
    }
    this.roof(bld, spec, floors*FH);
    // 办公室家具：少量
    const roomCount = floors * roomsPerSide * 2;
    const desks = SU.instanced(new THREE.BoxGeometry(1.1, 0.75, 0.55), W.mats.wood, roomCount*3);
    const boards = SU.instanced(new THREE.BoxGeometry(3.0, 1.2, 0.1), new THREE.MeshLambertMaterial({color:0x2a4a34}), roomCount);
    let di = 0;
    for (let f=0; f<floors; f++){
      const y0 = f*FH;
      for (let sI=0; sI<2; sI++){
        const s = sI===0?-1:1;
        for (let r=0; r<roomsPerSide; r++){
          const rx = cx-w/2+margin+roomW/2+r*roomW;
          const innerZ = cz + s*(corr/2 + 1.2);
          const ri = f*roomsPerSide*2 + sI*roomsPerSide + r;
          SU.setInstance(boards, ri, rx, y0+1.8, innerZ, 0);
          const eb = SU.propEntry({kind:"board", x:rx, y:y0+1.8, z:innerZ, size:0.7, color:0x2a4a34, floor:f});
          eb.meshes = [{mesh:boards, instanceId:ri}];
          boards.userData.props[ri] = eb;
          bld.props.push(eb);
          for (let k=0;k<3;k++){
            const id = di;
            const dz = innerZ + s*(2.2 + k*2.0);
            SU.setInstance(desks, id, rx, y0+0.38, dz, 0);
            const ed = SU.propEntry({kind:"desk", x:rx, y:y0+0.4, z:dz, size:0.55, color:0x9a6a3a, floor:f});
            ed.meshes = [{mesh:desks, instanceId:id}];
            desks.userData.props[id] = ed;
            bld.props.push(ed);
            di++;
          }
        }
      }
    }
  },

  /* ============================================================
   * 体育馆（1层大跨）
   * ============================================================ */
  genGym(spec, bld){
    const {cx, cz, w, d} = spec;
    const H = 8;
    const y0 = 0;
    const slab = SU.boxSeg("slab", cx, 0.15, cz, w+0.6, 0.3, d+0.6, W.mats.floor, {floor:0, building:bld});
    this.track(bld, slab);
    this.exterior(bld, spec, 0, 0, W.mats.steel, {doorAt:cx, doorW:4.4, doorEdge:"south", h:H});
    // 顶棚
    const roofSeg = SU.boxSeg("roof", cx, H+0.15, cz, w+0.6, 0.3, d+0.6, W.mats.roof, {floor:1, building:bld});
    this.track(bld, roofSeg);
    // 内部球场线
    const lineTex = (()=>{
      const c = document.createElement("canvas");
      c.width = 512; c.height = 512;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#b8863a";
      ctx.fillRect(0,0,512,512);
      ctx.strokeStyle = "#f0e8d0";
      ctx.lineWidth = 6;
      ctx.strokeRect(30,30,452,452);
      ctx.beginPath(); ctx.moveTo(256,30); ctx.lineTo(256,482); ctx.stroke();
      ctx.beginPath(); ctx.arc(256,256,46,0,Math.PI*2); ctx.stroke();
      ctx.strokeRect(30,166,80,180); ctx.strokeRect(402,166,80,180);
      return new THREE.CanvasTexture(c);
    })();
    const court = new THREE.Mesh(new THREE.PlaneGeometry(w-8, d-8), new THREE.MeshBasicMaterial({map:lineTex}));
    court.rotation.x = -Math.PI/2;
    court.position.set(cx, 0.33, cz);
    G.scene.add(court);
    // 篮架×2
    for (const s of [-1,1]){
      this.hoopGroup(cx, 0, cz + s*(d/2-5), s>0?Math.PI:0);
    }
    // 灯具
    const spots = [];
    for (let x=cx-w/2+5; x<cx+w/2-5; x+=8)
      for (let z=cz-d/2+5; z<cz+d/2-5; z+=8) spots.push({x, y:H-0.4, z});
    this.lights(bld, spots);
    // 看台（西侧）
    for (let i=0;i<3;i++){
      const seg = SU.boxSeg("bleacher", cx-w/2+1.5, 0.8+i*0.9, cz-d/2+6+i*2.6, 1.5, 1.0, 10, W.mats.concrete, {floor:0, building:bld});
      this.track(bld, seg);
    }
  },

  hoopGroup(x, y, z, ry){
    const grp = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 3.6, 6), W.mats.steel);
    pole.position.y = 1.8;
    grp.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.4), W.mats.steel);
    arm.position.set(0, 3.3, 0.7);
    grp.add(arm);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 0.06), W.mats.light);
    board.position.set(0, 3.3, 1.35);
    grp.add(board);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.035, 6, 14), new THREE.MeshBasicMaterial({color:0xe06040}));
    rim.position.set(0, 3.3, 1.9);
    rim.rotation.x = Math.PI/2;
    grp.add(rim);
    grp.position.set(x, y, z);
    grp.rotation.y = ry||0;
    G.scene.add(grp);
    const body = new CANNON.Body({mass:0, shape:new CANNON.Box(new CANNON.Vec3(1.0, 2, 1.2))});
    body.position.set(x, 2, z);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), ry||0);
    body.collisionFilterGroup = 1; body.collisionFilterMask = -1;
    const seg = {
      kind:"hoop", mesh:grp, body,
      hp:SU.hp("hoop"), maxHp:SU.hp("hoop"), value:SU.val("hoop"),
      color:0x7a8290, size:2.2, dead:false, floor:0, building:null,
      onDestroyed:(s,p)=>W.spawnDebris(p, 0.6, 0x7a8290, new THREE.Vector3(0,1,0), 3),
    };
    W.addSeg(seg);
  },

  /* ---------- D校新旧楼连廊 ---------- */
  genSkyBridge(){
    const x = -1650, z = -465, len = 10;
    SU.boxSeg("slab", x, 3.7, z, 2.6, 0.25, len, W.mats.concrete, {});
    SU.boxSeg("wall", x-1.2, 4.6, z, 0.12, 1.2, len, W.mats.steel, {});
    SU.boxSeg("wall", x+1.2, 4.6, z, 0.12, 1.2, len, W.mats.steel, {});
  },

  /* ---------- 围墙 + 校门（主门 + 多个侧门缺口） ---------- */
  genWalls(){
    const L = CFG.LAYOUT;
    for (const side of ["A","B"]){
      const c = side==="A" ? L.campusA : L.campusB;
      const g = c.gaps;
      this.wallRunGaps(c.x0, c.x1, c.z1, "x", g.south||[]);
      this.wallRunGaps(c.x0, c.x1, c.z0, "x", g.north||[]);
      this.wallRunGaps(c.z0, c.z1, c.x0, "z", g.west||[]);
      this.wallRunGaps(c.z0, c.z1, c.x1, "z", g.east||[]);
      for (const gap of g.south||[]){
        const cx = (gap[0]+gap[1])/2;
        if (gap[2] === "main") this.genMainGate(cx, c.z1, gap[1]-gap[0], side);
        else this.genSideGate(cx, c.z1, gap[1]-gap[0], side, false);
      }
      for (const gap of g.north||[]) this.genSideGate((gap[0]+gap[1])/2, c.z0, gap[1]-gap[0], side, false);
      for (const gap of g.east||[]) this.genSideGate(c.x1, (gap[0]+gap[1])/2, gap[1]-gap[0], side, true);
      for (const gap of g.west||[]) this.genSideGate(c.x0, (gap[0]+gap[1])/2, gap[1]-gap[0], side, true);
    }
  },
  wallRunGaps(a0, a1, b, axis, gaps){
    const sorted = gaps.slice().sort((p,q)=>p[0]-q[0]);
    let a = a0;
    let guard = 0;
    for (const g of sorted){
      while (a < g[0]-0.5 && guard++ < 10000){
        const len = Math.min(10, g[0]-a);
        const mid = a + len/2;
        if (axis==="x") SU.boxSeg("cwall", mid, 1.5, b, len, 3.0, 0.4, W.mats.stone, {});
        else SU.boxSeg("cwall", b, 1.5, mid, 0.4, 3.0, len, W.mats.stone, {});
        a += len;
      }
      a = Math.max(a, g[1]+0.5);
    }
    while (a < a1-0.5 && guard++ < 10000){
      const len = Math.min(10, a1-a);
      const mid = a + len/2;
      if (axis==="x") SU.boxSeg("cwall", mid, 1.5, b, len, 3.0, 0.4, W.mats.stone, {});
      else SU.boxSeg("cwall", b, 1.5, mid, 0.4, 3.0, len, W.mats.stone, {});
      a += len;
    }
  },
  genMainGate(cx, z, width, side){
    const letter = side==="A" ? "M" : "D";
    const tex = SU.letterTexture(letter);
    const gx0 = cx - width/2, gx1 = cx + width/2;
    // 门柱
    for (const px of [gx0, gx1]){
      SU.boxSeg("gate", px, 1.9, z, 0.9, 3.8, 0.9, W.mats.stone, {});
    }
    // 横梁 + 字母牌
    const archGeo = new THREE.Group();
    const beam = new THREE.Mesh(W.geos.box, W.mats.stone);
    beam.scale.set(width+1.8, 0.7, 0.9);
    archGeo.add(beam);
    for (const ry of [0, Math.PI]){
      const plaque = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshLambertMaterial({map:tex, transparent:true}));
      plaque.position.set(0, 0, ry===0?0.5:-0.5);
      plaque.rotation.y = ry;
      archGeo.add(plaque);
    }
    archGeo.position.set(cx, 3.55, z);
    G.scene.add(archGeo);
    const body = new CANNON.Body({mass:0, shape:new CANNON.Box(new CANNON.Vec3((width+1.8)/2, 0.4, 0.5))});
    body.position.set(cx, 3.6, z);
    body.collisionFilterGroup = 1; body.collisionFilterMask = -1;
    const seg = {
      kind:"gate", mesh:archGeo, body,
      hp:SU.hp("gate"), maxHp:SU.hp("gate"), value:SU.val("gate"),
      color:0x9a948a, size:4, dead:false, floor:0, building:null,
      onDestroyed:null,
    };
    W.addSeg(seg);
    // 铁门栅栏（两侧各留中间开口）
    const sideLen = (width-14)/2;
    if (sideLen > 1){
      for (const dir of [-1,1]){
        const base = cx + dir*(7+sideLen/2);
        const n = Math.floor(sideLen/0.42);
        for (let i=0;i<n;i++){
          const bx = base - dir*sideLen/2 + i*0.42*dir + 0.2;
          SU.boxSeg("door", bx, 1.5, z, 0.06, 3.0, 0.06, W.mats.dark, {});
        }
      }
    }
    // 门卫室×2
    this.gatehouse(cx - (width/2 + 3.2), z, side);
    this.gatehouse(cx + (width/2 + 3.2), z, side);
  },
  genSideGate(cx, z, width, side, vertical){
    // 侧门：两根门柱 + 短横梁
    for (const off of [-width/2, width/2]){
      if (vertical) SU.boxSeg("gate", cx, 1.8, z+off, 0.8, 3.6, 0.8, W.mats.stone, {});
      else SU.boxSeg("gate", cx+off, 1.8, z, 0.8, 3.6, 0.8, W.mats.stone, {});
    }
    const beam = SU.boxSeg("gate", cx, 3.3, z, vertical?0.7:width+1.4, 0.45, vertical?width+1.4:0.7, W.mats.stone, {});
  },
  gatehouse(x, z, side){
    const grp = new THREE.Group();
    const wall = new THREE.Mesh(W.geos.box, W.mats.cream);
    wall.scale.set(4, 3, 4);
    grp.add(wall);
    const win = new THREE.Mesh(W.geos.box, W.mats.glass);
    win.scale.set(3.2, 1.4, 0.08);
    win.position.set(0, 1.7, 2.05);
    grp.add(win);
    const roof = new THREE.Mesh(W.geos.box, W.mats.roof);
    roof.scale.set(4.6, 0.25, 4.6);
    roof.position.y = 3.15;
    grp.add(roof);
    grp.position.set(x, 0, z);
    G.scene.add(grp);
    const body = new CANNON.Body({mass:0, shape:new CANNON.Box(new CANNON.Vec3(2, 1.6, 2))});
    body.position.set(x, 1.6, z);
    body.collisionFilterGroup = 1; body.collisionFilterMask = -1;
    const seg = {
      kind:"gatehouse", mesh:grp, body,
      hp:SU.hp("gatehouse"), maxHp:SU.hp("gatehouse"), value:SU.val("gatehouse"),
      color:0xeee6c8, size:3, dead:false, floor:0, building:null,
      onDestroyed:(s,p)=>W.spawnDebris(p, 0.9, 0xeee6c8, new THREE.Vector3(0,1,0), 5),
    };
    W.addSeg(seg);
  },

  /* ---------- 湖（M校） ---------- */
  genLake(){
    const L = CFG.LAYOUT;
    const lk = L.lake;
    // 水面
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 28), W.mats.lake);
    water.scale.set(lk.rx, lk.rz, 1);
    water.rotation.x = -Math.PI/2;
    water.position.set(lk.cx, -0.78, lk.cz);
    G.scene.add(water);
    W.registerLake(water);
    W.addBlockerMesh(water, {kind:"water", water:true, dead:false, hp:Infinity, value:0, pos:water.position.clone()});
    // 岸边缓坡（12段）
    const n = 12;
    for (let i=0;i<n;i++){
      const a = (i/n)*Math.PI*2;
      const ex = lk.cx + Math.cos(a)*lk.rx;
      const ez = lk.cz + Math.sin(a)*lk.rz;
      const p = 0.2;
      const q3 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, 0));
      q3.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-p, 0, 0)));
      // 位置：从岸边向内 2.8m
      const px = ex - Math.cos(a)*2.8;
      const pz = ez - Math.sin(a)*2.8;
      const seg = SU.boxSeg("fieldtile", px, -0.55, pz, 3.0, 0.25, 6.0, W.mats.grass, {quat3:q3});
      seg.value = SU.val("fieldtile")*2;
    }
    // 湖心亭
    const px2 = lk.cx, pz2 = lk.cz;
    const plat = SU.boxSeg("pavilion", px2, -0.45, pz2, 7, 0.6, 7, W.mats.wood, {});
    for (const [dx,dz] of [[-2.6,-2.6],[2.6,-2.6],[-2.6,2.6],[2.6,2.6]]){
      const col = SU.boxSeg("col", px2+dx, 1.5, pz2+dz, 0.35, 3.0, 0.35, W.mats.wood, {});
    }
    const r1 = SU.boxSeg("pavilion", px2, 3.2, pz2, 8, 0.3, 8, W.mats.wood, {});
    const r2 = SU.boxSeg("pavilion", px2, 3.7, pz2, 5, 0.4, 5, W.mats.wood, {});
    // 从岸到亭的栈桥
    const brA = Math.PI*0.25;
    const bx0 = lk.cx + Math.cos(brA)*(lk.rx-2), bz0 = lk.cz + Math.sin(brA)*(lk.rz-2);
    const bx1 = px2 - Math.cos(brA)*3.6, bz1 = pz2 - Math.sin(brA)*3.6;
    const bmidX = (bx0+bx1)/2, bmidZ = (bz0+bz1)/2;
    const blen = Math.hypot(bx1-bx0, bz1-bz0);
    const ang = Math.atan2(bx1-bx0, bz1-bz0);
    const deck = SU.boxSeg("bridge", bmidX, -0.5, bmidZ, 2.4, 0.2, blen, W.mats.wood, {euler:{y:ang}});
    const rail1 = SU.boxSeg("bridge", bmidX, 0.15, bmidZ, 0.1, 0.8, blen, W.mats.wood, {euler:{y:ang}});
    // 亭子通向桥的短台阶
    const step1 = SU.boxSeg("stairs", px2 - Math.cos(brA)*2.2, -0.3, pz2 - Math.sin(brA)*2.2, 2.4, 0.25, 3, W.mats.wood, {euler:{y:ang}});
  },

  /* ---------- 球场篮架 ---------- */
  genHoops(){
    for (const c of [CFG.LAYOUT.courtsA, CFG.LAYOUT.courtsB]){
      const midZ = (c.z0+c.z1)/2;
      this.hoopGroup(c.x0+3, 0, midZ-4, Math.PI/2);
      this.hoopGroup(c.x1-3, 0, midZ-4, -Math.PI/2);
      this.hoopGroup(c.x0+3, 0, midZ+4, Math.PI/2);
      this.hoopGroup(c.x1-3, 0, midZ+4, -Math.PI/2);
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.15, c.z1-c.z0), new THREE.MeshBasicMaterial({color:0xe8e8e0}));
      line.rotation.x = -Math.PI/2;
      line.position.set((c.x0+c.x1)/2, 0.32, midZ);
      G.scene.add(line);
    }
  },

  /* ---------- 足球场看台 ---------- */
  genBleachers(){
    for (const f of [CFG.LAYOUT.fieldA, CFG.LAYOUT.fieldB]){
      for (const x of [f.x0-2.5, f.x1+2.5]){
        for (let i=0;i<4;i++){
          SU.boxSeg("bleacher", x, 0.7+i*0.85, f.z0+12+i*3.2, 2.2, 1.0, 16, W.mats.concrete, {});
        }
      }
    }
  },

  /* ---------- 停车场车辆（道具） ---------- */
  genParkingCars(){
    for (const p of [CFG.LAYOUT.parkingA, CFG.LAYOUT.parkingB]){
      const spots = [
        {x:p.x0+4, z:p.z0+4}, {x:p.x0+9.5, z:p.z0+4}, {x:p.x0+15, z:p.z0+4},
        {x:p.x0+4, z:p.z1-4}, {x:p.x0+9.5, z:p.z1-4}, {x:p.x0+15, z:p.z1-4},
      ];
      for (const s of spots){
        this.parkedCar(s.x, s.z, Math.random()>0.5?Math.PI:0);
      }
    }
  },
  parkedCar(x, z, ry){
    const grp = new THREE.Group();
    const bodyM = new THREE.Mesh(W.geos.box, W.mats.dark);
    bodyM.scale.set(4.2, 0.55, 1.8);
    bodyM.position.y = 0.72;
    grp.add(bodyM);
    const cabin = new THREE.Mesh(W.geos.box, W.mats.blue);
    cabin.scale.set(2.2, 0.55, 1.7);
    cabin.position.set(-0.3, 1.22, 0);
    grp.add(cabin);
    for (const [wx, wz] of [[-1.4,-0.95],[1.4,-0.95],[-1.4,0.95],[1.4,0.95]]){
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 8), W.mats.black);
      wheel.rotation.z = Math.PI/2;
      wheel.position.set(wx, 0.35, wz);
      grp.add(wheel);
    }
    grp.position.set(x, 0, z);
    grp.rotation.y = ry;
    G.scene.add(grp);
    const body = new CANNON.Body({mass:0, shape:new CANNON.Box(new CANNON.Vec3(2.2, 0.9, 1.0))});
    body.position.set(x, 0.9, z);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), ry);
    body.collisionFilterGroup = 1; body.collisionFilterMask = -1;
    const seg = {
      kind:"prop", mesh:grp, body,
      hp:SU.hp("prop")*5, maxHp:SU.hp("prop")*5, value:SU.val("prop")*3,
      color:0x3a6ea8, size:2.2, dead:false, floor:0, building:null,
      flammable:true, explosive:true,
      onDestroyed:(s,p)=>{
        W.explosion(p, 5, 350, 500, true);
        W.spawnDebris(p, 0.7, 0x3a6ea8, new THREE.Vector3(0,1,0), 3);
      },
    };
    W.addSeg(seg);
  },

  /* ---------- 车棚（停放自行车/电动车，不可驾驶） ---------- */
  genBikeSheds(){
    for (const s of CFG.LAYOUT.bikeSheds){
      this.bikeShed(s.x, s.z, s.ry);
    }
  },
  bikeShed(x, z, ry){
    const grp = new THREE.Group();
    const roof = new THREE.Mesh(new THREE.BoxGeometry(14, 0.25, 4.6), W.mats.dark);
    roof.position.set(0, 2.95, 0);
    roof.castShadow = true;
    grp.add(roof);
    for (const [sx, sz] of [[-6.6,-2.0],[6.6,-2.0],[-6.6,2.0],[6.6,2.0]]){
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.95, 0.22), W.mats.steel);
      pole.position.set(sx, 1.48, sz);
      grp.add(pole);
    }
    grp.position.set(x, 0, z);
    grp.rotation.y = ry;
    G.scene.add(grp);
    // 停放自行车/电动车
    const n = 6;
    for (let i=0;i<n;i++){
      const bx = x + (i - (n-1)/2)*1.6, bz = z;
      this.parkedBike(bx, bz, ry, i % 3 === 0);
    }
    const body = new CANNON.Body({mass:0, shape:new CANNON.Box(new CANNON.Vec3(7, 1.6, 2.4))});
    body.position.set(x, 2.95, z);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), ry);
    body.collisionFilterGroup = 1; body.collisionFilterMask = -1;
    const seg = {
      kind:"prop", mesh:grp, body,
      hp:SU.hp("prop")*3, maxHp:SU.hp("prop")*3, value:SU.val("prop")*3,
      color:0x3a3a42, size:3, dead:false, floor:0, building:null,
      onDestroyed:(s,p)=>W.spawnDebris(p, 0.7, 0x3a3a42, new THREE.Vector3(0,1,0), 3),
    };
    W.addSeg(seg);
  },
  parkedBike(x, z, ry, ebike){
    const grp = new THREE.Group();
    const col = ebike ? W.mats.blue : W.mats.green;
    const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,1.05,6), W.mats.dark);
    frame.rotation.x = Math.PI/2;
    frame.position.set(0, 0.68, 0);
    grp.add(frame);
    for (const s of [-1,1]){
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 14), W.mats.black);
      wheel.rotation.y = Math.PI/2;
      wheel.position.set(0, 0.42, s*0.55);
      grp.add(wheel);
    }
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 1.1), col);
    box.position.set(0, 0.78, 0);
    grp.add(box);
    grp.position.set(x, 0, z);
    grp.rotation.y = ry;
    G.scene.add(grp);
    const body2 = new CANNON.Body({mass:0, shape:new CANNON.Box(new CANNON.Vec3(0.4, 0.5, 0.6))});
    body2.position.set(x, 0.5, z);
    body2.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), ry);
    body2.collisionFilterGroup = 1; body2.collisionFilterMask = -1;
    const seg = {
      kind:"prop", mesh:grp, body:body2,
      hp:SU.hp("prop")*2, maxHp:SU.hp("prop")*2, value:SU.val("prop")*2,
      color:ebike?0x3a6ea8:0x2e7a3a, size:1.2, dead:false, floor:0, building:null,
      flammable:true, explosive:!!ebike,
      onDestroyed:(s,p)=>{
        if (ebike){
          W.explosion(p, 6, 450, 700, true); // 电动车电池爆炸
        }
        W.spawnDebris(p, 0.5, ebike?0x3a6ea8:0x2e7a3a, new THREE.Vector3(0,1,0), 3);
      },
    };
    W.addSeg(seg);
  },

  /* ---------- 道路上的模型车辆（小汽车/大货车，静态不可驾驶） ---------- */
  genRoadVehicles(){
    const rnd = (a,b)=>a+Math.random()*(b-a);
    let x = -2600;
    while (x < 2600){
      const r = Math.random();
      // 双向车道均放置车辆（数量约4-5倍）
      if (r < 0.4){
        this.parkedCar(x + rnd(-1,1), 27, 0);
        this.parkedCar(x + rnd(-1,1), 37, Math.PI);
      } else if (r < 0.75){
        this.parkedCar(x + rnd(-1,1), 28, 0);
        this.parkedCar(x + rnd(-1,1), 36, Math.PI);
      } else {
        this.roadTruck(x + rnd(0,6), 27, Math.PI);
        this.parkedCar(x + rnd(-1,1), 36, Math.PI);
      }
      x += rnd(35, 80);
    }
    let z = -2200;
    while (z < -150){
      this.parkedCar(-5 + rnd(-1,1), z, -Math.PI/2);
      this.parkedCar(5 + rnd(-1,1), z, Math.PI/2);
      z += rnd(80, 140);
    }
  },
  roadTruck(x, z, ry){
    const grp = new THREE.Group();
    const cab = new THREE.Mesh(W.geos.box, W.mats.blue);
    cab.scale.set(2.4, 2.2, 2.6);
    cab.position.set(0, 1.4, 5.6);
    cab.castShadow = false;
    grp.add(cab);
    const cargo = new THREE.Mesh(W.geos.box, W.mats.dark);
    cargo.scale.set(2.5, 2.7, 6.6);
    cargo.position.set(0, 1.65, -1.6);
    cargo.castShadow = false;
    grp.add(cargo);
    for (const [wx, wz] of [[-1.1,4.6],[1.1,4.6],[-1.1,-3.4],[1.1,-3.4],[-1.1,-5.2],[1.1,-5.2]]){
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,0.3,8), W.mats.black);
      wheel.rotation.z = Math.PI/2;
      wheel.position.set(wx, 0.5, wz);
      grp.add(wheel);
    }
    grp.position.set(x, 0, z);
    grp.rotation.y = ry;
    G.scene.add(grp);
    const body = new CANNON.Body({mass:0, shape:new CANNON.Box(new CANNON.Vec3(1.35, 1.6, 4.6))});
    body.position.set(x, 1.6, z);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), ry);
    body.collisionFilterGroup = 1; body.collisionFilterMask = -1;
    const seg = {
      kind:"prop", mesh:grp, body,
      hp:SU.hp("prop")*7, maxHp:SU.hp("prop")*7, value:SU.val("prop")*5,
      color:0x3a6ea8, size:4.5, dead:false, floor:0, building:null,
      flammable:true, explosive:true,
      onDestroyed:(s,p)=>{
        W.explosion(p, 8, 550, 900, true);
        W.spawnDebris(p, 0.8, 0x3a6ea8, new THREE.Vector3(0,1,0), 5);
      },
    };
    W.addSeg(seg);
  },

  /* ---------- 加油站 / 加气站（6所，随机分布在校围墙四周） ---------- */
  genGasStations(){
    G.gasStations = [];
    const camps = [CFG.LAYOUT.campusA, CFG.LAYOUT.campusB];
    for (const c of camps){
      const placed = [];
      let guard = 0;
      while (placed.length < 3 && guard++ < 200){
        const side = Math.floor(Math.random()*4); // 0北 1南 2东 3西
        const kind = Math.random() < 0.5 ? "gas" : "cng";
        const off = 20 + Math.random()*12; // 离围墙距离
        let x, z, ry;
        if (side === 0){ x = c.x0 + 80 + Math.random()*(c.x1-c.x0-160); z = c.z0 - off; ry = 0; }
        else if (side === 1){ x = c.x0 + 80 + Math.random()*(c.x1-c.x0-160); z = c.z1 + off; ry = Math.PI; }
        else if (side === 2){ x = c.x1 + off; z = c.z0 + 80 + Math.random()*(c.z1-c.z0-160); ry = -Math.PI/2; }
        else { x = c.x0 - off; z = c.z0 + 80 + Math.random()*(c.z1-c.z0-160); ry = Math.PI/2; }
        if (placed.some(p => Math.hypot(p.x-x, p.z-z) < 240)) continue;
        placed.push({x, z});
        G.gasStations.push({x, z, ry, kind});
      }
    }
    for (const g of G.gasStations) g.seg = this.gasStation(g.x, g.z, g.ry, g.kind);
  },
  gasStation(x, z, ry, kind){
    const isGas = kind === "gas";
    const grp = new THREE.Group();
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(20, 0.35, 9), W.mats.dark);
    canopy.position.set(0, 4.6, 0);
    canopy.castShadow = true;
    grp.add(canopy);
    for (const [px, pz] of [[-9,3.5],[9,3.5],[-9,-3.5],[9,-3.5]]){
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.6, 0.3), W.mats.steel);
      pole.position.set(px, 2.3, pz);
      grp.add(pole);
    }
    for (const [px, pz] of [[-5,0],[5,0]]){
      const pump = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.0, 0.8), isGas ? W.mats.red : W.mats.green);
      pump.position.set(px, 1.0, pz);
      grp.add(pump);
    }
    const signTex = (()=>{
      const c = document.createElement("canvas");
      c.width = 512; c.height = 128;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#e8c85a";
      ctx.font = "bold 76px 'Microsoft YaHei', sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("A市石化", 256, 66);
      return new THREE.CanvasTexture(c);
    })();
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.2), new THREE.MeshLambertMaterial({map: signTex}));
    sign.position.set(0, 5.6, 0);
    grp.add(sign);
    grp.scale.setScalar(5); // 加油站整体放大5倍
    grp.position.set(x, 0, z);
    grp.rotation.y = ry;
    G.scene.add(grp);
    const body = new CANNON.Body({mass:0, shape:new CANNON.Box(new CANNON.Vec3(50, 12.5, 23))});
    body.position.set(x, 23, z);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), ry);
    body.collisionFilterGroup = 1; body.collisionFilterMask = -1;
    const seg = {
      kind:"prop", mesh:grp, body,
      hp:SU.hp("prop")*4, maxHp:SU.hp("prop")*4, value:SU.val("prop")*4,
      color:0x3a3a42, size:6, dead:false, floor:0, building:null,
      onDestroyed:(s,p)=>W.spawnDebris(p, 0.8, 0x3a3a42, new THREE.Vector3(0,1,0), 4),
    };
    W.addSeg(seg);
    // 储罐（油罐/气罐，可引爆）
    if (isGas){
      this.fuelTank(x - 35, z - 40, ry, 250);
      this.fuelTank(x + 35, z - 40, ry, 250);
    } else {
      this.gasTank(x - 35, z - 40, ry, 300);
      this.gasTank(x + 35, z - 40, ry, 300);
    }
    return seg;
  },
  fuelTank(x, z, ry, boomR){
    // 卧式油罐
    const grp = new THREE.Group();
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 8, 12), W.mats.light);
    tank.rotation.z = Math.PI/2;
    tank.position.set(0, 2.0, 0);
    grp.add(tank);
    for (const s of [-1,1]){
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8), W.mats.light);
      cap.position.set(s*4, 2.0, 0);
      grp.add(cap);
    }
    for (const sx of [-2.6, 2.6]){
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.5, 0.3), W.mats.steel);
      leg.position.set(sx, 0.75, 0);
      grp.add(leg);
    }
    grp.scale.setScalar(5); // 油罐放大5倍
    grp.position.set(x, 0, z);
    grp.rotation.y = ry;
    G.scene.add(grp);
    const body = new CANNON.Body({mass:0, shape:new CANNON.Box(new CANNON.Vec3(21, 9, 9))});
    body.position.set(x, 10, z);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), ry);
    body.collisionFilterGroup = 1; body.collisionFilterMask = -1;
    const seg = {
      kind:"prop", mesh:grp, body,
      hp:SU.hp("prop")*5, maxHp:SU.hp("prop")*5, value:SU.val("prop")*8,
      color:0xd8d8d0, size:4.5, dead:false, floor:0, building:null,
      flammable:true, explosive:true, bigBoom:true, boomR,
      onDestroyed:(s,p)=>{ W.bigExplosion(p, s.boomR||250, 6000, 8000); },
    };
    W.addSeg(seg);
  },
  gasTank(x, z, ry, boomR){
    // 球形气罐
    const grp = new THREE.Group();
    const tank = new THREE.Mesh(new THREE.SphereGeometry(2.2, 14, 10), W.mats.green);
    tank.position.set(0, 2.6, 0);
    grp.add(tank);
    for (const sx of [-1.2, 1.2]){
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.0, 0.3), W.mats.steel);
      leg.position.set(sx, 1.0, 0);
      grp.add(leg);
    }
    grp.scale.setScalar(5); // 气罐放大5倍
    grp.position.set(x, 0, z);
    grp.rotation.y = ry;
    G.scene.add(grp);
    const body = new CANNON.Body({mass:0, shape:new CANNON.Sphere(11.5)});
    body.position.set(x, 13, z);
    body.collisionFilterGroup = 1; body.collisionFilterMask = -1;
    const seg = {
      kind:"prop", mesh:grp, body,
      hp:SU.hp("prop")*5, maxHp:SU.hp("prop")*5, value:SU.val("prop")*8,
      color:0x2e7a3a, size:4.5, dead:false, floor:0, building:null,
      flammable:true, explosive:true, bigBoom:true, boomR,
      onDestroyed:(s,p)=>{ W.bigExplosion(p, s.boomR||300, 8000, 10000); },
    };
    W.addSeg(seg);
  },

  /* ---------- 防护大阵（校区防御远程轰炸的穹顶护盾） ---------- */
  genFormations(){
    G.formations = [];
    for (const c of [CFG.LAYOUT.campusA, CFG.LAYOUT.campusB]){
      const cx = (c.x0+c.x1)/2, cz = (c.z0+c.z1)/2;
      const rx = (c.x1-c.x0)/2, rz = (c.z1-c.z0)/2;
      const radius = Math.hypot(rx, rz);
      const f = {
        pos: new THREE.Vector3(cx, 0, cz),
        x0: c.x0, x1: c.x1, z0: c.z0, z1: c.z1, // 矩形覆盖（不覆盖围墙外的加油站）
        radius, maxEnergy: 1200, energy: 1200,
        down: false, downT: 0,
      };
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 24, 12, 0, Math.PI*2, 0, Math.PI/2),
        new THREE.MeshBasicMaterial({color:0x40c8e0, transparent:true, opacity:0.13, side:THREE.DoubleSide, depthWrite:false})
      );
      dome.position.set(cx, 0, cz);
      G.scene.add(dome);
      f.dome = dome;
      G.formations.push(f);
    }
  },

  /* ---------- 防空系统（校区+加油站，概率拦截远程武器，可摧毁） ---------- */
  genAirDefense(){
    G.airDefense = [];
    for (const c of [CFG.LAYOUT.campusA, CFG.LAYOUT.campusB]){
      const cx = (c.x0+c.x1)/2;
      this.aaTurret(cx, c.z0 - 8, 0);         // 北门
      this.aaTurret(cx, c.z1 + 8, Math.PI);   // 南门
    }
    for (const g of G.gasStations){
      this.aaTurret(g.x, g.z + 10, g.ry);
    }
  },
  aaTurret(x, z, ry){
    const grp = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 2.0, 8), W.mats.steel);
    base.position.set(0, 1.0, 0);
    grp.add(base);
    const turret = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 1.2), W.mats.dark);
    turret.position.set(0, 2.4, 0);
    grp.add(turret);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.0, 6), W.mats.dark);
    barrel.rotation.x = Math.PI/2;
    barrel.position.set(0, 2.4, 1.8);
    grp.add(barrel);
    grp.position.set(x, 0, z);
    grp.rotation.y = ry;
    G.scene.add(grp);
    const body = new CANNON.Body({mass:0, shape:new CANNON.Box(new CANNON.Vec3(1.3, 2.2, 1.3))});
    body.position.set(x, 2.2, z);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), ry);
    body.collisionFilterGroup = 1; body.collisionFilterMask = -1;
    const seg = {
      kind:"prop", mesh:grp, body,
      hp:SU.hp("prop")*8, maxHp:SU.hp("prop")*8, value:SU.val("prop")*25,
      color:0x7a8290, size:3, dead:false, floor:0, building:null,
      onDestroyed:(s,p)=>W.spawnDebris(p, 0.6, 0x7a8290, new THREE.Vector3(0,1,0), 4),
    };
    W.addSeg(seg);
    G.airDefense.push({ pos: new THREE.Vector3(x, 3, z), range: 420, cooldown: 0, seg });
  },

  /* ---------- 足球场（每校一座，含标线+球门） ---------- */
  genSoccerField(){
    for (const f of [CFG.LAYOUT.fieldA, CFG.LAYOUT.fieldB]){
      const white = new THREE.MeshBasicMaterial({color:0xe8e8e0});
      const cx = (f.x0+f.x1)/2, cz = (f.z0+f.z1)/2;
      const L = (x1,z1,x2,z2)=>{
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.22, Math.hypot(x2-x1, z2-z1)), white);
        m.rotation.x = -Math.PI/2;
        m.rotation.z = Math.atan2(x2-x1, z2-z1);
        m.position.set((x1+x2)/2, 0.32, (z1+z2)/2);
        G.scene.add(m);
      };
      const x0 = f.x0+4, x1 = f.x1-4, z0 = f.z0+4, z1 = f.z1-4;
      L(x0,z0,x1,z0); L(x1,z0,x1,z1); L(x1,z1,x0,z1); L(x0,z1,x0,z0);
      L(cx,z0,cx,z1);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(9.15, 0.22, 6, 48), white);
      ring.rotation.x = Math.PI/2;
      ring.position.set(cx, 0.34, cz);
      G.scene.add(ring);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.4, 12), white);
      dot.rotation.x = -Math.PI/2;
      dot.position.set(cx, 0.33, cz);
      G.scene.add(dot);
      const pw = 40, pd = 16;
      L(cx-pw/2,z0,cx-pw/2,z0+pd); L(cx-pw/2,z0+pd,cx+pw/2,z0+pd); L(cx+pw/2,z0+pd,cx+pw/2,z0);
      L(cx-pw/2,z1,cx-pw/2,z1-pd); L(cx-pw/2,z1-pd,cx+pw/2,z1-pd); L(cx+pw/2,z1-pd,cx+pw/2,z1);
      // 球门（7.32m宽）
      this.goalPair(cx, z0+0.6, 0);
      this.goalPair(cx, z1-0.6, Math.PI);
    }
  },
  goalPair(x, z, ry){
    const grp = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({color:0xe8e8e0});
    for (const dx of [-3.66, 3.66]){
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 2.44, 6), mat);
      post.position.set(dx, 1.22, 0);
      grp.add(post);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 7.32, 6), mat);
    bar.rotation.z = Math.PI/2;
    bar.position.set(0, 2.44, 0);
    grp.add(bar);
    const net = new THREE.Mesh(new THREE.BoxGeometry(7.3, 2.3, 1.6), new THREE.MeshLambertMaterial({color:0x3a3a3a, transparent:true, opacity:0.3}));
    net.position.set(0, 1.1, -0.9);
    grp.add(net);
    grp.position.set(x, 0, z);
    grp.rotation.y = ry;
    G.scene.add(grp);
    const body = new CANNON.Body({mass:0, shape:new CANNON.Box(new CANNON.Vec3(3.7, 1.3, 0.5))});
    body.position.set(x, 1.3, z);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), ry);
    body.collisionFilterGroup = 1; body.collisionFilterMask = -1;
    const seg = {
      kind:"goal", mesh:grp, body,
      hp:SU.hp("goal"), maxHp:SU.hp("goal"), value:SU.val("goal"),
      color:0xe8e8e0, size:2.6, dead:false, floor:0, building:null,
      onDestroyed:(s,p)=>W.spawnDebris(p, 0.5, 0xe8e8e0, new THREE.Vector3(0,1,0), 3),
    };
    W.addSeg(seg);
  },

  /* ---------- 密集填充楼（每校100栋，单刚体低开销） ---------- */
  blockTextures(){
    if (this._blockTex) return this._blockTex;
    const cols = ["#b8b0a0", "#a89080", "#c0c0c8", "#9aa8b0"];
    const texs = [];
    for (const col of cols){
      const c = document.createElement("canvas");
      c.width = 256; c.height = 256;
      const ctx = c.getContext("2d");
      ctx.fillStyle = col;
      ctx.fillRect(0,0,256,256);
      // 窗格
      for (let r=0;r<6;r++){
        for (let q=0;q<5;q++){
          ctx.fillStyle = "#2a3a4a";
          ctx.fillRect(14+q*48, 14+r*40, 26, 20);
        }
      }
      // 楼层线
      ctx.strokeStyle = "rgba(0,0,0,.18)";
      ctx.lineWidth = 2;
      for (let r=0;r<=6;r++){
        ctx.beginPath(); ctx.moveTo(0, r*40+4); ctx.lineTo(256, r*40+4); ctx.stroke();
      }
      texs.push(new THREE.CanvasTexture(c));
    }
    this._blockTex = texs;
    return texs;
  },
  genBlocks(){
    const L = CFG.LAYOUT;
    const texs = this.blockTextures();
    const mats = texs.map(t=>new THREE.MeshLambertMaterial({map:t}));
    const placed = [];
    for (const c of [L.campusA, L.campusB]){
      const target = c.side === "A" ? L.blocks.A : L.blocks.B;
      let n = 0, guard = 0;
      while (n < target && guard++ < 9000){
        const x = c.x0 + 40 + Math.random()*(c.x1-c.x0-80);
        const z = c.z0 + 40 + Math.random()*(c.z1-c.z0-80);
        if (this.blockBlocked(x, z, placed)) continue;
        this.fillerBlock(x, z, mats[Math.floor(Math.random()*mats.length)]);
        placed.push({x, z});
        n++;
      }
      if (window.__stopLoop) console.log("[B] blocks", c.side, n);
    }
  },
  blockBlocked(x, z, placed){
    const L = CFG.LAYOUT;
    const near = (bx, bz, r)=> Math.abs(x-bx) < r && Math.abs(z-bz) < r;
    for (const b of L.buildings){
      if (Math.abs(x-b.cx) < b.w/2 + 38 && Math.abs(z-b.cz) < b.d/2 + 38) return true;
    }
    for (const f of [L.fieldA, L.fieldB, L.courtsA, L.courtsB, L.parkingA, L.parkingB]){
      if (x > f.x0-26 && x < f.x1+26 && z > f.z0-26 && z < f.z1+26) return true;
    }
    const lk = L.lake;
    const ex = (x-lk.cx)/lk.rx, ez = (z-lk.cz)/lk.rz;
    if (ex*ex + ez*ez < 1.15) return true;
    for (const p of L.portals){ if (near(p.x, p.z, 28)) return true; }
    if (near(L.bosses.big.x, L.bosses.big.z, 32)) return true;
    for (const m of L.bosses.mid){ if (near(m.x, m.z, 30)) return true; }
    for (const m of L.bosses.mini){ if (near(m.x, m.z, 24)) return true; }
    // 围墙与已放置楼
    for (const c of [L.campusA, L.campusB]){
      if (x > c.x0-30 && x < c.x1+30 && z > c.z0-30 && z < c.z1+30){
        if (x < c.x0+32 || x > c.x1-32 || z < c.z0+32 || z > c.z1-32) return true;
      }
    }
    for (const p of placed){
      if (Math.abs(x-p.x) < 56 && Math.abs(z-p.z) < 56) return true;
    }
    return false;
  },
  fillerBlock(x, z, mat){
    const floors = 2 + Math.floor(Math.random()*3);
    // 底面积增至4倍（宽度/进深各×2），层高4米
    const w = 40 + Math.random()*28, d = 28 + Math.random()*20, h = floors*this.FH;
    const ry = Math.random() < 0.5 ? 0 : Math.PI/2;
    const grp = new THREE.Group();
    const box = new THREE.Mesh(W.geos.box, mat);
    box.scale.set(w, h, d);
    box.position.y = h/2;
    box.castShadow = false; box.receiveShadow = true;
    grp.add(box);
    const roof = new THREE.Mesh(W.geos.box, W.mats.roof);
    roof.scale.set(w+0.5, 0.3, d+0.5);
    roof.position.y = h + 0.15;
    roof.castShadow = false; roof.receiveShadow = true;
    grp.add(roof);
    grp.position.set(x, 0, z);
    grp.rotation.y = ry;
    G.scene.add(grp);
    const bw = ry === 0 ? w : d, bd = ry === 0 ? d : w;
    const body = new CANNON.Body({mass:0, shape:new CANNON.Box(new CANNON.Vec3(bw/2, h/2, bd/2))});
    body.position.set(x, h/2, z);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), ry);
    body.collisionFilterGroup = 1; body.collisionFilterMask = -1;
    const seg = {
      kind:"block", mesh:grp, body,
      hp:SU.hp("block"), maxHp:SU.hp("block"), value:SU.val("block"),
      color:mat.map ? 0x9aa0a8 : 0x9aa0a8, size:(w+d+h)/3, dead:false, floor:0, building:null,
      onDestroyed:(s,p)=>{
        // 整栋坍塌
        FX.shake(1.0);
        FX.burst(p, 0x8a8578, 10, 4, 0.9);
        W.spawnDebris(p, 1.0, 0x9a948a, new THREE.Vector3(0,1,0), 6);
        W.spawnDebris(new THREE.Vector3(p.x+3, p.y+2, p.z-3), 1.0, 0x8a848a, new THREE.Vector3(0.5,1,0.2), 6);
        Audio.explosion(false);
      },
    };
    W.addSeg(seg);
  },
};

/* ---------- 合并盒子几何 ---------- */
function mergedBoxes(list){  const g = new THREE.BufferGeometry();
  const pos = [];
  const idx = [];
  const box = new THREE.BoxGeometry(1,1,1);
  const bp = box.attributes.position.array;
  const bi = box.index.array;
  let off = 0;
  for (const b of list){
    for (let i=0;i<bp.length;i+=3){
      pos.push(bp[i]*b.sx + b.x, bp[i+1]*b.sy + b.y, bp[i+2]*b.sz + b.z);
    }
    for (let i=0;i<bi.length;i++) idx.push(bi[i]+off);
    off += bp.length/3;
  }
  box.dispose();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
