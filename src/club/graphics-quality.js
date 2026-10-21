import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const GRAPHICS_PROFILES = {
  alta: { maxDpr: 2.5, maxLongEdge: 3840, maxShortEdge: 2160, pixelBudget: 3840 * 2160 },
  media: { maxDpr: 1.5, maxLongEdge: 1920, maxShortEdge: 1080, pixelBudget: 1920 * 1080 },
  bassa: { maxDpr: 1.0, maxLongEdge: 1280, maxShortEdge: 720, pixelBudget: 1280 * 720 }
};

export function qualityPixelRatio(quality, width, height, displayDpr) {
  const profile = GRAPHICS_PROFILES[quality] || GRAPHICS_PROFILES.alta;
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  return Math.max(
    0.75,
    Math.min(
      displayDpr || 1,
      profile.maxDpr,
      profile.maxLongEdge / Math.max(w, h),
      profile.maxShortEdge / Math.min(w, h)
    )
  );
}

export function stableGtaoShader(source) {
  const horizon = 'vec2 sinHorizons = sqrt(1. - cosHorizons * cosHorizons);';
  if (!source || !source.includes(horizon)) return source;
  return (
    `vec3 slotSafeNormalize(vec3 v) {
    return v * inversesqrt(max(dot(v, v), 1e-12));
  }\n` +
    source
      .replace(/\bnormalize\(/g, 'slotSafeNormalize(')
      .replace(horizon, `cosHorizons = clamp(cosHorizons, vec2(-1.), vec2(1.));\n\t\t\t\t${horizon}`)
  );
}

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

export function stableHdrShader(source) {
  if (!source) return source;
  if (!source.includes('texture2D(') && !source.includes('texture2D (')) return source;
  if (!/gl_FragColor\s*=/.test(source) || !/}\s*$/.test(source)) return source;
  return (
    finiteShader +
    source
      .replace(/\btexture2D\s*\(/g, 'slotHdrSample(')
      .replace(/}\s*$/, 'gl_FragColor = slotHdrColour(gl_FragColor);\n}')
  );
}

export function stableAoBlendShader(source) {
  const sample = 'vec4 texel = texture2D( tDiffuse, vUv );';
  if (!source || !source.includes(sample)) return source;
  return (
    finiteShader +
    `float slotAoChannel(float v) { return slotInvalid(v) ? 1. : clamp(v, 0., 1.); }\n` +
    source.replace(
      sample,
      sample + '\ntexel = vec4(slotAoChannel(texel.r), slotAoChannel(texel.g), slotAoChannel(texel.b), 1.);'
    )
  );
}

export function disposeComposer(composer) {
  if (!composer) return;
  for (const pass of composer.passes || []) {
    try {
      pass.dispose?.();
      if (pass instanceof GTAOPass && pass.blendMaterial) pass.blendMaterial.dispose();
    } catch (_) {}
  }
  try {
    composer.dispose();
  } catch (_) {}
}

function buildInternalComposer(renderer, scene, camera, profileKey, width, height, dpr) {
  if (profileKey === 'bassa') return null;
  try {
    const pixels = width * height * dpr * dpr;
    const target = new THREE.WebGLRenderTarget(Math.max(1, Math.round(width * dpr)), Math.max(1, Math.round(height * dpr)), {
      type: THREE.HalfFloatType,
      samples: pixels > 2.5e6 ? 2 : 4
    });
    const composer = new EffectComposer(renderer, target);
    composer.setPixelRatio(dpr);
    composer.setSize(width, height);
    composer.addPass(new RenderPass(scene, camera));

    if (profileKey === 'alta') {
      try {
        const ao = new GTAOPass(scene, camera, width, height);
        ao.overrideVisibility = function () {
          this.scene.traverseVisible((object) => {
            if (object.isPoints || object.isLine) {
              this._visibilityCache.set(object, object.visible);
              object.visible = false;
            }
          });
        };
        ao.restoreVisibility = function () {
          for (const [object, visible] of this._visibilityCache) object.visible = visible;
          this._visibilityCache.clear();
        };
        ao.gtaoMaterial.fragmentShader = stableGtaoShader(ao.gtaoMaterial.fragmentShader);
        ao.blendMaterial.fragmentShader = stableAoBlendShader(ao.blendMaterial.fragmentShader);
        ao.updateGtaoMaterial({ radius: 0.04, distanceExponent: 1.5, thickness: 0.5, scale: 1.2, samples: 16 });
        ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
        ao.blendIntensity = 0.55;
        composer.addPass(ao);
      } catch (_) {}
    }

    const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.18, 0.4, 1.2);
    for (const material of [
      bloom.materialHighPassFilter,
      ...bloom.separableBlurMaterials,
      bloom.compositeMaterial,
      bloom.blendMaterial
    ]) {
      if (material) material.fragmentShader = stableHdrShader(material.fragmentShader);
    }
    composer.addPass(bloom);

    const output = new OutputPass();
    if (output.material) output.material.fragmentShader = stableHdrShader(output.material.fragmentShader);
    composer.addPass(output);
    return composer;
  } catch (_) {
    return null;
  }
}

export function createQualityComposer(renderer, scene, camera, mainLight) {
  let currentQuality = 'high';
  let composer = null;

  const mapQualityKey = (q) => {
    if (q === 'low' || q === 'bassa') return 'bassa';
    if (q === 'medium' || q === 'media') return 'media';
    return 'alta';
  };

  const rebuild = (q) => {
    currentQuality = q || currentQuality;
    const profileKey = mapQualityKey(currentQuality);
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const dpr = qualityPixelRatio(profileKey, width, height, window.devicePixelRatio || 1);

    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height);

    if (mainLight && mainLight.shadow) {
      if (profileKey === 'bassa') {
        renderer.shadowMap.enabled = false;
      } else {
        renderer.shadowMap.enabled = true;
        const shadowSize = profileKey === 'alta' ? 2048 : 1024;
        if (mainLight.shadow.mapSize.x !== shadowSize) {
          mainLight.shadow.mapSize.set(shadowSize, shadowSize);
          if (mainLight.shadow.map) {
            mainLight.shadow.map.dispose();
            mainLight.shadow.map = null;
          }
        }
      }
    }

    disposeComposer(composer);
    composer = buildInternalComposer(renderer, scene, camera, profileKey, width, height, dpr);
  };

  rebuild('high');

  return {
    setQuality(q) {
      rebuild(q);
    },
    resize() {
      const profileKey = mapQualityKey(currentQuality);
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);
      const dpr = qualityPixelRatio(profileKey, width, height, window.devicePixelRatio || 1);
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height);
      if (composer) {
        composer.setPixelRatio(dpr);
        composer.setSize(width, height);
      }
    },
    render() {
      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    }
  };
}
