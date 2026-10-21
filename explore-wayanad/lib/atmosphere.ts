import { ShaderChunk } from "three";

/**
 * Atmosphere for every fogged material, by patching three's fog shader chunks once (import before the first render).
 * On top of the scene's FogExp2 (the storyboard's fog: clear low down, white-out at hairpins 7–8), it adds:
 *  - aerial perspective: distance tints toward a grey-blue monsoon haze, so far ridges fade like in a photograph;
 *  - valley mist: white mist lying in the lowland below MIST.top, shown once you have climbed above it;
 *  - sun glow: the haze brightens and warms toward the sun; at dusk (lib/theme) toward the low western sun instead,
 *    told apart by the fog colour (the day's is blue-grey, dusk's warm), since the chunk can't take a uniform of its own.
 * World position comes from the view matrix (view = rotation + translation, so world = Rᵀ·view + camera).
 * Colours are linear (three's working space). SUN must match Lighting.SUN_DIR.
 */
const AIR = { density: 0.0022, withFog: 0.12, color: "vec3(0.48, 0.58, 0.72)", sunColor: "vec3(1.0, 0.86, 0.62)" };
const MIST = { top: 10.0, fall: 7.0, density: 0.025, color: "vec3(0.86, 0.89, 0.91)", from: 10.0, full: 28.0 };
const SUN = "normalize(vec3(0.82, 0.5, -0.28))", DUSK_SUN = "normalize(vec3(-0.9, 0.07, -0.42))";

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
	vec3 fogDir = fogRay / max( fogDist, 1e-4 );
	// 1 under any day sky (blue-grey fog, clear to storm), 0 under dusk's warm fog
	float dayGlow = clamp( ( fogColor.b - fogColor.r + 0.05 ) * 20.0, 0.0, 1.0 );
	float sunward = pow( max( dot( fogDir, ${SUN} ), 0.0 ), 6.0 ) * dayGlow;
	float duskward = pow( max( dot( fogDir, ${DUSK_SUN} ), 0.0 ), 3.0 ) * ( 1.0 - dayGlow );
	// the haze and the mist take the light of the day: under a storm's dark fog they darken with it (a clear day's fog is
	// bright enough that this stays 1, so fair-weather looks are unchanged)
	float dayLight = clamp( dot( fogColor, vec3( 0.299, 0.587, 0.114 ) ) / 0.6, 0.3, 1.0 );
	vec3 airColor = ( mix( ${AIR.color}, fogColor, 0.35 + 0.45 * ( 1.0 - dayGlow ) ) + ${AIR.sunColor} * sunward * 0.3 + vec3( 1.0, 0.45, 0.2 ) * duskward * 0.45 ) * dayLight;
	// haze thickens with the weather's fog: crisp, layered ridges on a clear day, hazed out in mist
	float aerial = 1.0 - exp( - fogDist * ( ${AIR.density.toFixed(4)} + fogDensity * ${AIR.withFog.toFixed(3)} ) );
	float lowland = exp( - max( vFogWorld.y - ${MIST.top.toFixed(1)}, 0.0 ) / ${MIST.fall.toFixed(1)} ) * smoothstep( ${MIST.from.toFixed(1)}, ${MIST.full.toFixed(1)}, cameraPosition.y );
	float valleyMist = ( 1.0 - exp( - fogDist * ${MIST.density.toFixed(3)} ) ) * lowland * ( 0.3 + 0.7 * smoothstep( 0.004, 0.03, fogDensity ) );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, airColor, aerial * 0.85 );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, ${MIST.color} * dayLight, valleyMist );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;
}

/** The same haze colour for the sky dome's horizon (linear), so land fades into sky without a seam. */
export const AIR_LINEAR = [0.48, 0.58, 0.72] as const;
