import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CatmullRomCurve3, Vector3 } from 'three';
import { lanePoint, vehiclePose, createFleet, advanceTraffic, interactWithViewer, interactWithPlayer, collidePlayer, playerLanes, vehicleLat, passingZones, VEHICLES, DRIVE } from '../lib/traffic.ts';
import { setHeightmaps, buildRoadCurve, roadShapeAt, roadDistance, height, bendTs } from '../lib/terrain.ts';
import { decodePng16 } from '../lib/heightmap.ts';
import { weather, stepWeather, setWeatherForReview } from '../lib/weather.ts';
const straight=new CatmullRomCurve3([new Vector3(0,0,0),new Vector3(0,0,100)]);
assert(lanePoint(straight,50,1,()=>0).x > 0, 'left lane looking toward +Z');
assert(lanePoint(straight,50,-1,()=>0).x < 0, 'opposing lane');
const maps=[];
for (const name of ['churam','plateau']) {
 const meta=JSON.parse(await readFile(new URL(`../public/terrain/${name}.json`,import.meta.url),'utf8'));
 const bytes=await readFile(new URL(`../public/terrain/${name}.png`,import.meta.url));
 const decoded=await decodePng16(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 maps.push({...meta,region:name,data:Float32Array.from(decoded.data,v=>meta.elevation.min+v/65535*(meta.elevation.max-meta.elevation.min))});
}
const data=JSON.parse(await readFile(new URL('../public/terrain/churam-road.json',import.meta.url),'utf8'));
setHeightmaps(maps,data);
const curve=buildRoadCurve(),L=curve.getLength(),widen=(t:number)=>roadShapeAt(t).widen;
let worstEdge=0,worstGround=0,unsafe=0,total=0;
for(let d=2;d<L-2;d+=.2) for(const direction of [1,-1] as const){
 const v={id:0,kind:0,direction,distance:d,speed:0},pose=vehiclePose(curve,v,widen);
 let safe=true;
 for(const z of [-.47,.47])for(const x of [-.14,.14]){
   const p=new Vector3(x,.025,z).applyQuaternion(pose.rotation).add(pose.position);
   worstEdge=Math.max(worstEdge,roadDistance(p.x,p.z));
   worstGround=Math.max(worstGround,height(p.x,p.z)-p.y);
   if(roadDistance(p.x,p.z)>.39 || height(p.x,p.z)>p.y)safe=false;
 }
 total++;if(!safe)unsafe++;
}
console.log({length:L,bends:bendTs().length,worstEdge,worstGround,unsafePercent:unsafe/total*100});
assert(unsafe/total<.05,'clearance culling limited to less than 5% of bus poses');
// Conservative bus-vs-bus SAT sweep of opposite lanes, including every hairpin.
function footprint(distance:number,direction:1|-1){
 const pose=vehiclePose(curve,{id:0,kind:0,direction,distance,speed:0},widen);
 const points=[[-.14,-.47],[.14,-.47],[.14,.47],[-.14,.47]].map(([x,z])=>new Vector3(x,.025,z).applyQuaternion(pose.rotation).add(pose.position));
 return {points,safe:points.every(p=>roadDistance(p.x,p.z)<=.39 && height(p.x,p.z)<=p.y)};
}
function overlap(a:Vector3[],b:Vector3[]){
 if(Math.abs(a[0].y-b[0].y)>.35)return false;
 for(const poly of [a,b])for(let i=0;i<4;i++){
  const p=poly[i],q=poly[(i+1)%4],ax=-(q.z-p.z),az=q.x-p.x;
  const aa=a.map(v=>v.x*ax+v.z*az),bb=b.map(v=>v.x*ax+v.z*az);
  if(Math.max(...aa)<=Math.min(...bb)||Math.max(...bb)<=Math.min(...aa))return false;
 }
 return true;
}
let overlaps=0;
for(let d=3;d<L-3;d+=.5){const a=footprint(d,1);if(!a.safe)continue;for(const offset of [-1,-.5,0,.5,1]){const b=footprint(d+offset,-1);if(b.safe&&overlap(a.points,b.points))overlaps++;}}
const zones=passingZones(curve,widen);
console.log({opposingBusConflictSamples:overlaps,reservedNarrowZones:zones.length});
assert(zones.length>0,'actual narrow bends are reserved');
for(const zone of zones){
 const pair=[{id:0,kind:0,direction:1 as const,distance:zone.from-1,speed:.5},{id:1,kind:0,direction:-1 as const,distance:zone.to+2,speed:.5}];
 for(let i=0;i<9000;i++){
  advanceTraffic(pair,curve,1/30,1,[zone]);
  assert(!overlap(footprint(pair[0].distance,1).points,footprint(pair[1].distance,-1).points),'reserved opposing buses never overlap');
  if(pair[0].distance>zone.to && pair[1].distance<zone.from)break;
 }
 if(!(pair[0].distance>zone.to && pair[1].distance<zone.from))console.log('uncleared',zone,pair);
 assert(pair[0].distance>zone.to && pair[1].distance<zone.from,'both directions eventually clear without deadlock');
}
// Tight, mixed-size queue exercises braking rather than only freely spaced traffic.
const queued=createFleet(100).slice(0,4).map((v,i)=>({...v,direction:1 as const,distance:10+i*2,speed:.8}));
for(let i=0;i<1200;i++)advanceTraffic(queued,straight,1/30,1);
for(let i=1;i<queued.length;i++)assert(queued[i].distance-queued[i-1].distance>1,'rain queue keeps safe separation');
const fleet=createFleet(L);
let minGap=Infinity;
for(let frame=0;frame<3600;frame++){
 advanceTraffic(fleet,curve,1/30,frame>1800?1:0);
 for(const v of fleet)for(const o of fleet)if(v!==o&&v.direction===o.direction){
 const gap=((o.distance-v.distance)*v.direction+L-4)%(L-4)-(VEHICLES[v.kind].length+VEHICLES[o.kind].length)/2;
 minGap=Math.min(minGap,gap);
 }
}
assert(minGap>.6,'no overlap over two minutes dry/rain simulation');
// The viewer's seat drives up the road at scroll pace (fast, stopped, briefly backwards, then quick), with and without the
// horn. Nobody may be alongside or just ahead of the seat unless giving way; vehicles do give way (so the viewer is
// never stuck for good); giving way only happens where it's safe; nothing overlaps.
for (const useHorn of [false, true]) {
 const riders=createFleet(L), zones2=passingZones(curve,widen); let seat=3, worst=Infinity, worstSpacing=Infinity, overtakes=0, unsafeYield=0;
 const passingNow=new Set<number>();
 for(let frame=0;frame<12000 && seat<L-3;frame++){
  const pace=frame%900<300?.9:frame%900<600?0:frame%900<620?-.6:2.5;
  const before=seat; seat=Math.max(3,Math.min(L-3,seat+pace/30));
  advanceTraffic(riders,curve,1/30,0,zones2,seat);
  interactWithViewer(riders,curve,widen,zones2,seat,(seat-before)*30,1/30,useHorn && frame%60<5);
  for(const v of riders)if(v.direction===1){
   const g=v.distance-seat, half=VEHICLES[v.kind].length/2, giving=v.mode==='yield'||v.mode==='passed';
   if(giving){ if(!passingNow.has(v.id) && v.mode==='yield'){passingNow.add(v.id); const t=v.distance/L; if(roadShapeAt(t).widen>.02)unsafeYield++;} }
   else { passingNow.delete(v.id); if(g>=-half) worst=Math.min(worst,g-half-DRIVE.ahead); else worst=Math.min(worst,-g-half-DRIVE.behind); }
   if(v.mode==='passed' && g+half<0 && passingNow.has(v.id)){ overtakes++; passingNow.delete(v.id); }
   for(const o of riders)if(o!==v&&o.direction===1&&Math.abs(o.distance-v.distance)<L/2)worstSpacing=Math.min(worstSpacing,Math.abs(o.distance-v.distance)-(half+VEHICLES[o.kind].length/2));
  }
 }
 console.log('viewer drive',{horn:useHorn,seat:seat.toFixed(1),overtakes,worstGapMargin:worst.toFixed(3),worstSpacing:worstSpacing.toFixed(3),unsafeYield});
 assert(worst>-1e-6,'only vehicles giving way are alongside or just ahead of the seat');
 assert(overtakes>3,'slower vehicles give way, the viewer is not stuck behind them');
 assert(unsafeYield===0,'nobody gives way on a hairpin');
 assert(worstSpacing>-1e-6,'clearing the seat never overlaps vehicles');
}
// Drive mode: a player's bus (kinematic here) drives up at bus pace, honks when held up, and pulls out toward the centre
// line to pass once the vehicle ahead gives way (only with the oncoming lane clear ahead). Oncoming traffic must never
// run into the bus; overtakes must happen; the bus never ends up inside a vehicle.
{
 const riders=createFleet(L), zones3=passingZones(curve,widen), P={s:3,lat:.2,speed:0,halfL:.2,halfW:.1};
 let headOn=0, overtakes=0, inside=0, wasOut=false;
 for(let frame=0;frame<15000 && P.s<L*.98;frame++){
  const dt=1/30, lead=riders.filter(v=>v.direction===1&&v.distance>P.s&&v.distance-P.s<2.5).sort((a,b)=>a.distance-b.distance)[0];
  const clearAhead=!riders.some(v=>v.direction===-1&&v.distance>P.s-1&&v.distance<P.s+6);
  const passing=lead&&lead.mode==='yield'&&clearAhead;
  const targetLat=passing?-.02:.2; P.lat+=(targetLat-P.lat)*Math.min(1,dt*2);
  P.speed=Math.min(1.6,P.speed+.5*dt); P.s+=P.speed*dt;
  advanceTraffic(riders,curve,dt,0,zones3,P.s,[{distance:P.s,length:.4,lanes:playerLanes(P)}]);
  interactWithPlayer(riders,curve,widen,zones3,P,dt,frame%45<3);
  collidePlayer(riders,curve,widen,P);
  for(const v of riders){ const spec=VEHICLES[v.kind];
   if(Math.abs(v.distance-P.s)<spec.length/2+P.halfL-.02 && Math.abs(vehicleLat(v,widen,L)-P.lat)<spec.width/2+P.halfW-.02){ inside++; if(v.direction===-1)headOn++; } }
  const out=P.lat<.1; if(wasOut&&!out)overtakes++; wasOut=out;
 }
 console.log('player drive',{s:P.s.toFixed(0),overtakes,headOn,inside});
 assert(overtakes>2,'the player gets past slower traffic');
 assert(headOn===0,'oncoming traffic never drives into the player');
 assert(inside===0,'the bus never ends up inside a vehicle');
}
stepWeather(1/60,0);assert(weather.rain===0,'sunny start');
setWeatherForReview('rain');for(let i=0;i<600;i++)stepWeather(.25,.5);
assert(weather.rain>.98 && weather.wet>.95,'rain/wetness transition');
setWeatherForReview('clearing');for(let i=0;i<1400;i++)stepWeather(.25,.5);
assert(weather.rain<.01 && weather.wet<.03,'gradual drying');
console.log('PASS left-hand lanes, real-road clearance audit, spacing, rain and drying', {minGap});
