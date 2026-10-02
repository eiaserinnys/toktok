import {HttpError,errorResponse,json} from './http';
/** Non-secret room ID for an unrecoverable first response; capability material is never stored. */
export class CreationResultError extends HttpError {constructor(code:'CREATE_PENDING'|'CREATE_RESULT_NOT_RECOVERABLE',message:string,readonly room_id:string){super(409,code,message,code==='CREATE_PENDING'?2:undefined);}}
export function controlErrorResponse(error:unknown){if(error instanceof CreationResultError){const response=json({error:{code:error.code,message:error.message},room_id:error.room_id},409);if(error.retryAfter)response.headers.set('Retry-After',String(error.retryAfter));return response;}return errorResponse(error);}
