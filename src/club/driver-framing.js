import * as THREE from 'three';
const projected=new THREE.Vector3(),start=new THREE.Vector3(),target=new THREE.Vector3();
// Preserve the existing overview while the driver's car is comfortably in
// frame. Near an edge, turn only the head just enough to retain the car and
// its slot. Eyes, lens and physical podium position never change.
export function keepDriverCarVisible(camera,look,carPoint,margin=.70){
 const fits=point=>{
  camera.lookAt(point);camera.updateMatrixWorld(true);
  projected.copy(carPoint).project(camera);
  return Math.abs(projected.x)<=margin&&Math.abs(projected.y)<=margin&&projected.z>=-1&&projected.z<=1;
 };
 if(fits(look))return false;
 start.copy(look);let lo=0,hi=1;
 for(let i=0;i<18;i++){
  const mid=(lo+hi)/2;target.lerpVectors(start,carPoint,mid);
  if(fits(target))hi=mid;else lo=mid;
 }
 look.lerpVectors(start,carPoint,hi);fits(look);return true;
}
