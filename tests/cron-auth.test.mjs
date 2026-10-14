import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {NextRequest} from 'next/server';
import {GET as wallets} from '../app/api/cron/wallets/route.ts';
import {GET as backup} from '../app/api/cron/loyalty-backup/route.ts';
test('cron endpoints reject missing, wrong and multibyte authentication before any data or delivery operation',async()=>{
  process.env.CRON_SECRET='a'.repeat(64);
  for(const handler of [wallets,backup])for(const authorization of ['', 'Bearer incorrect','é'.repeat(71)]){
    assert.equal((await handler(new NextRequest('https://fixture.invalid/cron',{headers:{authorization}}))).status,401);
  }
});
