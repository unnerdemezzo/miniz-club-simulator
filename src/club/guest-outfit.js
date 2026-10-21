// Garment-only overlay: original face, hair, forearms and hands remain sampled
// from the licensed atlas. Rectangles use the original, unchanged UV layout.
const patches=[[0,.495,.490,.710],[.168,.333,.245,.995],[.005,.166,.248,.489],[.338,.492,.248,.489]];
export function guestClothAt(u,v){return patches.some(([x0,x1,y0,y1])=>u>=x0&&u<=x1&&v>=y0&&v<=y1)?1:0;}
export function installGuestOutfit(material,texture){
 const previous=material.onBeforeCompile;
 material.onBeforeCompile=shader=>{
  previous?.(shader);shader.uniforms.guestClothes={value:texture};
  shader.fragmentShader='uniform sampler2D guestClothes;\n'+shader.fragmentShader;
  const mask=patches.map(([x0,x1,y0,y1])=>`step(${x0.toFixed(3)},vMapUv.x)*step(vMapUv.x,${x1.toFixed(3)})*step(${y0.toFixed(3)},vMapUv.y)*step(vMapUv.y,${y1.toFixed(3)})`).join('+');
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>\n#ifdef USE_MAP\nfloat guestClothMask=clamp(${mask},0.0,1.0);\ndiffuseColor.rgb=mix(diffuseColor.rgb,texture2D(guestClothes,vMapUv).rgb,guestClothMask);\n#endif`);
 };
 material.customProgramCacheKey=()=> 'guest-elena-casual-garments-v43';material.userData.clothingTexture=texture;
}
