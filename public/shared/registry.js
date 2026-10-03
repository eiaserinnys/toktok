import {renderServiceDescription} from './components/service-description.js';
import {renderPublicCatalog} from './components/public-catalog.js';
import {renderRiskCheck} from './components/risk-check.js';
import {renderAdminLogs} from './screens/adminlogs.js';
import {createInvitationDialog} from './dialogs/invitations.js';
import {renderNewRoom} from './screens/newroom.js';
import {renderClaim} from './screens/claim.js';
import {renderAccount} from './screens/account.js';
import {createAgentRevokeDialog} from './dialogs/identity.js';
import {renderBudgetUsage} from './components/budget-usage.js';
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
 'public-catalog':{render:renderPublicCatalog,requiredStates:['ready','empty','loading','unavailable']},
 'service-description':{render:renderServiceDescription,requiredStates:['default']},
 'risk-check':{render:renderRiskCheck,requiredStates:['unchecked','checked','disabled']},
 'budget-usage':{render:renderBudgetUsage,requiredStates:['default','warning','cutoff','loading','unavailable','recovery-unavailable']},
 'agent-safety':{render:renderAgentSafety,requiredStates:['service-owned']},
 icon:{render:icon,requiredStates:['default']},
 header:{render:header,requiredStates:['default']},
 message:{render:message,requiredStates:['default','long']},
 person:{render:person,requiredStates:['default','long']},
 select:{render:renderSelect,requiredStates:['default','disabled','long','opened']},
 'product-header':{render:renderProductHeader,requiredStates:['anonymous','member','admin','loading','unavailable','member-open','admin-open','logout-pending','logout-error']},
 'setting-field':{render:renderSettingField,requiredStates:['number','enum','readonly-off']},
 'settings-fields':{render:renderSettingsFields,requiredStates:['catalog','empty','max','workload','nested','readonly-off']}
});
export const screenRegistry=Object.freeze({
 adminlogs:{render:renderAdminLogs,requiredStates:['invitations','empty-invitations','used','expired','revoked','audit','empty-audit','loading','denied','unavailable','error']},
 newroom:{render:renderNewRoom,requiredStates:['anonymous','member','persist','created-memory','created-persisted','pending','lost','denied','loading','unavailable']},
 claim:{render:renderClaim,requiredStates:['anonymous','unchecked','checked','pending','approved','error','expired','loading','unavailable']},
 account:{render:renderAccount,requiredStates:['default','revoked','empty','anonymous','loading','unavailable','error']},
 room:{render:room,requiredStates:['public','memory','persisted','history-gap','history-reset','paused','rate-limited','header-member','header-admin','header-loading','header-unavailable']},terminal:{render:terminal,requiredStates:['anonymous','member','admin','loading','unavailable']},introduction:{render:introduction,requiredStates:['anonymous','member','admin','loading','unavailable']},guide:{render:guide,requiredStates:['anonymous','member','admin','loading','unavailable','logout-error']},
 auth:{render:vm=>renderAuth(vm.screen,vm),requiredStates:['claim-email','claim-verify','claim-otp-error','login','signup-invite','signup-email','invite-invalid','closed','verify','error','expired','loading','unavailable']},
 lobby:{render:renderLobby,requiredStates:['default','empty','loading','unavailable']},
 settings:{render:renderSettingsScreen,requiredStates:['overview','public','private','budget','identity','signup','deployment','loading','denied','error','conflict','budget-loading','budget-unavailable']}
});
export const dialogRegistry=Object.freeze({
 'invitation-create':{render:params=>createInvitationDialog({kind:'invitation-create',...params}),requiredStates:['default','pending','error']},
 'invitation-created':{render:params=>createInvitationDialog({kind:'invitation-created',...params}),requiredStates:['one-time']},
 'invitation-revoke':{render:params=>createInvitationDialog({kind:'invitation-revoke',...params}),requiredStates:['default','pending','error']},
 'agent-revoke':{render:createAgentRevokeDialog,requiredStates:['default','pending','error']},
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
