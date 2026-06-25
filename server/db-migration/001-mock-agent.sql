-- Create a mock agent
INSERT INTO public.users (name, email, password, role)
VALUES ('Zăn Cao', 'zancao.agent@estate.test', 'mockpass', 'AGENT')
RETURNING id;

-- Wait, since we are returning ID, let's just make sure it exists, or insert and then update some properties.
-- For a safe idempotent script:

DO $$ 
DECLARE
  v_agent_id integer;
BEGIN
  -- Insert the agent if not exists
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE email = 'zancao.agent@estate.test') THEN
    INSERT INTO public.users (name, email, password, role)
    VALUES ('Zăn Cao', 'zancao.agent@estate.test', 'mockpass', 'AGENT')
    RETURNING id INTO v_agent_id;
  ELSE
    SELECT id INTO v_agent_id FROM public.users WHERE email = 'zancao.agent@estate.test';
  END IF;

  -- Assign some existing properties to this agent (let's say the first 3 properties)
  UPDATE public.properties 
  SET owner_id = v_agent_id, views = floor(random() * 50 + 10)::int
  WHERE id IN (
    SELECT id FROM public.properties ORDER BY id LIMIT 3
  );

  -- Add some mock favorites for these properties if they don't have any
  -- (assuming we have at least one normal user to favorite them)
  -- But we can skip doing complex favorite logic and just let the app use real favorites.
END $$;