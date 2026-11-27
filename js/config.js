/* ============================================================
 * 学园破拆 —— 全局配置
 * 完全虚构场景：M校（直径2km，初中部，含宿舍与湖）、D校（直径1.5km，高中部，无宿舍）
 * 两校区由一条 5.4km 长主干道连接；各4栋以上教学楼+足球场；侧门+可翻越围墙
 * ============================================================ */
"use strict";
const CFG = {
  gameTitle: "学园破拆",
  subTitle: "目标区域：M校 · D校 —— 异化裂隙入侵，受雇全面拆除",

  /* ---------------- 难度 ---------------- */
  DIFFS: [
    { id:"F",   name:"F",   lv:"普通", ratio:0.10, bhp:0.70, bval:0.70, nhp:0.70, ndmg:0.60, nspd:0.90, init:200, spawnT:4.0 },
    { id:"E",   name:"E",   lv:"进阶", ratio:0.15, bhp:0.80, bval:0.80, nhp:0.80, ndmg:0.75, nspd:0.95, init:260, spawnT:3.5 },
    { id:"D",   name:"D",   lv:"困难", ratio:0.20, bhp:0.90, bval:0.90, nhp:0.90, ndmg:0.90, nspd:1.00, init:320, spawnT:3.0 },
    { id:"C",   name:"C",   lv:"困难+",ratio:0.26, bhp:1.00, bval:1.00, nhp:1.00, ndmg:1.00, nspd:1.02, init:400, spawnT:2.6 },
    { id:"B",   name:"B",   lv:"噩梦", ratio:0.32, bhp:1.15, bval:1.12, nhp:1.15, ndmg:1.10, nspd:1.05, init:500, spawnT:2.2 },
    { id:"A",   name:"A",   lv:"炼狱", ratio:0.42, bhp:1.35, bval:1.25, nhp:1.35, ndmg:1.25, nspd:1.08, init:600, spawnT:1.8 },
    { id:"S",   name:"S",   lv:"修罗", ratio:0.52, bhp:1.60, bval:1.40, nhp:1.60, ndmg:1.45, nspd:1.12, init:720, spawnT:1.5 },
    { id:"SS",  name:"SS",  lv:"修罗+",ratio:0.64, bhp:1.90, bval:1.60, nhp:1.90, ndmg:1.70, nspd:1.18, init:840, spawnT:1.2 },
    { id:"SSS", name:"SSS", lv:"地狱", ratio:0.80, bhp:2.30, bval:1.85, nhp:2.30, ndmg:2.00, nspd:1.26, init:1000, spawnT:1.0 },
    { id:"SSS+",name:"SSS+",lv:"深渊", ratio:1.00, bhp:3.00, bval:2.20, nhp:3.00, ndmg:2.50, nspd:1.35, init:1200, spawnT:0.8 },
  ],

  /* ---------------- 武器 ---------------- */
  WEAPONS: {
    knife:   { name:"战术小刀",   slot:1, melee:true,  dmg:25, reach:2.2, rate:0.35, price:50 },
    bat:     { name:"棒球棍",     slot:2, melee:true,  dmg:55, reach:2.7, rate:0.55, price:150 },
    sword:   { name:"长剑",       slot:11, melee:true, dmg:95, reach:3.4, rate:0.5,  price:1600 },
    staff:   { name:"法杖",       slot:12, melee:true, dmg:85, reach:4.2, rate:0.7,  price:2800 },
    pistol:  { name:"手枪",       slot:3, dmg:42, rate:0.22, mag:60, reload:1.4, ammo:"pistol", ammoPrice:20,  spread:0.014, auto:false, price:600 },
    smg:     { name:"冲锋枪",     slot:4, dmg:26, rate:0.085,mag:120,reload:2.0, ammo:"smg",    ammoPrice:45,  spread:0.032, auto:true,  price:1800 },
    shotgun: { name:"霰弹枪",     slot:5, dmg:13, pellets:10, rate:0.95, mag:32, reload:2.6, ammo:"shotgun",ammoPrice:35, spread:0.065, auto:false, price:1600 },
    rifle:   { name:"突击步枪",   slot:6, dmg:46, rate:0.11, mag:120,reload:2.2, ammo:"rifle",  ammoPrice:50,  spread:0.016, auto:true,  price:3400 },
    sniper:  { name:"狙击步枪",   slot:7, dmg:190, rate:1.6, mag:20, reload:3.0, ammo:"sniper", ammoPrice:80,  spread:0.0015,auto:false, price:8000, zoom:true },
    lmg:     { name:"轻机枪",     slot:8, dmg:38, rate:0.09, mag:400,reload:4.0, ammo:"lmg",    ammoPrice:55,  spread:0.05,  auto:true,  price:9500 },
    rpg:     { name:"火箭筒",     slot:9, dmg:900, radius:8,  projSpeed:42, rate:0.2, mag:4, reload:2.8, ammo:"rocket", ammoPrice:500,  price:6800, proj:true },
    mortar:  { name:"迫击炮",     slot:13, dmg:1500,radius:13, rate:0.2, mag:4, reload:0.5, ammo:"mortar", ammoPrice:600, price:14000, proj:true, mortar:true, minRange:30, maxRange:340 },
    missile: { name:"万能导弹发射器", slot:0, rate:0.2, price:32000, proj:true, missileTarget:true, universal:true },
    grenade: { name:"手榴弹",     throwable:true, dmg:380, radius:9, price:180, ammo:"grenade", fuse:2.5 },
  },
  /* 导弹类型（万能发射器共用，切换弹药） */
  MISSILES: {
    normal: { name:"普通导弹", dmg:3600, radius:17, price:2500,  ammo:"missile" },
    large:  { name:"大型导弹", dmg:5200, radius:24, price:8000,  ammo:"missile2" },
    huge:   { name:"巨型导弹", dmg:7500, radius:34, price:22000, ammo:"missile3" },
  },
  ARMOR: {
    vest:   { name:"防弹衣",    armor:100, price:900 },
    helmet: { name:"头盔",      armor:60,  price:500 },
    heavy:  { name:"重装护甲",  armor:300, price:6800, slow:0.92 },
  },
  REPAIR: { name:"护甲修复包", price:300, amount:150 },
  /* 轰炸机弹药（强力航弹 / 小型核弹） */
  BOMBS: {
    pow:  { name:"强力航弹", dmg:8000,  radius:25, price:15000, ammo:"bombpow" },
    nuke: { name:"小型核弹", dmg:22000, radius:60, price:80000, ammo:"bombnuke" },
  },

  /* ---------------- 载具（高速；正常行驶不消耗耐久=无限能源） ---------------- */
  VEHICLES: {
    bike:     { name:"自行车",     price:250,     hp:400,   speed:15,   ram:8,   mass:15,    wheel:true,  open:true },
    ebike:    { name:"电动车",     price:900,     hp:900,   speed:16,   ram:18,  mass:90,    wheel:true,  open:true },
    moto:     { name:"摩托车",     price:6500,    hp:1200,  speed:45,   ram:34,  mass:220,   wheel:true,  open:true },
    car:      { name:"轿车",       price:18000,   hp:8000,  speed:55,   ram:130, mass:1500,  wheel:true },
    excavator:{ name:"挖掘机",     price:150000,  hp:26000, speed:6,    ram:240, mass:22000, wheel:true, arm:true, armDmg:650, armReach:7 },
    apc:      { name:"装甲车",     price:380000,  hp:48000, speed:30,   ram:380, mass:14000, wheel:true, armor:0.6, gun:"mg", gunAmmo:1500 },
    tank:     { name:"坦克",       price:1800000, hp:110000,speed:22,   ram:950, mass:55000, wheel:true, armor:0.75,gun:"mg", cannon:true, cannonDmg:2400, cannonRadius:10, cannonReload:4 },
    heli:     { name:"武装直升机", price:3200000, hp:30000, speed:80,   mass:4500, fly:true, armor:0.3, rockets:true, rocketDmg:750, rocketRadius:7, rocketRate:0.35 },
    bomber:   { name:"轰炸机",     price:8000000, hp:42000, speed:150,  mass:25000, fly:true, armor:0.45,bombs:true, bombDmg:3400, bombRadius:15, bombRate:1.6, minSpeed:16 },
  },

  /* ---------------- NPC（海量怪物、无数量上限；单体战斗力削弱） ---------------- */
  NPC: {
    grunt:  { name:"巡逻怪",   hp:40,   dmg:5,  speed:3.2, bounty:200,   melee:true,  ranged:true, range:20, rate:2.2, r:1.1, h:3.5 },
    spitter:{ name:"喷液怪",   hp:35,   dmg:6,  speed:2.8, bounty:280,   ranged:true, range:28, rate:1.5, r:0.95, h:3.0 },
    brute:  { name:"重装怪",   hp:120,  dmg:14, speed:2.2, bounty:600,   melee:true,  ranged:true, range:18, rate:2.8, r:1.8, h:4.2, charge:true },
    elite:  { name:"精英怪",   hp:80,   dmg:8,  speed:4.2, bounty:1200,  ranged:true, range:32, rate:0.8, r:1.1, h:3.4 },
    mini:   { name:"精英统领", hp:600,  dmg:15, speed:4.0, bounty:20000, ranged:true, melee:true, range:34, rate:1.0, r:1.4, h:4.0, boss:true },
    mid:    { name:"统领",     hp:2200, dmg:30, speed:3.4, bounty:40000, melee:true,  r:2.0, h:4.8, boss:true, slam:true },
    big:    { name:"大统领",   hp:7000, dmg:36, speed:3.0, bounty:120000,ranged:true, melee:true, r:2.5, h:5.8, boss:true, slam:true, throw:true, summon:true },
  },
  NPC_CAP: 99999,      // 无数量上限（手机端性能保护上限300）
  NPC_RAIDER_RATE: 0.3, // 20%~40%怪物出城自动索敌（此处取30%）
  NPC_INIT_MIX: [
    ["grunt",0.58],["spitter",0.20],["brute",0.12],["elite",0.10]
  ],

  /* ---------------- 升级（线性成长，非指数；含转职与飞行） ---------------- */
  UPGRADES: {
    hp:     { name:"生命上限",   group:"身体", base:1500, step:1500, per:25,   max:40, fmt:v=>`+${v} 生命` },
    speed:  { name:"移动速度",   group:"身体", base:1200, step:1200, per:0.04, max:20, fmt:v=>`+${Math.round(v*100)}% 移速` },
    jump:   { name:"跳跃高度",   group:"身体", base:1000, step:1000, per:0.06, max:15, fmt:v=>`+${Math.round(v*100)}% 跳高` },
    stamina:{ name:"体力上限",   group:"身体", base:1500, step:1500, per:60,   max:30, fmt:v=>`+${v} 体力` },
    melee:  { name:"近战威力",   group:"身体", base:1800, step:1800, per:0.18, max:20, fmt:v=>`+${Math.round(v*100)}% 近战` },
    armor:  { name:"护甲上限",   group:"身体", base:2000, step:2000, per:25,   max:40, fmt:v=>`+${v} 护甲上限` },
    gunpow: { name:"枪械威力",   group:"身体", base:2500, step:2500, per:0.05, max:30, fmt:v=>`+${Math.round(v*100)}% 枪械伤害` },
    gunrange:{ name:"枪械射程",  group:"身体", base:2500, step:2500, per:0.06, max:20, fmt:v=>`+${Math.round(v*100)}% 枪械射程` },
    warrior:{ name:"战士转职",   group:"转职", base:4000, step:4000, per:1,    max:60, fmt:v=>`+${v*4}% 近战伤害 · +${v*2} 生命` },
    mage:   { name:"魔法师转职", group:"转职", base:4000, step:4000, per:1,    max:60, fmt:v=>`+${v*3}% 远程伤害 · +${v*2}% 移速` },
    cdr:    { name:"冷却缩减",   group:"转职", base:3000, step:3000, per:0.03, max:20, fmt:v=>`-${Math.round(v*100)}% 技能冷却` },
    fly:    { name:"飞行能力",   group:"转职", base:200000, step:0, per:1, max:1, fmt:v=>`解锁飞行（空中按住跳跃上升 / Ctrl下降）` },
    ratio:  { name:"结算加成",   group:"收益", base:6000, step:6000, per:0.01, max:30, fmt:v=>`+${Math.round(v*100)}% 奖励比例` },
    income: { name:"被动收益",   group:"收益", base:2500, step:2500, per:10,   max:50, fmt:v=>`+$${v}/秒 入账` },
  },

  /* ---------------- 建筑/物件 生命与价值（基础值，再乘难度倍率） ---------------- */
  SEG: {
    wall:    { hp:750,  value:8000,   name:"墙体" },
    col:     { hp:1300, value:15000,  name:"立柱" },
    sill:    { hp:650,  value:5000,   name:"窗台墙" },
    header:  { hp:650,  value:5000,   name:"过梁" },
    glass:   { hp:40,   value:1200,   name:"玻璃" },
    slab:    { hp:1100, value:15000,  name:"楼板" },
    roof:    { hp:1200, value:12000,  name:"屋面" },
    door:    { hp:260,  value:3500,   name:"门" },
    stairs:  { hp:900,  value:9000,   name:"楼梯" },
    intwall: { hp:600,  value:4000,   name:"隔墙" },
    tile:    { hp:900,  value:5000,   name:"地面" },
    fieldtile:{ hp:700, value:1000,   name:"草地" },
    tree:    { hp:160,  value:2200,   name:"树木" },
    lamp:    { hp:140,  value:3000,   name:"路灯" },
    desk:    { hp:60,   value:350,    name:"课桌" },
    chair:   { hp:40,   value:150,    name:"座椅" },
    table:   { hp:70,   value:400,    name:"餐桌" },
    bed:     { hp:90,   value:600,    name:"床铺" },
    board:   { hp:50,   value:800,    name:"黑板" },
    prop:    { hp:150,  value:1500,   name:"设施" },
    cwall:   { hp:600,  value:10000,  name:"围墙" },
    gate:    { hp:900,  value:200000, name:"校门" },
    gatehouse:{ hp:800, value:50000,  name:"门卫室" },
    pavilion:{ hp:1200, value:80000,  name:"凉亭" },
    bridge:  { hp:1000, value:60000,  name:"栈桥" },
    hoop:    { hp:200,  value:2000,   name:"篮架" },
    bleacher:{ hp:1300, value:30000,  name:"看台" },
    goal:    { hp:400,  value:6000,   name:"球门" },
    cover:   { hp:800,  value:4000,   name:"掩体" },
    sign:    { hp:220,  value:2500,   name:"路牌" },
    block:   { hp:3200, value:320000, name:"楼宇" },
    house:   { hp:1100, value:60000,  name:"平房" },
    debris:  { hp:120,  value:0,      name:"残骸" },
  },
  PORTAL_HP: 10000,
  PORTAL_VALUE: 10000000,

  /* ---------------- 地图布局（完全虚构） ----------------
   * M校：x 500..2500, z -2100..-100（2km×2km）
   * D校：x -2500..-1000, z -1600..-100（1.5km×1.5km）
   * 主干道 z 20..44 连接两校；侧门缺口定义在 gaps */
  LAYOUT: {
    bounds: { x:2700, zN:-2350, zS:320 },
    airwallH: 60,
    roadMain: { x0:-2700, x1:2700, z0:20, z1:44 },
    roadNorth:{ x0:-12,  x1:12,  z0:-2350, z1:20 },
    sidewalkN:{ z0:10, z1:20 }, sidewalkS:{ z0:44, z1:54 },
    campusA: { x0:500, x1:2500, z0:-2100, z1:-100, side:"A",
      gaps: {
        south: [[1460,1540,"main"],[700,760],[2240,2300]],
        north: [[900,960],[2100,2160]],
        east:  [[-860,-800],[-1860,-1800]],
        west:  [[-860,-800],[-1460,-1400]],
      }
    },
    campusB: { x0:-2500, x1:-1000, z0:-1600, z1:-100, side:"B",
      gaps: {
        south: [[-1790,-1710,"main"],[-1160,-1100],[-2400,-2340]],
        north: [[-1460,-1400],[-2160,-2100]],
        east:  [[-660,-600],[-1260,-1200]],
        west:  [[-660,-600],[-1060,-1000]],
      }
    },
    buildings: [
      // M校：4栋教学楼 + 图书馆 + 宿舍×2 + 食堂 + 体育馆
      { kind:"teaching", side:"A", cx:850,  cz:-450, w:64, d:20, floors:4 },
      { kind:"teaching", side:"A", cx:1250, cz:-450, w:64, d:20, floors:5 },
      { kind:"teaching", side:"A", cx:1650, cz:-450, w:64, d:20, floors:4 },
      { kind:"teaching", side:"A", cx:2050, cz:-450, w:64, d:20, floors:5 },
      { kind:"teaching", side:"A", cx:1050, cz:-850, w:50, d:20, floors:3 },
      { kind:"dorm",     side:"A", cx:2050, cz:-850, w:30, d:40, floors:4 },
      { kind:"dorm",     side:"A", cx:2250, cz:-850, w:30, d:40, floors:4 },
      { kind:"dining",   side:"A", cx:1450, cz:-850, w:30, d:24, floors:2 },
      { kind:"gym",      side:"A", cx:1750, cz:-850, w:40, d:36 },
      // M校 密集扩建（第二排教学区/生活区/附属楼群）
      { kind:"teaching", side:"A", cx:750,  cz:-1150, w:40, d:20, floors:4 },
      { kind:"teaching", side:"A", cx:1150, cz:-1150, w:40, d:20, floors:3 },
      { kind:"teaching", side:"A", cx:1550, cz:-1150, w:40, d:20, floors:4 },
      { kind:"teaching", side:"A", cx:1950, cz:-1150, w:40, d:20, floors:3 },
      { kind:"dining",   side:"A", cx:2300, cz:-1150, w:30, d:24, floors:2 },
      { kind:"wing",     side:"A", cx:1225, cz:-850, w:50, d:20, floors:4 },
      { kind:"dorm",     side:"A", cx:750,  cz:-700, w:30, d:40, floors:4 },
      { kind:"gym",      side:"A", cx:550,  cz:-600, w:30, d:26 },
      { kind:"teaching", side:"A", cx:550,  cz:-1000, w:40, d:20, floors:3 },
      { kind:"teaching", side:"A", cx:2350, cz:-700, w:40, d:20, floors:4 },
      { kind:"gym",      side:"A", cx:950,  cz:-1450, w:36, d:30 },
      { kind:"dorm",     side:"A", cx:1250, cz:-1500, w:30, d:40, floors:4 },
      { kind:"teaching", side:"A", cx:1650, cz:-1500, w:40, d:20, floors:3 },
      { kind:"teaching", side:"A", cx:2100, cz:-1500, w:40, d:20, floors:4 },
      { kind:"wing",     side:"A", cx:2300, cz:-1500, w:50, d:20, floors:4 },
      { kind:"dining",   side:"A", cx:700,  cz:-300, w:24, d:20, floors:2 },
      { kind:"dining",   side:"A", cx:2350, cz:-300, w:24, d:20, floors:2 },
      // D校：4栋教学楼 + 扩建新翼 + 体育馆 + 食堂（无宿舍）
      { kind:"teaching", side:"B", cx:-1250, cz:-450, w:64, d:20, floors:5 },
      { kind:"teaching", side:"B", cx:-1650, cz:-450, w:64, d:20, floors:6 },
      { kind:"teaching", side:"B", cx:-2050, cz:-450, w:64, d:20, floors:5 },
      { kind:"teaching", side:"B", cx:-2450, cz:-450, w:64, d:20, floors:4 },
      { kind:"wing",     side:"B", cx:-1650, cz:-480, w:50, d:20, floors:5 },
      { kind:"gym",      side:"B", cx:-2050, cz:-850, w:40, d:36 },
      { kind:"dining",   side:"B", cx:-2250, cz:-850, w:28, d:24, floors:2 },
      // D校 密集扩建（无宿舍）
      { kind:"teaching", side:"B", cx:-1050, cz:-600, w:40, d:20, floors:4 },
      { kind:"wing",     side:"B", cx:-1250, cz:-600, w:50, d:20, floors:5 },
      { kind:"teaching", side:"B", cx:-1550, cz:-500, w:30, d:20, floors:3 },
      { kind:"dining",   side:"B", cx:-1750, cz:-500, w:24, d:20, floors:2 },
      { kind:"gym",      side:"B", cx:-2350, cz:-600, w:30, d:26 },
      { kind:"teaching", side:"B", cx:-1450, cz:-850, w:40, d:20, floors:3 },
      { kind:"gym",      side:"B", cx:-1050, cz:-850, w:36, d:30 },
      { kind:"teaching", side:"B", cx:-1250, cz:-1150, w:40, d:20, floors:5 },
      { kind:"teaching", side:"B", cx:-1850, cz:-1150, w:40, d:20, floors:4 },
      { kind:"teaching", side:"B", cx:-2250, cz:-1150, w:40, d:20, floors:4 },
      { kind:"dining",   side:"B", cx:-1050, cz:-1150, w:28, d:24, floors:2 },
      { kind:"teaching", side:"B", cx:-1050, cz:-1400, w:40, d:20, floors:3 },
      { kind:"wing",     side:"B", cx:-1450, cz:-1400, w:50, d:20, floors:4 },
      { kind:"teaching", side:"B", cx:-1850, cz:-1450, w:40, d:20, floors:3 },
      { kind:"dining",   side:"B", cx:-2250, cz:-500, w:24, d:20, floors:2 },
    ],
    lake:    { cx:850, cz:-1700, rx:100, rz:130 },
    fieldA:  { x0:1390, x1:1510, z0:-1740, z1:-1660 },
    fieldB:  { x0:-1810, x1:-1690, z0:-1290, z1:-1210 },
    courtsA: { x0:1350, x1:1410, z0:-720, z1:-660 },
    courtsB: { x0:-1450, x1:-1390, z0:-720, z1:-660 },
    parkingA:{ x0:2250, x1:2350, z0:-350, z1:-250 },
    parkingB:{ x0:-2450, x1:-2250, z0:-350, z1:-250 },
    blocks: { A:100, B:100 },   // 每校额外填充楼宇数量
    // 校内道路（24m宽，覆盖在草地上，铺设道路砖）
    internalRoads: [
      { x0:1488, x1:1512, z0:-1700, z1:-100 },   // M校纵向主干
      { x0:560,  x1:2440, z0:-262,  z1:-238 },   // M校横向主干
      { x0:-1762,x1:-1738,z0:-1400, z1:-100 },   // D校纵向主干
      { x0:-2440,x1:-1060,z0:-262,  z1:-238 },   // D校横向主干
    ],
    // 车棚（停放自行车/电动车，不可驾驶）
    bikeSheds: [
      { x:560,  z:-190, ry:Math.PI/2 },
      { x:2440, z:-190, ry:Math.PI/2 },
      { x:-1060,z:-190, ry:Math.PI/2 },
      { x:-2440,z:-190, ry:Math.PI/2 },
    ],
    plazaA:  { cx:1500, cz:-250, rx:180, rz:250 },
    plazaB:  { cx:-1750, cz:-250, rx:160, rz:200 },
    spawn:   { x:0, z:32 },
    exits: [
      { x:2650, z:32,  dir:"东端主干道" },
      { x:-2650,z:32,  dir:"西端主干道" },
      { x:0,    z:-2300,dir:"北侧支路" },
    ],
    portals: [
      { side:"A", x:850,  y:0, z:-470 },   // A教学楼1大堂
      { side:"A", x:1500, y:0, z:-250 },   // A广场
      { side:"A", x:1750, y:0, z:-870 },   // A体育馆
      { side:"A", x:1450, y:0, z:-870 },   // A食堂
      { side:"A", x:1450, y:0, z:-1700 },  // A足球场
      { side:"A", x:850,  y:0, z:-1720 },  // A湖边
      { side:"B", x:-1250, y:0, z:-470 },  // B教学楼1大堂
      { side:"B", x:-1650, y:0, z:-500 },  // B新翼大堂
      { side:"B", x:-1750, y:0, z:-250 },  // B广场
      { side:"B", x:-2050, y:0, z:-870 },  // B体育馆
      { side:"B", x:-1750, y:0, z:-1250 }, // B足球场
      { side:"B", x:-2250, y:0, z:-870 },  // B食堂
    ],
    bosses: {
      big:  { x:0, z:-1200 },
      mid:  [ { x:1500, z:-120 }, { x:-1750, z:-120 } ],
      mini: [
        { x:1250, y:10.2, z:-450 }, { x:2050, y:6.8, z:-850 }, { x:850, y:0, z:-1700 },
        { x:-1650,y:13.6, z:-450 }, { x:-1650,y:0, z:-490 },   { x:-2050,y:0, z:-870 },
      ],
    },
  },

  /* ---------------- 转职技能 ---------------- */
  SKILLS: {
    fireball: { name:"火球术",  cls:"mage",    need:1,  cd:0,  cost:22, key:"KeyT", desc:"发射爆炸火球（无冷却）" },
    charge:   { name:"冲锋斩",  cls:"warrior", need:1,  cd:0,  cost:25, key:"KeyC", desc:"向前突进9米并斩击路径敌人（无冷却）" },
    frost:    { name:"冰霜新星",cls:"mage",    need:5,  cd:12, cost:25, key:"KeyX", desc:"冻结并伤害周围13米敌人3秒" },
    berserk:  { name:"狂暴",    cls:"warrior", need:5,  cd:20, cost:30, key:"KeyZ", desc:"6秒内近战伤害翻倍且移速+30%" },
    // 高阶魔法师（每10级解锁一个）
    meteor:   { name:"陨石术",  cls:"mage",    need:10, cd:20, cost:40, key:"KeyY", keyLabel:"Y", desc:"召唤陨石轰击准星落点，巨大范围伤害" },
    chain:    { name:"连锁闪电",cls:"mage",    need:20, cd:12, cost:30, key:"KeyU", keyLabel:"U", desc:"闪电在敌人之间跳跃连锁伤害" },
    shield:   { name:"冰霜护盾",cls:"mage",    need:30, cd:25, cost:35, key:"KeyI", keyLabel:"I", desc:"护盾吸收伤害并冻结近身敌人" },
    flamestorm:{name:"烈焰风暴",cls:"mage",    need:40, cd:22, cost:45, key:"KeyO", keyLabel:"O", desc:"大范围火焰风暴并点燃可燃物" },
    timewarp: { name:"时间扭曲",cls:"mage",    need:50, cd:30, cost:40, key:"KeyP", keyLabel:"P", desc:"大幅减速周围所有敌人" },
    fury:     { name:"元素之怒",cls:"mage",    need:60, cd:40, cost:60, key:"KeyJ", keyLabel:"J", desc:"全元素爆发，巨大范围毁灭打击" },
    // 高阶战士（每10级解锁一个）
    whirlwind:{ name:"旋风斩",  cls:"warrior", need:10, cd:8,  cost:25, key:"KeyK", keyLabel:"K", desc:"旋转挥砍周围敌人" },
    shockwave:{ name:"震荡波",  cls:"warrior", need:20, cd:10, cost:28, key:"KeyL", keyLabel:"L", desc:"重击地面震飞并伤害周围敌人" },
    warcry:   { name:"战吼",    cls:"warrior", need:30, cd:18, cost:30, key:"KeyN", keyLabel:"N", desc:"战吼提升伤害与移速" },
    execute:  { name:"处决",    cls:"warrior", need:40, cd:14, cost:32, key:"KeyM", keyLabel:"M", desc:"对最近敌人造成巨额单体伤害" },
    ironbody: { name:"钢铁之躯",cls:"warrior", need:50, cd:24, cost:40, key:"BracketLeft",  keyLabel:"[", desc:"短暂大幅减伤" },
    avatar:   { name:"天神下凡",cls:"warrior", need:60, cd:50, cost:60, key:"BracketRight", keyLabel:"]", desc:"终极形态，全面强化" },
  },

  /* ---------------- 数值常量 ---------------- */
  PLAYER: { hp:100, stamina:300, speed:8.4, sprint:12.6, jump:8.5, eye:1.7, radius:0.42 },
  VAULT: { reach:1.35, maxTop:3.3, cost:14, dist:2.3 },
  GRAVITY: -20,
  DEBRIS_CAP: 1100,
  /* 排行榜云存储（extendsclass json-storage） */
  LEADERBOARD_API: "https://json.extendsclass.com/bin/dbbafab",
};
