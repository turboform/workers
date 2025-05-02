-- Table that contains more user details
create table user_details (
  id uuid references auth.users not null primary key,
  email text,
  full_name text,
  avatar_url text,
  billing_address jsonb,
  payment_method jsonb -- expand this table with more user details
);

-- Enable Row Level Security (RLS)
alter table user_details enable row level security;
create policy "User can view their own data." on user_details for select using (auth.uid() = id);
create policy "User can update their own data." on user_details for update using (auth.uid() = id);

-- Trigger to automatically create a new user details entry when a new user signs up
CREATE FUNCTION public.handle_new_signup() RETURNS TRIGGER AS $$
BEGIN
  -- Only insert non-anonymous users (users with an email)
  IF new.email IS NOT NULL AND new.email != '' THEN
    INSERT INTO public.user_details (id, full_name, avatar_url, email)
    VALUES (
      new.id,
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'avatar_url',
      new.email
    );
  END IF;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE PROCEDURE public.handle_new_signup();

-- Table that contains a mapping of user ID to Stripe customer ID
create table stripe_customers (
  user_id uuid references auth.users not null primary key,
  stripe_customer_id text
);

-- Enable Row Level Security (RLS)
alter table stripe_customers enable row level security;

-- Table that contains Stripe product data - synced to the DB via Stripe webhooks
create table products (
  -- Product ID from Stripe
  id text primary key,
  active boolean,
  name text,
  description text,
  -- Product image URl in Stripe
  image text,
  -- Set of key-value pairs to store additional information
  metadata jsonb
);

-- Enable Row Level Security (RLS)
alter table products enable row level security;
create policy "Anyone can view products" on products for
select using (true);

-- Table that contains Stripe product pricing data - synced to the DB via Stripe webhooks
create type pricing_type as enum ('one_time', 'recurring');
create type pricing_plan_interval as enum ('month', 'year');
create table prices (
  id text primary key,
  product_id text references products,
  active boolean,
  description text,
  -- The unit amount as a positive integer in the smallest currency unit
  unit_amount bigint,
  -- Three-letter ISO currency code in lowercase
  currency text check (char_length(currency) = 3),
  type pricing_type,
  interval pricing_plan_interval,
  -- The number of intervals between subscription billings. 
  -- E.g. `interval=month` and `interval_count=3` is billed every 3 months.
  interval_count integer,
  trial_period_days integer,
  metadata jsonb
);

-- Enable Row Level Security (RLS)
alter table prices enable row level security;
create policy "Anyone can view prices" on prices for
select using (true);

-- Table that contains Stripe subscription data - synced to the DB via Stripe webhooks
create type subscription_status as enum (
  'active',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'past_due',
  'unpaid'
);

create table subscriptions (
  id text primary key,
  user_id uuid references auth.users not null,
  status subscription_status,
  price_id text references prices,
  -- Quantity multiplied by the unit amount of the price creates the amount of the subscription.
  -- Can be used to charge multiple seats.
  quantity integer,
  -- If true the subscription has been canceled by the user and will be deleted at the end of the billing period.
  cancel_at_period_end boolean,
  -- Time at which the subscription was created.
  created timestamp with time zone default timezone('utc'::text, now()) not null,
  -- Start of the current period that the subscription has been invoiced for.
  current_period_start timestamp with time zone default timezone('utc'::text, now()) not null,
  -- End of the current period that the subscription has been invoiced for. At the end of this period, a new invoice will be created.
  current_period_end timestamp with time zone default timezone('utc'::text, now()) not null,
  -- If the subscription has ended, the timestamp of the date the subscription ended.
  ended_at timestamp with time zone default timezone('utc'::text, now()),
  -- A date in the future at which the subscription will automatically get canceled.
  cancel_at timestamp with time zone default timezone('utc'::text, now()),
  -- If the subscription has been canceled, the date of that cancellation.
  -- If the subscription was canceled with `cancel_at_period_end`, `canceled_at` will still reflect the date of the initial cancellation request,
  -- not the end of the subscription period when the subscription is automatically moved to a canceled state.
  canceled_at timestamp with time zone default timezone('utc'::text, now()),
  -- Set of key-value pairs to store additional information
  metadata jsonb
);

-- Enable Row Level Security (RLS)
alter table subscriptions enable row level security;
create policy "User can view their own data." on subscriptions for select using (auth.uid() = user_id);

-- Create storage bucket
insert into storage.buckets (id, name)
values ('avatars', 'avatars');

-- Create bucket policies
create policy "Anyone can view all avatar images" on storage.objects for
select using (bucket_id = 'avatars');
create policy "User can upload their own avatar" on storage.objects for
insert with check (
    bucket_id = 'avatars'
    and auth.uid() = owner
  );
create policy "User can update their own avatar" on storage.objects for
update using (
    bucket_id = 'avatars'
    and auth.uid() = owner
  );

-- Create forms table
CREATE TABLE IF NOT EXISTS public.forms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  schema JSONB NOT NULL,
  -- Store form fields as JSON
  is_public BOOLEAN DEFAULT false,
  is_draft BOOLEAN DEFAULT true,
  short_id TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create form_responses table
CREATE TABLE IF NOT EXISTS public.form_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  form_id UUID REFERENCES public.forms(id) ON DELETE CASCADE NOT NULL,
  responses JSONB NOT NULL, -- Store responses as JSON
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Enable Row Level Security (RLS)
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_responses ENABLE ROW LEVEL SECURITY;
-- Forms RLS policies
-- Owners can do everything with their forms
CREATE POLICY "Form owners can do everything with their forms" ON public.forms FOR ALL USING (auth.uid() = user_id);
-- Public can view public forms
CREATE POLICY "Public can view public forms" ON public.forms FOR
SELECT USING (is_public = true AND is_draft = false);

-- Form responses RLS policies
-- Form owners can view all responses to their forms
CREATE POLICY "Form owners can view all responses to their forms" ON public.form_responses FOR
SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.forms
      WHERE forms.id = form_responses.form_id
        AND forms.user_id = auth.uid()
    )
  );

-- Users can create responses to forms
CREATE POLICY "Users can create responses to forms" ON public.form_responses FOR
INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.forms
      WHERE forms.id = form_responses.form_id
    )
  );

-- Create index for better performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_details_email ON public.user_details(email);
CREATE INDEX IF NOT EXISTS idx_forms_user_id ON public.forms(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_forms_short_id ON public.forms(short_id);
CREATE INDEX IF NOT EXISTS idx_form_responses_form_id ON public.form_responses(form_id);
