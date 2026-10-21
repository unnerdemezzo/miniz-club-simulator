// Fixed furnishings keep their existing transforms and rendering. Exclude
// people and explicitly dynamic props; rebasing a room updates its matrix once.
const watched=new WeakSet();
export function freezeStaticTransforms(root,dynamicRoots=[]){
  const dynamic=new Set(dynamicRoots);
  const visit=object=>{
    if(dynamic.has(object)||object.userData.dynamic||object.isLight)return;
    object.updateMatrix();object.matrixAutoUpdate=false;
    for(const child of object.children)visit(child);
    const ready=object.userData.ready;
    if(ready?.then&&!watched.has(object)){
      watched.add(object);
      ready.then(()=>freezeStaticTransforms(object,dynamicRoots)).catch(()=>{});
    }
  };
  visit(root);
}
export function setRoomPosition(room,x){
  room.position.x=x;room.updateMatrix();
}
export function setCharacterActivity(root,active){
  active=active&&!root.userData.staticMarshal;
  root.userData.animationActive=active;
  root.userData.refreshActivity=()=>setCharacterActivity(root,root.userData.animationActive);
  root.traverse(object=>{object.updateMatrix();object.matrixAutoUpdate=active;});
}
