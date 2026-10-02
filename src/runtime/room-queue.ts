/** Mutations only. Never enqueue longpoll waiting or response transmission. */
export class RoomQueue {
 private tail:Promise<void>=Promise.resolve();
 run<T>(operation:()=>Promise<T>):Promise<T>{const result=this.tail.then(operation);this.tail=result.then(()=>{},()=>{});return result;}
}
