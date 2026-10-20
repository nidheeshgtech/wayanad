/** Refine the CC0 Quaternius materials and orient their imported wheel frame to +Z. Run once after downloading originals. */
import {readFile,writeFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {Box3,Vector3} from 'three';
globalThis.FileReader=class{readAsArrayBuffer(b){b.arrayBuffer().then(v=>{this.result=v;this.onloadend?.();});}};
for(const name of ['sedan','suv']){
 const file=new URL('../public/models/traffic/'+name+'.glb',import.meta.url),buf=await readFile(file);
 const {scene}=await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),'');
 let front;
 scene.traverse(o=>{if(/Front.*Wheel/.test(o.name))front=o;if(o.isMesh){const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats){m.roughness=m.name==='Windows'?.16:.4;m.metalness=m.name==='Black'?0:.22;}}});
 if(front){const c=new Box3().setFromObject(front).getCenter(new Vector3());console.log(name,'front wheel centre',c.toArray());if(c.z<0)scene.rotation.y=Math.PI;}
 const out=await new GLTFExporter().parseAsync(scene,{binary:true});await writeFile(file,Buffer.from(out));
}
