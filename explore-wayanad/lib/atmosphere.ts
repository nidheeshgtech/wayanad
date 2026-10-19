import { ShaderChunk } from "three";

/**
 * Atmosphere for every fogged material, by patching three's fog shader chunks once (import before the first render).
 * On top of the scene's FogExp2 (the storyboard's fog: clear low down, white-out at hairpins 7–8), it adds:
 *  - aerial perspective: distance tints toward a grey-blue monsoon haze, so far ridges fade like in a photograph;
 *  - valley mist: white mist lying in the lowland below MIST.top, shown once you have climbed above it;
 *  - sun glow: the haze brightens and warms toward the sun.
 * World position comes from the view matrix (view = rotation + translation, so world = Rᵀ·view + camera).
 * Colours are linear (three's working space). SUN must match Lighting.SUN_DIR.
 */
const AIR = { density: 0.0022, withFog: 0.12, color: "vec3(0.48, 0.58, 0.72)", sunColor: "vec3(1.0, 0.86, 0.62)" };
const MIST = { top: 10.0, fall: 7.0, density: 0.025, color: "vec3(0.86, 0.89, 0.91)", from: 10.0, full: 28.0 };
const SUN = "normalize(vec3(0.82, 0.5, -0.28))";

let patched = false;
export function patchAtmosphere() {
  if (patched) return;
  patched = true;
  ShaderChunk.fog_pars_vertex = ShaderChunk.fog_pars_vertex.replace("varying float vFogDepth;", "varying float vFogDepth;\n\tvarying vec3 vFogWorld;");
  ShaderChunk.fog_vertex = ShaderChunk.fog_vertex.replace(
    "vFogDepth = - mvPosition.z;",
    "vFogDepth = - mvPosition.z;\n\tvFogWorld = cameraPosition + transpose(mat3(viewMatrix)) * mvPosition.xyz;",
  );
  ShaderChunk.fog_pars_fragment = ShaderChunk.fog_pars_fragment.replace("varying float vFogDepth;", "varying float vFogDepth;\n\tvarying vec3 vFogWorld;");
  ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
	vec3 fogRay = vFogWorld - cameraPosition;
	float fogDist = length(fogRay);
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * fogDist * fogDist );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	float sunward = pow( max( dot( fogRay / max( fogDist, 1e-4 ), ${SUN} ), 0.0 ), 6.0 );
	vec3 airColor = mix( ${AIR.color}, fogColor, 0.35 ) + ${AIR.sunColor} * sunward * 0.3;
	// haze thickens with the weather's fog: crisp, layered ridges on a clear day, hazed out in mist
	float aerial = 1.0 - exp( - fogDist * ( ${AIR.density.toFixed(4)} + fogDensity * ${AIR.withFog.toFixed(3)} ) );
	float lowland = exp( - max( vFogWorld.y - ${MIST.top.toFixed(1)}, 0.0 ) / ${MIST.fall.toFixed(1)} ) * smoothstep( ${MIST.from.toFixed(1)}, ${MIST.full.toFixed(1)}, cameraPosition.y );
	float valleyMist = ( 1.0 - exp( - fogDist * ${MIST.density.toFixed(3)} ) ) * lowland * ( 0.3 + 0.7 * smoothstep( 0.004, 0.03, fogDensity ) );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, airColor, aerial * 0.85 );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, ${MIST.color}, valleyMist );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;
}

/** The same haze colour for the sky dome's horizon (linear), so land fades into sky without a seam. */
export const AIR_LINEAR = [0.48, 0.58, 0.72] as const;
