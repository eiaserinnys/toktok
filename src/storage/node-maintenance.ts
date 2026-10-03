import {RepositoryError,type RepositoryPort} from './repository';
/** Node-only startup cleanup index. CF keeps schema v1 and its persisted alarms. */
export const NODE_MIGRATION_VERSION=2;
export const NODE_MIGRATION_CHECKSUM='toktok-records-v2-private-room-maintenance-index';
export const PRIVATE_ROOM_INDEX='tok_private_rooms_scan';
export interface PrivateRoomIdPage {ids:string[];next?:string;}
export interface PrivateRoomIdOptions {limit:number;after?:string;}
export interface NodePrivateMaintenance {
 /** Metadata only; no body collection scan and no initialization of absent rooms. */
 listPrivateRoomIds(options:PrivateRoomIdOptions):Promise<PrivateRoomIdPage>;
 listPublicRoomIds(options:PrivateRoomIdOptions):Promise<PrivateRoomIdPage>;
}
export type NodeRepositoryPort=RepositoryPort&NodePrivateMaintenance;
export function validateRoomIdPage(options:PrivateRoomIdOptions):void {
 if(!Number.isInteger(options.limit)||options.limit<1||options.limit>100||
    (options.after!==undefined&&!/^[a-zA-Z0-9_-]{1,128}$/.test(options.after)))throw new RepositoryError('INVALID_MAINTENANCE_PAGE');
}
export function roomIdPage(ids:string[],limit:number):PrivateRoomIdPage {
 if(ids.some(id=>!/^[a-zA-Z0-9_-]{1,128}$/.test(id)))throw new RepositoryError('INVALID_ROOM_METADATA');
 return {ids,...(ids.length===limit?{next:ids[ids.length-1]}:{})};
}
