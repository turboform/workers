-- Add email column to user_details table
ALTER TABLE public.user_details ADD COLUMN email TEXT;

-- Create a unique index on the email column
CREATE UNIQUE INDEX idx_user_details_email ON public.user_details(email);

-- Drop the existing trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop the existing function
DROP FUNCTION IF EXISTS public.handle_new_signup();

-- Create the updated function to only handle non-anonymous users
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

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE PROCEDURE public.handle_new_signup();