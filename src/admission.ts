import type {Settings} from './settings-schema';
import {entitlements,type Account} from './control-policy';
/** DB account state and settings are the sole admission authority; env/client flags are ignored. */
export function admission(settings:Settings,account?:Account){return {...entitlements(settings,account),admitted:Boolean(account?.email_verified)};}
