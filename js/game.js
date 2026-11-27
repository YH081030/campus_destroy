/* ============================================================
 * 主循环 / 游戏状态 / 胜负判定
 * ============================================================ */
"use strict";
const Game = window.Game = {
  inited: false,
  _vehIdx: 0,

  init(){
    if (this.inited) return;
    this.inited = true;
    W.init();
    FX.init();
    Audio.init();
    Input.init(G.renderer.domElement);
    UI.init();
    Eco.load();
    // 异常退出/切后台时保存进度
    const _saveExit = ()=>{ try{ Eco.save(); }catch(e){} };
    window.addEventListener("beforeunload", _saveExit);
    window.addEventListener("pagehide", _saveExit);
    document.addEventListener("visibilitychange", ()=>{ if (document.hidden) _saveExit(); });
    GAuth.init();
    UI.refreshAccount();
    G.player = PlayerC;
    UI.showMenu();
    G.clock = new THREE.Clock();

    // 调试模式：?sim=帧数（无渲染跑逻辑）/ ?shot=1（渲染单帧后停止）
    const q = new URLSearchParams(location.search);
    if (q.get("sim") || q.get("shot") || q.get("test")){
      G.renderer.shadowMap.enabled = false;
      G.renderer.setPixelRatio(0.25);
      G.renderer.setSize(320, 180);
      window.__stopLoop = true;
      setTimeout(()=>{
        try{
          const t0 = performance.now();
          console.log("[SIM] build start");
          this.startRun();
          window.__simPhase = {phase:"build", ms: Math.round(performance.now()-t0)};
          console.log("[SIM] build done", Math.round(performance.now()-t0), "ms");
          setTimeout(()=>{
            const t1 = performance.now();
            try{
              if (q.get("sim")){
                const n = parseInt(q.get("sim")) || 60;
                for (let i=0;i<n;i++){
                  this.tick(1/60);
                  if (i % 20 === 19) console.log("[SIM] tick", i+1, Math.round(performance.now()-t1), "ms");
                }
                window.__sim = {
                  ok:true, ms: Math.round(performance.now()-t1),
                  state: G.state, npcs: NPCs.count(), segs: W.segs.length,
                  debris: W.debrisCount, dmg: Math.round(G.run.damageValue),
                  hp: Math.round(G.player.hp), portals: Portals.destroyed(),
                };
                console.log("[SIM] done", JSON.stringify(window.__sim));
              } else if (q.get("test")){
                // 自动破坏测试：RPG轰墙 + 手榴弹 + 步枪（M校教学楼1南墙）
                G.player.pos.set(850, 0, -432);
                G.player.yaw = Math.PI; G.player.pitch = 0;
                Eco.owned.weapons = ["knife","bat","pistol","smg","shotgun","rifle","sniper","lmg","rpg","missile"];
                Eco.ammo.rocket = 20; Eco.ammo.rifle = 300; Eco.ammo.grenade = 5;
                Weapons.init();
                Weapons.switchTo("rpg");
                for (let k=0;k<6;k++){
                  Weapons.mag = 1;
                  Weapons.fireProjectileWeapon(CFG.WEAPONS.rpg);
                  for (let i=0;i<10;i++) this.tick(1/60);
                }
                for (let k=0;k<3;k++){
                  Weapons.throwGrenade();
                  for (let i=0;i<100;i++) this.tick(1/60);
                }
                Weapons.switchTo("rifle"); Weapons.mag = 30;
                for (let k=0;k<24;k++){
                  Weapons.fireGun(CFG.WEAPONS.rifle);
                }
                for (let i=0;i<150;i++) this.tick(1/60);
                window.__sim = {
                  ok:true, test:true, ms: Math.round(performance.now()-t1),
                  dmg: Math.round(G.run.damageValue),
                  segs: W.segs.length, debris: W.debrisCount,
                  npcs: NPCs.count(), hp: Math.round(G.player.hp),
                  kills: G.run.kills, money: Math.round(Eco.money),
                };
                console.log("[TEST] done", JSON.stringify(window.__sim));
              } else {
                G.renderer.render(G.scene, G.camera);
                window.__shot = {ok:true, ms: Math.round(performance.now()-t1)};
                console.log("[SHOT] done", Math.round(performance.now()-t1), "ms");
              }
            }catch(e){
              window.__sim = {ok:false, err:String(e && e.stack || e)};
              console.error("[SIM] ERR", String(e && e.stack || e));
            }
          }, 30);
        }catch(e){
          window.__sim = {ok:false, buildErr:String(e && e.stack || e)};
          console.error("[SIM] BUILD ERR", String(e && e.stack || e));
        }
      }, 100);
    } else {
      this.loop();
    }

    G.renderer.domElement.addEventListener("click", ()=>{
      if (G.state === "run" && !G.paused && !G.player.dead) Input.requestLock();
    });
    Input.onUnlock = ()=>{
      if (G.state === "run" && !G.paused && G.player && !G.player.dead){
        this.pause();
      }
    };
    const q2 = new URLSearchParams(location.search);
    if (q2.get("auto")){
      setTimeout(()=>{ Audio.init(); Audio.resume(); this.startRun(); }, 600);
    }
  },

  loop(){
    if (window.__stopLoop) return;
    requestAnimationFrame(()=>this.loop());
    const dt = Math.min(0.05, G.clock.getDelta());
    G.time += dt;
    if (G.state === "run" && !G.paused){
      this.tick(dt);
    }
    // 暂停菜单 Esc 恢复
    if (G.paused && Input.keyPressed("Escape")){
      const shop = document.getElementById("shop");
      const upg = document.getElementById("upg");
      const pauseEl = document.getElementById("pause");
      const mt = document.getElementById("missile-target");
      if (mt && !mt.classList.contains("hidden")){ UI.closeMissileTarget(); }
      else if (!shop.classList.contains("hidden")){ shop.classList.add("hidden"); this.resume(); }
      else if (!upg.classList.contains("hidden")){ upg.classList.add("hidden"); this.resume(); }
      else if (!pauseEl.classList.contains("hidden")){ this.resume(); }
    }
    FX.update(dt);
    if (G.sky) G.sky.position.copy(G.camera.position);
    G.renderer.render(G.scene, G.camera);
    UI.update(dt);
    Input.endFrame();
  },

  tick(dt){
    if (G.state !== "run" || !G.run) return;
    Input.poll(dt);
    G.__stepping = true;
    G.world.step(1/20, dt, 2);
    G.__stepping = false;
    W._flushRm();
    // 被动收益
    const passive = Eco.passivePerSec();
    if (passive > 0){
      Eco.money += passive*dt;
      G.run.passiveEarned += passive*dt;
    }
    // 周期自动保存（每5秒，确保被动收益不丢失）
    this._saveTimer = (this._saveTimer||0) - dt;
    if (this._saveTimer <= 0){ this._saveTimer = 5; Eco.save(); }
    PlayerC.update(dt);
    Weapons.update(dt);
    Skills.update(dt);
    NPCs.update(dt);
    Portals.update(dt);
    Vehicles.update(dt);
    W.updateDebris(dt);
    W.updateFires(dt);
    W.updateDefenses(dt);
    this.checkWin();
    if (Input.keyPressed("Escape")) this.pause();
    if (Input.keyPressed("KeyB")) UI.openShop();
    if (Input.keyPressed("KeyV")) this.vehicleMenu();
    // 转职技能快捷键（遍历所有带按键的技能）
    for (const [id, s] of Object.entries(CFG.SKILLS)){
      if (s.key && Input.keyPressed(s.key)) Skills.tryCast(id);
    }
    if (Input.keyPressed("KeyH")) UI.toggleTouchUI();
    // 传送（30秒冷却，5秒施法，地图选点）
    if (Input.keyPressed("Backquote")) this.startTeleport();
    if (G.player.teleporting){
      G.player.teleportT -= dt;
      if (G.player.teleportT <= 0){
        G.player.teleporting = false;
        UI.openTeleportTarget();
      }
    }
    if (G.player.teleportCd > 0) G.player.teleportCd -= dt;
    // 载具骑乘快捷键：E 上车（12米内）/ 下车
    if (Input.keyPressed("KeyE")){
      if (Vehicles.cur){
        Vehicles.exit();
      } else {
        const v = Vehicles.nearest(12);
        if (v) Vehicles.enter(v);
        else UI.toast("附近没有可骑乘的载具（按 V 部署，商店购买）", "warn");
      }
    }
    // 上车
    const nearV = Vehicles.nearest();
    if (nearV){
      UI.interactText = `[F] / [E] 驾驶 ${nearV.def.name}`;
      if (Input.keyPressed("KeyF")) Vehicles.enter(nearV);
    }
  },

  vehicleMenu(){
    const kinds = Object.keys(CFG.VEHICLES).filter(k=> (Eco.owned.vehicles[k]||0) > 0);
    if (!kinds.length){ UI.toast("车库为空（商店购买载具）", "warn"); return; }
    this._vehIdx = (this._vehIdx + 1) % kinds.length;
    Vehicles.deploy(kinds[this._vehIdx]);
  },

  startTeleport(){
    if (G.state !== "run" || G.player.dead) return;
    if (G.player.teleportCd > 0){ UI.toast(`传送冷却中 ${Math.ceil(G.player.teleportCd)}s`, "warn"); return; }
    if (G.player.teleporting) return;
    G.player.teleporting = true;
    G.player.teleportT = 5;
    UI.toast("传送施法中（5秒）...", "warn");
  },
  teleportTo(x, z){
    for (const f of G.formations || []){
      if (x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1){
        UI.toast("目标在大阵保护范围内，无法传送", "warn");
        return;
      }
    }
    const gy = W.groundHeightStatic(x, z, 300);
    G.player.pos.set(x, Math.max(0, gy) + 1, z);
    G.player.vy = 0;
    G.player.teleportCd = 30;
    FX.burst(G.player.pos.clone().setY(G.player.pos.y+1), 0x80d0ff, 16, 5, 0.9);
    UI.toast("传送成功！", "warn");
    Audio.click();
  },

  checkWin(){
    if (G.run.bigWin) return;
    if (NPCs.allDead() && Portals.destroyed() >= 12){
      G.run.bigWin = true;
      UI.banner("大胜！", "全部怪物已消灭，全部裂隙已摧毁。可继续驻留或随时撤离结算。", 5);
      UI.toast("达成大胜！可通过任意撤离门结算。", "warn");
      Audio.bossRoar();
    }
  },

  pause(){
    if (G.state !== "run" || G.paused) return;
    G.paused = true;
    document.getElementById("pause").classList.remove("hidden");
    if (Input.locked) document.exitPointerLock && document.exitPointerLock();
    Audio.engine(false);
  },
  resume(){
    if (G.state !== "run") return;
    G.paused = false;
    document.getElementById("pause").classList.add("hidden");
    document.getElementById("shop").classList.add("hidden");
    document.getElementById("upg").classList.add("hidden");
    if (G.player && !G.player.dead) Input.requestLock();
  },

  startRun(){
    document.getElementById("menu").classList.add("hidden");
    document.getElementById("hud").classList.remove("hidden");
    document.getElementById("settle").classList.add("hidden");
    document.getElementById("banner").classList.add("hidden");
    const dbg = (s)=>{ if (window.__stopLoop) console.log("[BUILD]", s); };
    // 地图分步异步构建：避免单帧长时间卡顿（游戏开始前预生成）
    const steps = [
      ["清理世界", ()=>{ W.reset(); }],
      ["生成地面", ()=>{ Ground.build(); }],
      ["生成道具", ()=>{ Props.build(); }],
      ["生成建筑", ()=>{ Buildings.build(); }],
      ["生成裂隙", ()=>{ Portals.build(); }],
      ["生成怪物", ()=>{ NPCs.build(); }],
      ["初始化",     ()=>{ Eco.resetRun(); PlayerC.init(); Weapons.init(); Skills.init(); Vehicles.reset(); }],
    ];
    let i = 0;
    const next = ()=>{
      if (i >= steps.length){ this._finishRun(); return; }
      const name = steps[i][0], fn = steps[i][1];
      i++;
      dbg(name);
      if (window.__stopLoop){ fn(); next(); return; } // 无渲染回归：同步构建
      this._loadingPct(i/steps.length, name);
      setTimeout(()=>{ fn(); next(); }, 12);
    };
    if (!window.__stopLoop){
      document.getElementById("loading").classList.remove("hidden");
      this._loadingPct(0, "准备中");
    }
    next();
  },

  _loadingPct(pct, text){
    const f = document.getElementById("load-fill");
    if (f) f.style.width = Math.round(pct*100)+"%";
    const t = document.getElementById("load-text");
    if (t) t.textContent = text || "";
  },

  _finishRun(){
    document.getElementById("loading").classList.add("hidden");
    G.state = "run";
    G.paused = false;
    G.camShake = 0;
    UI.refreshMoney();
    // 手机触控模式
    if (Input.isTouch){
      document.getElementById("touchui").classList.remove("hidden");
      Input.autoFire = false;
      Input.updateFireBtn();
      G.renderer.shadowMap.enabled = false;
      G.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 1.2));
      G.renderer.setSize(innerWidth, innerHeight);
      if (screen.orientation && screen.orientation.lock){
        screen.orientation.lock("landscape").catch(()=>{});
      }
    }
    UI.banner("行动开始", `${CFG.DIFFS[G.diff].name} ${CFG.DIFFS[G.diff].lv} · 目标区域：M校 / D校`, 4);
    UI.toast("消灭全部怪物并摧毁12座裂隙 = 大胜；撤离门可随时结算");
    Audio.init(); Audio.resume();
    Input.requestLock();
  },

  endRun(kind){
    if (G.state !== "run" && G.state !== "over") return;
    G.state = "over";
    G.paused = true;
    Audio.engine(false);
    if (Input.locked) document.exitPointerLock && document.exitPointerLock();
    let k = kind;
    if (kind === "exit" && G.run.bigWin) k = "bigwin";
    const s = Eco.settle(k);
    // 上传排行榜（尽力而为）
    GAuth.submitScore({
      dmg: s.damageValue,
      kills: s.kills,
      diff: CFG.DIFFS[G.diff].id,
      bigWin: k === "bigwin",
    });
    document.getElementById("hud").classList.add("hidden");
    document.getElementById("touchui").classList.add("hidden");
    document.getElementById("banner").classList.add("hidden");
    setTimeout(()=>{
      W.reset();
      Vehicles.reset();
      UI.settlement(s);
    }, 250);
  },
};

window.addEventListener("DOMContentLoaded", ()=>Game.init());
