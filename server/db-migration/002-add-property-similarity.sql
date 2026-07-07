-- Alter properties table to add floor_range
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS floor_range VARCHAR(50);

-- Create property_links table to store similarity relationships
CREATE TABLE IF NOT EXISTS public.property_links (
  id SERIAL PRIMARY KEY,
  property_id_1 INT REFERENCES public.properties(id) ON DELETE CASCADE,
  property_id_2 INT REFERENCES public.properties(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_property_link UNIQUE (property_id_1, property_id_2),
  CONSTRAINT check_property_order CHECK (property_id_1 < property_id_2)
);
