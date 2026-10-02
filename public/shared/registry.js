import {icon,header,message,person} from './components/common-room.js';
import {room,terminal,introduction,guide} from './screens/common-room.js';
import {createRiskDialog} from './dialogs/public-risk.js';
import {renderSelect} from './components/selects.js';

// This first slice covers the existing observer, not the pending auth/admin screens.
export const componentRegistry=Object.freeze({
 icon:{render:icon,requiredStates:['default']},
 header:{render:header,requiredStates:['default']},
 message:{render:message,requiredStates:['default','long']},
 person:{render:person,requiredStates:['default','long']},
 select:{render:renderSelect,requiredStates:['default','disabled','long','opened']}
});
export const screenRegistry=Object.freeze({
 room:{render:room},terminal:{render:terminal},introduction:{render:introduction},guide:{render:guide}
});
export const dialogRegistry=Object.freeze({
 'public-risk':{render:createRiskDialog,requiredStates:['unchecked','checked','pending','error','rate-limited']}
});
export function renderScreen(screenId,...args){
 const screen=screenRegistry[screenId];
 if(!screen)throw Error('UNKNOWN_SCREEN');
 return screen.render(...args);
}
