// This boundary accepts the actual admin projection, never a local cost seed.
export function mapBudget(data){
 const invalid=()=>{throw Object.assign(Error('INVALID_BUDGET'),{code:'INVALID_BUDGET'});};
 const count=value=>Number.isSafeInteger(value)&&value>=0;
 if(!data||!['day','month','next_day_at','next_month_at'].every(key=>typeof data.windows?.[key]==='string'))invalid();
 if(!Array.isArray(data.usage)||data.usage.length!==6||new Set(data.usage.map(row=>row.kind)).size!==6)invalid();
 for(const row of data.usage)if(typeof row.kind!=='string'||!['count','bytes','seconds'].includes(row.unit)||!['day','month'].every(window=>count(row[window]?.reserved)&&count(row[window]?.limit)))invalid();
 if(!count(data.estimate?.day_micro_usd)||!count(data.estimate?.month_micro_usd)||typeof data.estimate.warning_reached!=='boolean'||typeof data.estimate.cutoff_exceeded!=='boolean')invalid();
 if(!['target_usd','warning_usd','cutoff_usd'].every(key=>count(data.thresholds?.[key])))invalid();
 const model=data.model;
 if(model?.version!=='CF-reference-v1'||model.currency!=='USD'||model.scope!=='cloudflare_reference_not_node_operating_cost'||model.actual_invoice!==false||model.email_pricing!=='planned_one_cent_per_attempt')invalid();
 if(!['micro_usd_per_usd','included_usage','fixed_month_micro_usd','reservation_base_micro_usd'].every(key=>count(model[key]))||model.micro_usd_per_usd===0)invalid();
 if(!['admission_request_micro_usd','response_bytes_per_micro_usd','active_room_second_micro_usd','persistent_write_bytes_per_micro_usd','email_attempt_micro_usd'].every(key=>count(model.rates?.[key])))invalid();
 if(Object.hasOwn(data,'recovery')){
  const recovery=data.recovery;
  if(!['minute','day','month'].every(key=>count(recovery?.bounds?.[key])&&count(recovery?.usage?.[key]))||!count(recovery?.response_bytes_limit)
   ||!['next_minute_at','next_day_at','next_month_at'].every(key=>typeof recovery?.[key]==='string'))invalid();
 }
 return structuredClone(data);
}
