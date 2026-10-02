// Representative native CF SQL row counts, not A actual SettingsStore workload.
const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const number=(name,fallback)=>{const n=Number(args[name]??fallback);if(!Number.isFinite(n)||n<0)throw Error('INVALID_MODEL_INPUT');return n;};
const pairs=number('reserve-cleanup-pairs',2210400),reads=pairs*14,writes=pairs*5,gb=number('gb-month',.01);
const base={reads:number('baseline-reads',0),writes:number('baseline-writes',0),gb:number('baseline-gb-month',0)};
const charge=u=>Math.max(0,u.reads-25e9)*.001/1e6+Math.max(0,u.writes-50e6)/1e6+Math.max(0,u.gb-5)*.20;
console.log(JSON.stringify({model:'representative-reserve-plus-cleanup',actual_control_workload_measured:false,pairs,usage:{rowsRead:reads,rowsWritten:writes,gb_month:gb},marginal_without_included:reads*.001/1e6+writes/1e6+gb*.20,incremental_with_baseline:charge({reads:base.reads+reads,writes:base.writes+writes,gb:base.gb+gb})-charge(base),baseline:base,prices:{included_reads:25e9,included_writes:50e6,included_gb_month:5,usd_per_million_reads:.001,usd_per_million_writes:1,usd_per_gb_month:.20},excluded:['Worker requests/CPU','DO requests/duration rounded compute units','private body writes/dedupe/metadata/alarms','email','A real receipt/accounting/cleanup counts']},null,2));
