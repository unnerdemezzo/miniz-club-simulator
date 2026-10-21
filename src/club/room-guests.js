import {GUEST_CAST} from './character-cast.js';
import {CLUB_TRACKS} from './club-tracks.js';
import {FLOOR} from './config.js';
// Authored floor positions, not runtime random offsets. Leave podiums,
// workshops and recovery sectors clear; seated bench workers stay unchanged.
export const ROOM_GUEST_PLACES={
 policarmb:[[-3.7,-5.7,.15],[8.9,1.15,-.20]],
 carrera:[[9.1,-6.7,.15],[-3.35,-2.0,-.25]],
 oxigen:[[-2.2,-3.5,.24],[8.45,-.7,-.30]],
 oxigen16:[[-3.2,-2.0,.20],[7.6,2.4,-.25]],
 wood:[[-4.15,-2.75,-.25],[-3.75,-1.72,.36],[6.8,2.55,-.17]],
 ninco:[[-3.85,-2.50,.22],[7.35,1.95,-.28]],
 protrack:[[-3.30,-2.30,-.20],[8.50,1.75,.25]],
 scaleauto8:[[-3.30,-2.25,-.20],[8.50,1.75,.25]],
 policar:[[-3.55,-2.65,.18],[8.55,1.72,-.25]],
 rallycross:[[-1.65,.10,-.18],[6.65,-2.75,.30]],
 rally:[[-2.05,-1.35,.22],[4.8,-3.15,-.26]]
};
export function buildRoomGuests(scene,club,person){
 const track=CLUB_TRACKS[club.trackId],target=track.center||[2.45,0,-1.9];
 for(const [i,[x,z,angle]] of ROOM_GUEST_PLACES[club.trackId].entries()){
  const natural=club.trackId==='policarmb';
  const guest=person({...GUEST_CAST[i],stance:natural?0:i===0?1:(i+2)%4,relaxedGuest:i===0||natural,clothingVariant:i===0?'guest-elena-casual':undefined,motionKey:`guest-${club.trackId}-${i}`});
  guest.name=`Spettatore ${track.room} ${i+1}`;guest.position.set(x,FLOOR,z);guest.rotation.y=Math.atan2(x-target[0],z-target[2])+angle;guest.userData.roomGuest=true;scene.add(guest);club.backgroundPeople.push(guest);
 }
}
