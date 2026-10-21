// Distinct identities within each room. Guests and marshals never reuse a
// driver's mesh/face; the same person may visit a different room.
export const CHARACTER_CAST = [
  { id: 'driver-1', label: 'Pilota 1 · capelli corti', model: 'pilot', controller: 'cobra-plus', pose: 'drive', height: 1.75 },
  { id: 'driver-2', label: 'Pilota 2 · coda bionda', model: 'ponytail', controller: 'ds-blue', pose: 'drive', height: 1.68 },
  { id: 'driver-3', label: 'Pilota 3 · giacca blu', model: 'cropped', controller: 'cobra-clear', pose: 'drive', height: 1.8 },
  { id: 'driver-4', label: 'Pilota 4 · capelli radi', model: 'receding', controller: 'ds-orange', pose: 'drive', height: 1.77 },
  { id: 'marshal-1', label: 'Roberto · commissario con barba e capelli ricci', model: 'marshal-roberto', gender: 'male', pose: 'stand', height: 1.79, skin:0xb97952, hair:0x24180f, beard:true },
  { id: 'marshal-2', label: 'Stefano · commissario brizzolato', model: 'marshal-stefano', gender: 'male', pose: 'stand', height: 1.82, skin:0xe2b38e, hair:0x352519, faceWidth:1.03 },
  { id: 'marshal-3', label: 'Andrea · commissario con capelli mossi castani', model: 'marshal-andrea', gender: 'male', pose: 'stand', height: 1.73, skin:0xd29b77, hair:0x858078, faceWidth:.98 },
  { id: 'guest-1', label: 'Elena · capelli castani raccolti e gonna blu', model: 'guest-elena', gender:'female', pose: 'stand', height: 1.70, skin:0xe8c4a8,hair:0x4a291b,shirt:0xe5e7df },
  { id: 'guest-2', label: 'Marta · capelli biondi corti e giacca marrone', model: 'guest-marta', gender:'female', pose: 'stand', height: 1.72, skin:0xf0cfb2,hair:0xc99b53,shirt:0x614335 },
  { id: 'guest-3', label: 'Alice · capelli corti scuri e camicia rosa', model: 'guest-alice', gender:'female', pose: 'stand', height: 1.66, skin:0xd8af91,hair:0x201814,shirt:0xd78e9e }
];
export const DRIVER_CAST = CHARACTER_CAST.slice(0, 4);
export const MARSHAL_CAST = CHARACTER_CAST.slice(4, 7);
export const GUEST_CAST = CHARACTER_CAST.slice(7);

// Dedicated eight-driver lineup: six men and two different female meshes.
// Each driver has a distinct face, body mesh and outfit.
export const NINCO_DRIVER_CAST = [
  {id:'ninco-driver-1',label:'Pilota Ninco 1 · capelli corti',model:'pilot',gender:'male',controller:'cobra-plus',pose:'drive',height:1.75},
  {id:'ninco-driver-2',label:'Marco · giacca blu',model:'cropped',gender:'male',controller:'ds-blue',pose:'drive',height:1.80},
  {id:'ninco-driver-3',label:'Luca · capelli radi',model:'receding',gender:'male',controller:'cobra-clear',pose:'drive',height:1.77},
  {id:'ninco-driver-4',label:'Sara · coda bionda',model:'ponytail',gender:'female',controller:'ds-orange',pose:'drive',height:1.68},
  {id:'ninco-driver-5',label:'Giulia · capelli lunghi scuri',model:'longhair',gender:'female',controller:'cobra-plus',pose:'drive',height:1.70},
  {id:'ninco-driver-6',label:'Paolo · polo chiara',model:'ninco-paolo',gender:'male',controller:'ds-blue',pose:'drive',height:1.84},
  {id:'ninco-driver-7',label:'Enrico · maglione beige',model:'ninco-enrico',gender:'male',controller:'cobra-clear',pose:'drive',height:1.73},
  {id:'ninco-driver-8',label:'Davide · giacca grigia',model:'ninco-davide',gender:'male',controller:'ds-orange',pose:'drive',height:1.82},
];
