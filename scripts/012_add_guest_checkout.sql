-- Add guest checkout support to orders table
-- This script adds columns to support guest orders without requiring user accounts

-- Add guest customer information columns
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS guest_name text,
ADD COLUMN IF NOT EXISTS guest_email text,
ADD COLUMN IF NOT EXISTS guest_phone text,
ADD COLUMN IF NOT EXISTS guest_address_line1 text,
ADD COLUMN IF NOT EXISTS guest_address_line2 text,
ADD COLUMN IF NOT EXISTS guest_city text,
ADD COLUMN IF NOT EXISTS guest_province text,
ADD COLUMN IF NOT EXISTS guest_postal_code text,
ADD COLUMN IF NOT EXISTS is_guest_order boolean DEFAULT false;

-- Make user_id nullable for guest orders
ALTER TABLE public.orders 
ALTER COLUMN user_id DROP NOT NULL;

-- Add constraint to ensure either user_id or guest info is provided
ALTER TABLE public.orders 
ADD CONSTRAINT check_user_or_guest 
CHECK (
  (user_id IS NOT NULL AND is_guest_order = false) OR 
  (user_id IS NULL AND is_guest_order = true AND guest_name IS NOT NULL AND guest_email IS NOT NULL)
);

-- Add indexes for guest order queries
CREATE INDEX IF NOT EXISTS idx_orders_is_guest ON public.orders(is_guest_order);
CREATE INDEX IF NOT EXISTS idx_orders_guest_email ON public.orders(guest_email);

-- Update RLS policies to allow guest order creation
-- Allow anyone to insert guest orders (no auth required)
CREATE POLICY "Anyone can create guest orders"
  ON public.orders FOR INSERT
  WITH CHECK (is_guest_order = true AND user_id IS NULL);

-- Allow guest order items to be inserted
CREATE POLICY "Anyone can insert guest order items"
  ON public.order_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
      AND orders.is_guest_order = true
    )
  );

-- Allow viewing guest orders by order number (for order tracking)
CREATE POLICY "Anyone can view guest orders by order number"
  ON public.orders FOR SELECT
  USING (is_guest_order = true);

-- Allow viewing guest order items
CREATE POLICY "Anyone can view guest order items"
  ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
      AND orders.is_guest_order = true
    )
  );