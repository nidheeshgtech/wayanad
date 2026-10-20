'use client';
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, LineSegments, ShaderMaterial, Vector3 } from 'three';
import { weather } from '@/lib/weather';
import { game } from '@/lib/game';
/** Static seeds; falling streak positions are computed on the GPU, with no per-frame buffer uploads. */
export default function Rain({ count = 2500, opacity = .3 }: { count?: number; opacity?: number }) {
  const lines = useMemo(() => {
    const positions = new Float32Array(count * 6), ends = new Float32Array(count * 2);
    for(let i=0;i<count;i++) { const seed=[Math.random()*10,Math.random()*6,Math.random()*10]; positions.set(seed,i*6); positions.set(seed,i*6+3); ends[i*2+1]=1; }
    const geo=new BufferGeometry();geo.setAttribute('position',new BufferAttribute(positions,3));geo.setAttribute('end',new BufferAttribute(ends,1));
    const mat=new ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:{value:0},eye:{value:new Vector3()},rain:{value:0},opacity:{value:opacity}},
      vertexShader:`attribute float end; uniform float time, rain; uniform vec3 eye;
        void main(){vec3 box=vec3(10.,6.,10.); vec3 p=mod(position+vec3(time*.08,-time*mix(.9,1.7,rain),0.)-vec3(eye.x,0.,eye.z),box)-box*.5+eye;
        p+=end*vec3(-.005,-mix(.035,.09,rain),0.);gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`,
      fragmentShader:`uniform float rain,opacity;void main(){gl_FragColor=vec4(.72,.81,.87,opacity*min(1.,rain*1.5));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`});
    const result=new LineSegments(geo,mat);result.frustumCulled=false;result.name='rain';return result;
  },[count,opacity]);
  useEffect(()=>()=>{lines.geometry.dispose();lines.material.dispose();},[lines]);
  useFrame(({camera},dt)=>{ const u=lines.material.uniforms;if(!game.paused)u.time.value+=Math.min(dt,.1);u.eye.value.copy(camera.position);u.rain.value=weather.rain;lines.visible=weather.rain>.02;lines.geometry.setDrawRange(0,Math.floor(count*Math.min(1,weather.rain*1.5))*2); });
  return <primitive object={lines} />;
}
