-- Run only on a disposable Neon branch after applying LOYALTY_RECOVERY_SCHEMA.
-- No production customers are changed; failures abort this entire statement.
DO $$
DECLARE
  card customers%ROWTYPE;
  before_count integer;
  blocked boolean;
BEGIN
  SELECT count(*) INTO before_count FROM customers;
  PERFORM set_config('weekend.actor', 'integration-test', true);
  INSERT INTO customers(id,code,name,stamps,total_stamps)
    VALUES ('weekend-validation-fixture','ZZZ222','Recovery validation',9,9);

  UPDATE customers SET archived_at=now(), archived_by='integration-test',updated_at=now()
    WHERE id='weekend-validation-fixture';
  SELECT * INTO card FROM customers WHERE id='weekend-validation-fixture';
  IF card.archived_at IS NULL OR card.stamps <> 9 OR card.total_stamps <> 9 THEN
    RAISE EXCEPTION 'Archiving lost a balance';
  END IF;
  UPDATE customers SET stamps=stamps+1
    WHERE id='weekend-validation-fixture' AND archived_at IS NULL;
  IF FOUND THEN RAISE EXCEPTION 'An archived card accepted a stamp'; END IF;

  blocked := false;
  BEGIN
    DELETE FROM customers WHERE id='weekend-validation-fixture';
  EXCEPTION WHEN SQLSTATE '55000' THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Permanent deletion was not blocked'; END IF;
  blocked := false;
  BEGIN
    TRUNCATE customers CASCADE;
  EXCEPTION WHEN SQLSTATE '55000' THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Truncation was not blocked'; END IF;
  blocked := false;
  BEGIN
    UPDATE customers SET code='ZZZ333' WHERE id='weekend-validation-fixture';
  EXCEPTION WHEN SQLSTATE '55000' THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'A card code was changed'; END IF;

  UPDATE customers SET archived_at=NULL, archived_by=NULL, updated_at=now()
    WHERE id='weekend-validation-fixture';
  SELECT * INTO card FROM customers WHERE id='weekend-validation-fixture';
  IF card.archived_at IS NOT NULL OR card.stamps <> 9 THEN
    RAISE EXCEPTION 'Restoration did not preserve the balance';
  END IF;

  INSERT INTO customer_aliases(alias_id,alias_code,customer_id)
    VALUES ('weekend-validation-old-id','ZZZ999','weekend-validation-fixture');
  SELECT * INTO card FROM customers WHERE code='ZZZ999'
    OR id=(SELECT customer_id FROM customer_aliases WHERE alias_code='ZZZ999');
  IF card.id <> 'weekend-validation-fixture' THEN RAISE EXCEPTION 'Old code did not resolve'; END IF;
  SELECT * INTO card FROM customers WHERE id='weekend-validation-old-id'
    OR id=(SELECT customer_id FROM customer_aliases WHERE alias_id='weekend-validation-old-id');
  IF card.id <> 'weekend-validation-fixture' THEN RAISE EXCEPTION 'Old QR did not resolve'; END IF;
  blocked := false;
  BEGIN
    INSERT INTO customers(id,code,name) VALUES('weekend-validation-collision','ZZZ999','Collision');
  EXCEPTION WHEN unique_violation THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Recovered code could be reassigned'; END IF;

  WITH old AS (SELECT stamps AS s FROM customers
    WHERE id='weekend-validation-fixture' AND archived_at IS NULL FOR UPDATE)
  UPDATE customers c SET total_stamps=c.total_stamps+1,
    rewards_available=c.rewards_available + CASE WHEN old.s+1>=10 THEN 1 ELSE 0 END,
    total_rewards=c.total_rewards + CASE WHEN old.s+1>=10 THEN 1 ELSE 0 END,
    stamps=CASE WHEN old.s+1>=10 THEN old.s+1-10 ELSE old.s+1 END,
    last_stamp_at=now(),updated_at=now()
  FROM old WHERE c.id='weekend-validation-fixture';
  SELECT * INTO card FROM customers WHERE id='weekend-validation-fixture';
  IF card.stamps<>0 OR card.total_stamps<>10 OR card.rewards_available<>1 THEN
    RAISE EXCEPTION 'Stamp rollover lost a reward';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM loyalty_events WHERE customer_id=card.id
     AND actor='integration-test' AND operation='UPDATE'
     AND before_state->>'archived_at' IS NOT NULL AND after_state->>'archived_at' IS NULL) THEN
    RAISE EXCEPTION 'Restoration has no attributable audit history';
  END IF;
  IF (SELECT count(*) FROM customers) <> before_count+1 THEN
    RAISE EXCEPTION 'Existing customers were lost';
  END IF;
END $$;
