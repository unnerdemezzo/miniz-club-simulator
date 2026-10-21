// Keep a failed character recoverable without reloading the whole game.
export function attachPersonLoading(holder, load, {fallback, onActor, retryDelay=5000}={}){
  let actor=null, pending=null, timer=null, autoRetry=true;
  holder.userData.kind='loading';
  const retry=()=>{
    if(pending)return pending;
    if(holder.userData.kind==='realistic')return Promise.resolve(true);
    clearTimeout(timer);
    pending=Promise.resolve().then(load).then(next=>{
      if(actor)holder.remove(actor);
      actor=next;holder.add(actor);onActor?.(actor);
      holder.userData.refreshActivity?.();
      holder.userData.actor=actor;holder.userData.kind='realistic';
      delete holder.userData.loadError;
      return true;
    }).catch(error=>{
      if(!actor&&fallback){actor=fallback();holder.add(actor);holder.userData.refreshActivity?.();}
      holder.userData.kind='fallback';holder.userData.loadError=error.message;
      console.warn('Personaggio non caricato; ritenterò senza riavviare.',error);
      // One delayed attempt for transient network failures; later room
      // selections can retry again. Never create an endless request loop.
      if(autoRetry&&(error.name==='TypeError'||error.name==='AbortError'||/HTTP (408|429|5\d\d)/.test(error.message))){
        autoRetry=false;timer=setTimeout(retry,retryDelay);
      }
      return false;
    }).finally(()=>{pending=null;});
    holder.userData.ready=pending;
    return pending;
  };
  holder.userData.retry=retry;
  retry();
  return holder;
}
