import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {assertLoyaltyDatabase} from '../lib/loyalty-config.ts';

test('production accepts the permanent direct and pooled endpoints',()=>{
  for(const host of ['ep-quiet-union-acj8tg2k.sa-east-1.aws.neon.tech','ep-quiet-union-acj8tg2k-pooler.sa-east-1.aws.neon.tech','ep-quiet-union-acj8tg2k.c-3.sa-east-1.aws.neon.tech']) {
    assert.doesNotThrow(()=>assertLoyaltyDatabase('postgresql://fixture:fixture@'+host+'/neondb','production'));
  }
});
test('production refuses a missing, invalid or temporary database before issuing a card',()=>{
  for(const url of [undefined,'invalid','postgresql://fixture:fixture@ep-temporary.sa-east-1.aws.neon.tech/neondb','postgresql://fixture:fixture@ep-quiet-union-acj8tg2k.example.org/neondb']) {
    assert.throws(()=>assertLoyaltyDatabase(url,'production'));
  }
});
test('local and preview validation can use an isolated database',()=>{
  assert.doesNotThrow(()=>assertLoyaltyDatabase(undefined));
  assert.doesNotThrow(()=>assertLoyaltyDatabase('postgresql://fixture:fixture@ep-temporary.sa-east-1.aws.neon.tech/neondb','preview'));
});
