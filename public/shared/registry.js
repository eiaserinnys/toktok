import {icon,header,message,person} from './components/common-room.js';
import {room,terminal,introduction,guide} from './screens/common-room.js';
import {createRiskDialog} from './dialogs/public-risk.js';
import {renderSelect} from './components/selects.js';
import {renderSettingsFields,renderSettingsScreen,renderSettingField} from './screens/settings.js';
import {createSettingsDialog} from './dialogs/settings.js';
import {renderProductHeader} from './components/header.js';
import {renderAuth} from './screens/auth.js';
import {renderAgentSafety} from './components/agent-safety.js';
import {renderLobby} from './screens/lobby.js';

// Product and protected QA resolve the same renderers and state inventory.
export const componentRegistry=Object.freeze({
 'agent-safety':{render:renderAgentSafety,requiredStates:['service-owned']},
 icon:{render:icon,requiredStates:['default']},
 header:{render:header,requiredStates:['default']},
 message:{render:message,requiredStates:['default','long']},
 person:{render:person,requiredStates:['default','long']},
 select:{render:renderSelect,requiredStates:['default','disabled','long','opened']},
 'product-header':{render:renderProductHeader,requiredStates:['anonymous','member','admin','loading','unavailable']},
 'setting-field':{render:renderSettingField,requiredStates:['number','enum','readonly-off']},
 'settings-fields':{render:renderSettingsFields,requiredStates:['catalog','empty','max','workload','nested','readonly-off']}
});
export const screenRegistry=Object.freeze({
 room:{render:room},terminal:{render:terminal},introduction:{render:introduction},guide:{render:guide},
 auth:{render:vm=>renderAuth(vm.screen,vm),requiredStates:['login','signup-invite','signup-email','invite-invalid','closed','verify','error','expired','loading','unavailable']},
 lobby:{render:renderLobby,requiredStates:['default','empty','loading','unavailable']},
 settings:{render:renderSettingsScreen,requiredStates:['overview','public','private','budget','identity','signup','deployment','loading','denied','error','conflict']}
});
export const dialogRegistry=Object.freeze({
 'public-risk':{render:createRiskDialog,requiredStates:['unchecked','checked','pending','error','rate-limited']},
 'settings-review':{render:params=>createSettingsDialog('settings-review',params),requiredStates:['default','pending','error']},
 'settings-conflict':{render:params=>createSettingsDialog('settings-conflict',params),requiredStates:['default','unavailable']},
 'settings-reload':{render:params=>createSettingsDialog('settings-reload',params),requiredStates:['default']},
 'settings-leave':{render:params=>createSettingsDialog('settings-leave',params),requiredStates:['default']}
});
export function renderScreen(screenId,...args){
 const screen=screenRegistry[screenId];
 if(!screen)throw Error('UNKNOWN_SCREEN');
 return screen.render(...args);
}
