import {createHttpApplication} from './application';
import {cfControl,type CloudflareHostEnv} from './cloudflare-host';
import {edgeIP} from './public-browser';
export {ControlPlane,PublicRoom,PrivateRoom} from './cloudflare-host';
// Retained solely for the existing migration history; no route creates legacy rooms.
export {Room} from './room';
const applications=new WeakMap<object,ReturnType<typeof createHttpApplication>>();
export default {
 async fetch(request:Request,env:CloudflareHostEnv):Promise<Response>{
  let app=applications.get(env);
  if(!app){app=createHttpApplication({origin:env.PUBLIC_ORIGIN,assets:env.ASSETS,control:cfControl(env),edgeLimit:env.IP_RATE_LIMIT,trustedIP:edgeIP,
   publicRoom:async(slug,config)=>{const room=env.PUBLIC_ROOMS.getByName(slug);await room.applyConfiguration(config);return room;},
   privateRoom:id=>env.PRIVATE_ROOMS.getByName(id),identity:env,ready:()=>Boolean(env.CONTROL&&env.PUBLIC_ROOMS&&env.PRIVATE_ROOMS)});applications.set(env,app);}
  return app.fetch(request);
 }
} satisfies ExportedHandler<CloudflareHostEnv>;
