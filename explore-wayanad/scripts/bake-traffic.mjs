/** Original metre-scale vehicles. No external model copyright; project-owned derivatives. */
import { Group, Mesh, BoxGeometry, CylinderGeometry, SphereGeometry, MeshStandardMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { writeFile } from 'node:fs/promises';
globalThis.FileReader = class { readAsArrayBuffer(b) { b.arrayBuffer().then(v => { this.result=v; this.onloadend?.(); }); } };
const mat=(name,color,metalness=0,roughness=.5)=>Object.assign(new MeshStandardMaterial({color,metalness,roughness}),{name});
const rubber=mat('rubber',0x171a1b,0,.95), glass=mat('glass',0x213c48,.3,.13), steel=mat('steel',0xa4abb0,.8,.3), lamp=mat('headlights',0xfff2ce), tail=mat('taillights',0xb71916);
function box(g,m,x,y,z,w,h,d){ const o=new Mesh(new BoxGeometry(w,h,d),m);o.position.set(x,y,z);g.add(o);return o; }
function wheel(g,x,y,z,r,w){const o=new Mesh(new CylinderGeometry(r,r,w,20),rubber);o.rotation.z=Math.PI/2;o.position.set(x,y,z);g.add(o);const hub=new Mesh(new CylinderGeometry(r*.52,r*.52,w+.01,12),steel);hub.rotation.z=Math.PI/2;hub.position.copy(o.position);g.add(hub);}
function bus(){ const g=new Group(),red=mat('body',0xb42c27,.22,.38),cream=mat('livery',0xe9ba54,.1,.45);box(g,red,0,1.18,0,2.42,1.6,9.4);box(g,cream,0,2.45,0,2.4,1.0,9.35);box(g,cream,0,3.03,0,2.43,.16,9.4);box(g,glass,0,2.43,4.69,2.12,.89,.025);box(g,glass,0,2.46,-4.69,2.1,.8,.025);
for(const x of [-1.211,1.211]){for(let i=0;i<8;i++)box(g,glass,x,2.45,-3.9+i*1.03,.018,.79,.87);box(g,cream,x,1.68,0,.02,.16,9.3);box(g,steel,x,1.92,0,.025,.035,9.2);}
for(const z of [-2.85,2.9])for(const x of [-1.12,1.12])wheel(g,x,.49,z,.49,.23);
for(const x of [-.83,.83]){box(g,lamp,x,.97,4.72,.42,.23,.035);box(g,tail,x,1.04,-4.72,.22,.36,.03);box(g,steel,x*1.6,2.35,4.1,.16,.36,.2);}
box(g,steel,0,.5,4.73,2.35,.15,.08);box(g,rubber,0,1.28,4.71,.9,.3,.04);box(g,rubber,0,2.98,4.71,1.6,.22,.03);return g;}
function bike(scooter){const g=new Group(),body=mat('body',scooter?0xe1d7c2:0x3e4f65,.25,.4);for(const z of [-.68,.69])wheel(g,0,.29,z,.29,.13);box(g,steel,0,.4,0,.17,.14,1.4);box(g,body,0,.67,.12,scooter?.48:.36,.42,.6);box(g,rubber,0,.88,-.3,.39,.12,.69);box(g,steel,0,.61,.63,.09,.7,.1);box(g,steel,0,1.0,.52,.65,.05,.06);box(g,lamp,0,.96,.69,.22,.19,.1);box(g,tail,0,.66,-.86,.2,.12,.06);
// Seated rider and helmet: bikes never travel unoccupied.
const clothes=mat('rider',0x73644e),helmet=mat('helmet',0x252b2c,.1,.35);box(g,clothes,0,1.2,-.2,.42,.58,.25);for(const x of [-.22,.22]){box(g,clothes,x,.72,-.16,.14,.52,.18);box(g,clothes,x,1.13,.15,.13,.15,.54);}const head=new Mesh(new SphereGeometry(.18,12,8),helmet);head.position.set(0,1.67,-.14);g.add(head);return g;}
for(const [name,g] of [['bus',bus()],['motorcycle',bike(false)],['scooter',bike(true)]]){g.updateMatrixWorld(true);const groups=new Map();g.traverse(o=>{if(o.isMesh){const list=groups.get(o.material)||[];list.push(o.geometry.clone().applyMatrix4(o.matrixWorld));groups.set(o.material,list);}});const compact=new Group();for(const [material,geometries] of groups)compact.add(new Mesh(mergeGeometries(geometries),material));const data=await new GLTFExporter().parseAsync(compact,{binary:true});await writeFile(new URL('../public/models/traffic/'+name+'.glb',import.meta.url),Buffer.from(data));}
