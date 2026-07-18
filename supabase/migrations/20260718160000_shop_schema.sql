-- Shop schema: products, images, orders, Stripe event idempotency, atomic fulfillment.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  title text NOT NULL,
  description text,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  currency text NOT NULL DEFAULT 'usd',
  inventory integer NOT NULL CHECK (inventory >= 0),
  published boolean NOT NULL DEFAULT false,
  stripe_product_id text,
  stripe_price_id text,
  shipping_required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_slug_unique UNIQUE (slug)
);

CREATE INDEX products_published_slug_idx
  ON public.products (slug)
  WHERE published = true;

CREATE INDEX products_published_idx
  ON public.products (published)
  WHERE published = true;

CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- product_images
-- ---------------------------------------------------------------------------
CREATE TABLE public.product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  alt_text text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX product_images_product_id_sort_idx
  ON public.product_images (product_id, sort_order);

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_checkout_session_id text NOT NULL,
  stripe_payment_intent_id text,
  stripe_refund_id text,
  product_id uuid REFERENCES public.products (id),
  quantity integer NOT NULL CHECK (quantity > 0),
  amount_total integer,
  currency text,
  customer_email text,
  fulfillment_status text NOT NULL,
  refund_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_stripe_checkout_session_id_unique UNIQUE (stripe_checkout_session_id),
  CONSTRAINT orders_fulfillment_status_check CHECK (
    fulfillment_status IN (
      'fulfilled',
      'inventory_conflict',
      'refund_pending',
      'refunded',
      'refund_failed'
    )
  ),
  CONSTRAINT orders_refund_status_check CHECK (
    refund_status IS NULL
    OR refund_status IN (
      'refund_pending',
      'refunded',
      'refund_failed'
    )
  )
);

CREATE INDEX orders_product_id_idx ON public.orders (product_id);
CREATE INDEX orders_fulfillment_status_idx ON public.orders (fulfillment_status);
CREATE INDEX orders_payment_intent_idx ON public.orders (stripe_payment_intent_id);

CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- processed_stripe_events (webhook idempotency)
-- ---------------------------------------------------------------------------
CREATE TABLE public.processed_stripe_events (
  stripe_event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Atomic checkout fulfillment
-- Returns jsonb: { status, order_id? }
--   status: fulfilled | inventory_unavailable | already_processed | product_not_found
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fulfill_checkout_session(
  p_stripe_event_id text,
  p_event_type text,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_product_id uuid,
  p_quantity integer,
  p_amount_total integer,
  p_currency text,
  p_customer_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inventory integer;
  v_order_id uuid;
  v_existing_order_id uuid;
  v_existing_fulfillment text;
BEGIN
  IF p_stripe_event_id IS NULL OR btrim(p_stripe_event_id) = '' THEN
    RAISE EXCEPTION 'stripe_event_id is required';
  END IF;

  IF p_checkout_session_id IS NULL OR btrim(p_checkout_session_id) = '' THEN
    RAISE EXCEPTION 'checkout_session_id is required';
  END IF;

  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RAISE EXCEPTION 'quantity must be >= 1';
  END IF;

  -- Duplicate Stripe event: safe no-op
  IF EXISTS (
    SELECT 1
    FROM public.processed_stripe_events
    WHERE stripe_event_id = p_stripe_event_id
  ) THEN
    SELECT id, fulfillment_status
      INTO v_existing_order_id, v_existing_fulfillment
    FROM public.orders
    WHERE stripe_checkout_session_id = p_checkout_session_id;

    RETURN jsonb_build_object(
      'status', 'already_processed',
      'order_id', v_existing_order_id,
      'fulfillment_status', v_existing_fulfillment
    );
  END IF;

  -- Same Checkout Session already fulfilled via a prior event
  SELECT id, fulfillment_status
    INTO v_existing_order_id, v_existing_fulfillment
  FROM public.orders
  WHERE stripe_checkout_session_id = p_checkout_session_id;

  IF FOUND THEN
    INSERT INTO public.processed_stripe_events (stripe_event_id, event_type)
    VALUES (p_stripe_event_id, coalesce(p_event_type, 'checkout.session.completed'))
    ON CONFLICT (stripe_event_id) DO NOTHING;

    RETURN jsonb_build_object(
      'status', 'already_processed',
      'order_id', v_existing_order_id,
      'fulfillment_status', v_existing_fulfillment
    );
  END IF;

  IF p_product_id IS NULL THEN
    INSERT INTO public.orders (
      stripe_checkout_session_id,
      stripe_payment_intent_id,
      product_id,
      quantity,
      amount_total,
      currency,
      customer_email,
      fulfillment_status,
      refund_status
    ) VALUES (
      p_checkout_session_id,
      p_payment_intent_id,
      NULL,
      p_quantity,
      p_amount_total,
      p_currency,
      p_customer_email,
      'inventory_conflict',
      'refund_pending'
    )
    RETURNING id INTO v_order_id;

    INSERT INTO public.processed_stripe_events (stripe_event_id, event_type)
    VALUES (p_stripe_event_id, coalesce(p_event_type, 'checkout.session.completed'));

    RETURN jsonb_build_object(
      'status', 'product_not_found',
      'order_id', v_order_id,
      'fulfillment_status', 'inventory_conflict'
    );
  END IF;

  SELECT inventory
    INTO v_inventory
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Product id from metadata does not exist. Record product_id as NULL to avoid
    -- the orders.product_id foreign-key violation while still capturing the paid
    -- order for refund.
    INSERT INTO public.orders (
      stripe_checkout_session_id,
      stripe_payment_intent_id,
      product_id,
      quantity,
      amount_total,
      currency,
      customer_email,
      fulfillment_status,
      refund_status
    ) VALUES (
      p_checkout_session_id,
      p_payment_intent_id,
      NULL,
      p_quantity,
      p_amount_total,
      p_currency,
      p_customer_email,
      'inventory_conflict',
      'refund_pending'
    )
    RETURNING id INTO v_order_id;

    INSERT INTO public.processed_stripe_events (stripe_event_id, event_type)
    VALUES (p_stripe_event_id, coalesce(p_event_type, 'checkout.session.completed'));

    RETURN jsonb_build_object(
      'status', 'product_not_found',
      'order_id', v_order_id,
      'fulfillment_status', 'inventory_conflict'
    );
  END IF;

  IF v_inventory >= p_quantity THEN
    UPDATE public.products
    SET inventory = inventory - p_quantity
    WHERE id = p_product_id
      AND inventory >= p_quantity;

    IF NOT FOUND THEN
      -- Race lost after lock release edge; treat as unavailable
      INSERT INTO public.orders (
        stripe_checkout_session_id,
        stripe_payment_intent_id,
        product_id,
        quantity,
        amount_total,
        currency,
        customer_email,
        fulfillment_status,
        refund_status
      ) VALUES (
        p_checkout_session_id,
        p_payment_intent_id,
        p_product_id,
        p_quantity,
        p_amount_total,
        p_currency,
        p_customer_email,
        'inventory_conflict',
        'refund_pending'
      )
      RETURNING id INTO v_order_id;

      INSERT INTO public.processed_stripe_events (stripe_event_id, event_type)
      VALUES (p_stripe_event_id, coalesce(p_event_type, 'checkout.session.completed'));

      RETURN jsonb_build_object(
        'status', 'inventory_unavailable',
        'order_id', v_order_id,
        'fulfillment_status', 'inventory_conflict'
      );
    END IF;

    INSERT INTO public.orders (
      stripe_checkout_session_id,
      stripe_payment_intent_id,
      product_id,
      quantity,
      amount_total,
      currency,
      customer_email,
      fulfillment_status,
      refund_status
    ) VALUES (
      p_checkout_session_id,
      p_payment_intent_id,
      p_product_id,
      p_quantity,
      p_amount_total,
      p_currency,
      p_customer_email,
      'fulfilled',
      NULL
    )
    RETURNING id INTO v_order_id;

    INSERT INTO public.processed_stripe_events (stripe_event_id, event_type)
    VALUES (p_stripe_event_id, coalesce(p_event_type, 'checkout.session.completed'));

    RETURN jsonb_build_object(
      'status', 'fulfilled',
      'order_id', v_order_id,
      'fulfillment_status', 'fulfilled'
    );
  END IF;

  INSERT INTO public.orders (
    stripe_checkout_session_id,
    stripe_payment_intent_id,
    product_id,
    quantity,
    amount_total,
    currency,
    customer_email,
    fulfillment_status,
    refund_status
  ) VALUES (
    p_checkout_session_id,
    p_payment_intent_id,
    p_product_id,
    p_quantity,
    p_amount_total,
    p_currency,
    p_customer_email,
    'inventory_conflict',
    'refund_pending'
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.processed_stripe_events (stripe_event_id, event_type)
  VALUES (p_stripe_event_id, coalesce(p_event_type, 'checkout.session.completed'));

  RETURN jsonb_build_object(
    'status', 'inventory_unavailable',
    'order_id', v_order_id,
    'fulfillment_status', 'inventory_conflict'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fulfill_checkout_session(
  text, text, text, text, uuid, integer, integer, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fulfill_checkout_session(
  text, text, text, text, uuid, integer, integer, text, text
) TO service_role;

-- Claim refund work only once (prevents duplicate refunds on webhook retries)
CREATE OR REPLACE FUNCTION public.claim_order_refund(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  SELECT *
    INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_order.stripe_refund_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'already_refunded',
      'stripe_refund_id', v_order.stripe_refund_id,
      'refund_status', v_order.refund_status
    );
  END IF;

  IF v_order.refund_status = 'refunded' THEN
    RETURN jsonb_build_object(
      'status', 'already_refunded',
      'stripe_refund_id', v_order.stripe_refund_id,
      'refund_status', v_order.refund_status
    );
  END IF;

  IF v_order.fulfillment_status NOT IN ('inventory_conflict', 'refund_pending', 'refund_failed')
     AND coalesce(v_order.refund_status, '') NOT IN ('refund_pending', 'refund_failed') THEN
    RETURN jsonb_build_object(
      'status', 'not_refundable',
      'fulfillment_status', v_order.fulfillment_status,
      'refund_status', v_order.refund_status
    );
  END IF;

  UPDATE public.orders
  SET
    refund_status = 'refund_pending',
    fulfillment_status = CASE
      WHEN fulfillment_status = 'fulfilled' THEN fulfillment_status
      ELSE 'inventory_conflict'
    END
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'status', 'claimed',
    'payment_intent_id', v_order.stripe_payment_intent_id,
    'amount_total', v_order.amount_total,
    'currency', v_order.currency
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_order_refund(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_order_refund(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_order_refund(
  p_order_id uuid,
  p_stripe_refund_id text,
  p_success boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  SELECT *
    INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF p_success THEN
    IF v_order.stripe_refund_id IS NOT NULL AND v_order.refund_status = 'refunded' THEN
      RETURN jsonb_build_object(
        'status', 'already_refunded',
        'stripe_refund_id', v_order.stripe_refund_id
      );
    END IF;

    UPDATE public.orders
    SET
      stripe_refund_id = coalesce(p_stripe_refund_id, stripe_refund_id),
      refund_status = 'refunded',
      fulfillment_status = 'refunded'
    WHERE id = p_order_id;

    RETURN jsonb_build_object('status', 'refunded', 'stripe_refund_id', p_stripe_refund_id);
  END IF;

  UPDATE public.orders
  SET
    refund_status = 'refund_failed',
    fulfillment_status = 'refund_failed'
  WHERE id = p_order_id;

  RETURN jsonb_build_object('status', 'refund_failed');
END;
$$;

REVOKE ALL ON FUNCTION public.complete_order_refund(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_order_refund(uuid, text, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_stripe_events ENABLE ROW LEVEL SECURITY;

-- Anonymous / authenticated: read published products only
DROP POLICY IF EXISTS products_anon_select_published ON public.products;
CREATE POLICY products_anon_select_published
  ON public.products
  FOR SELECT
  TO anon, authenticated
  USING (published = true);

-- No insert/update/delete for anon/authenticated on products (service_role bypasses RLS)

DROP POLICY IF EXISTS product_images_anon_select_published ON public.product_images;
CREATE POLICY product_images_anon_select_published
  ON public.product_images
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = product_images.product_id
        AND p.published = true
    )
  );

-- orders and processed_stripe_events: no policies for anon/authenticated
-- (deny by default under RLS; service_role bypasses)

-- ---------------------------------------------------------------------------
-- Storage bucket: product-images (public read, no public write)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO UPDATE
SET public = true;

DROP POLICY IF EXISTS product_images_storage_public_read ON storage.objects;
CREATE POLICY product_images_storage_public_read
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'product-images');

-- No INSERT / UPDATE / DELETE policies for anon/authenticated on this bucket.
-- Uploads are done via the Supabase dashboard or service_role.
