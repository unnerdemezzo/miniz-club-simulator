import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Fit the drawing buffer inside each resolution, keeping the viewport aspect
// ratio. Swap the bounds in portrait; Retina/4K and ultrawide never exceed them.
export const GRAPHICS_PROFILES = {
  alta: { maxDpr: 3, maxLongEdge: 3840, maxShortEdge: 2160, pixelBudget: 3840 * 2160 },
  media: { maxDpr: 1.5, maxLongEdge: 1600, maxShortEdge: 900, pixelBudget: 1600 * 900 },
  bassa: { maxDpr: 1, maxLongEdge: 1280, maxShortEdge: 720, pixelBudget: 1280 * 720 },
};

export function qualityPixelRatio(quality, width, height, displayDpr){
  const profile = GRAPHICS_PROFILES[quality];
  return Math.min(displayDpr, profile.maxDpr,
    profile.maxLongEdge / Math.max(width, height),
    profile.maxShortEdge / Math.min(width, height));
}

// Three r160 GTAO normalizes zero-length slice/sample vectors and feeds
// rounded horizon cosines directly to sqrt/acos. A cosine of 1 + one float32
// ULP can produce NaN; the following bloom can spread it into black tiles
// on some GPUs. Keep the AO finite before denoising/bloom, without dropping
// Alta resolution, shadows or contact shading.
export function stableGtaoShader(source){
  const horizon = 'vec2 sinHorizons = sqrt(1. - cosHorizons * cosHorizons);';
  if (!source.includes(horizon)) throw new Error('GTAO shader changed: review finite horizon guards');
  return `vec3 slotSafeNormalize(vec3 v) {
    return v * inversesqrt(max(dot(v, v), 1e-12));
  }\n` + source.replace(/\bnormalize\(/g, 'slotSafeNormalize(').replace(horizon,
    `cosHorizons = clamp(cosHorizons, vec2(-1.), vec2(1.));\n\t\t\t\t${horizon}`);
}

// A single invalid HDR sample can contaminate all five bloom mip levels,
// producing a large, screen-aligned flashing rectangle. Guard samples BEFORE
// the blur, as well as its output; clamping NaN after the blur is too late.
// WebGL2 has explicit NaN/Inf checks; the ordered range test keeps WebGL1
// compatible. Valid half-float scene colours retain their original values.
const finiteShader = `precision highp float;
bool slotInvalid(float v) {
#if __VERSION__ >= 300
 return isnan(v) || isinf(v);
#else
 return !(v >= -65504. && v <= 65504.);
#endif
}
float slotHdrChannel(float v) { return slotInvalid(v) ? 0. : clamp(v, 0., 65504.); }
vec4 slotHdrColour(vec4 v) { return vec4(slotHdrChannel(v.r), slotHdrChannel(v.g), slotHdrChannel(v.b), slotHdrChannel(v.a)); }
vec4 slotHdrSample(sampler2D image, vec2 uv) { return slotHdrColour(texture2D(image, uv)); }
`;
export function stableHdrShader(source){
 if(!source.includes('texture2D(')&&!source.includes('texture2D ('))throw new Error('HDR shader changed: review sample guards');
 if(!/gl_FragColor\s*=/.test(source)||! /}\s*$/.test(source))throw new Error('HDR shader changed: review output guard');
 return finiteShader+source.replace(/\btexture2D\s*\(/g,'slotHdrSample(').replace(/}\s*$/,'gl_FragColor = slotHdrColour(gl_FragColor);\n}');
}
export function stableAoBlendShader(source){
 const sample='vec4 texel = texture2D( tDiffuse, vUv );';
 if(!source.includes(sample))throw new Error('AO blend shader changed: review neutral fallback');
 return finiteShader+`float slotAoChannel(float v) { return slotInvalid(v) ? 1. : clamp(v, 0., 1.); }\n`
  +source.replace(sample,sample+'\ntexel = vec4(slotAoChannel(texel.r), slotAoChannel(texel.g), slotAoChannel(texel.b), 1.);');
}

// The club, drag, all cameras and their UI share the same rendering pipeline.
// No depth-of-field pass: every car, lane and sign stays in focus while racing.
export function createQualityComposer(renderer, scene, camera, quality, width, height, dpr){
  if (quality === 'bassa') return null;
  const pixels = width * height * dpr * dpr;
  const target = new THREE.WebGLRenderTarget(width * dpr, height * dpr, {
    type: THREE.HalfFloatType, samples: pixels > 2.5e6 ? 2 : 4,
  });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(dpr); composer.setSize(width, height);
  composer.addPass(new RenderPass(scene, camera));
  if (quality === 'alta'){
    const ao = new GTAOPass(scene, camera, width, height);
    // Only points/lines change visibility during the normal pass. Record
    // those visible nodes; restore them directly instead of scanning every
    // mesh again or caching its unchanged visibility each frame.
    ao.overrideVisibility = function(){
      this.scene.traverseVisible(object=>{
        if(object.isPoints||object.isLine){this._visibilityCache.set(object,object.visible);object.visible=false;}
      });
    };
    ao.restoreVisibility = function(){
      for(const [object,visible] of this._visibilityCache)object.visible=visible;
      this._visibilityCache.clear();
    };
    ao.gtaoMaterial.fragmentShader = stableGtaoShader(ao.gtaoMaterial.fragmentShader);
    ao.blendMaterial.fragmentShader = stableAoBlendShader(ao.blendMaterial.fragmentShader);
    ao.updateGtaoMaterial({ radius: .04, distanceExponent: 1.5, thickness: .5, scale: 1.2, samples: 16 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    ao.blendIntensity = .55; composer.addPass(ao);
  }
  const bloom=new UnrealBloomPass(new THREE.Vector2(width, height), .18, .4, 1.2);
  for(const material of [bloom.materialHighPassFilter,...bloom.separableBlurMaterials,bloom.compositeMaterial,bloom.blendMaterial])material.fragmentShader=stableHdrShader(material.fragmentShader);
  composer.addPass(bloom);
  const output=new OutputPass();output.material.fragmentShader=stableHdrShader(output.material.fragmentShader);
  composer.addPass(output);
  return composer;
}

export function disposeComposer(composer){
  if (!composer) return;
  // EffectComposer.dispose() releases only its own targets and copy pass.
  // AO/bloom/output own more targets and materials that must be released too.
  for (const pass of composer.passes){
    pass.dispose?.();
    // r160 GTAOPass.dispose omits its separate blend material.
    if(pass instanceof GTAOPass)pass.blendMaterial.dispose();
  }
  composer.dispose();
}

// Resize the existing effects; keep their materials and the scene intact.
export function resizeQualityComposer(composer, width, height, dpr){
  if (!composer) return;
  const samples = width * height * dpr * dpr > 2.5e6 ? 2 : 4;
  for (const target of [composer.renderTarget1, composer.renderTarget2]){
    if (target.samples !== samples){ target.samples = samples; target.dispose(); }
  }
  composer.setPixelRatio(dpr); composer.setSize(width, height);
}

// RenderPass and GTAO both render the scene. The same light's shadow map
// must be computed once for the current poses, then reused by later passes.
export function beginGraphicsFrame(renderer,scene){
  if(scene){scene.matrixWorldAutoUpdate=false;scene.updateMatrixWorld();}
  renderer.shadowMap.autoUpdate=false;
  renderer.shadowMap.needsUpdate=true;
  renderer.info?.reset();
}
