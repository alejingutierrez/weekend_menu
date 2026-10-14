import {spawnSync} from 'node:child_process';
const result=spawnSync('npm',['audit','--omit=dev','--json'],{encoding:'utf8'});
let report;try{report=JSON.parse(result.stdout);}catch{throw new Error('Production dependency audit unavailable');}
if(!report.metadata?.vulnerabilities)throw new Error('Production dependency audit incomplete');
const known='https://github.com/advisories/GHSA-86w9-cpqp-85rv';
const findings=Object.entries(report.vulnerabilities??{}).filter(([,v])=>['high','critical'].includes(v.severity));
const blocked=findings.filter(([name,v])=>!(v.severity==='high'&&((name==='node-forge'&&v.via.every(a=>typeof a==='object'&&a.url===known))||(name==='passkit-generator'&&v.via.every(a=>a==='node-forge')))));
console.log({newHighOrCritical:blocked.map(([name])=>name),trackedUpstream:findings.length-blocked.length});
if(blocked.length)process.exit(1);
