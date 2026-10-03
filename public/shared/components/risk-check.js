import {escapeHtml as E} from './auth-primitives.js';
export function renderRiskCheck({id,name=id,label,checked=false,disabled=false}){
 return `<label class="check-row"><input id="${E(id)}" name="${E(name)}" type="checkbox" ${checked?'checked':''} ${disabled?'disabled':''}><span>${E(label)}</span></label>`;
}
