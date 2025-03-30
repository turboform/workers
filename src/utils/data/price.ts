import Stripe from 'stripe'
import { supabaseAdminClient } from 'utils/clients/supabase/admin'
import { Database } from 'lib/types/database.types'
import { AppContext } from 'lib/types/app-context'

export const upsertPriceRecord = async (
  c: AppContext,
  price: Stripe.Price,
) => {
  // Create a properly typed object that matches the database schema
  const priceData: Database['public']['Tables']['prices']['Insert'] = {
    id: price.id,
    product_id: typeof price.product === 'string' ? price.product : null,
    active: price.active,
    currency: price.currency,
    description: price.nickname ?? null,
    // Make sure type is one of the accepted enum values
    type: price.type === 'one_time' || price.type === 'recurring'
      ? price.type
      : null,
    unit_amount: price.unit_amount ?? null,
    // Make sure interval is one of the accepted enum values
    interval: price.recurring?.interval === 'month' || price.recurring?.interval === 'year'
      ? price.recurring.interval
      : null,
    interval_count: price.recurring?.interval_count ?? null,
    trial_period_days: price.recurring?.trial_period_days ?? null,
    metadata: price.metadata ?? null
  }

  const { error } = await supabaseAdminClient(c)
    .from('prices')
    .upsert([priceData])

  if (error) {
    console.error(`Error occurred while saving the price: ${error.message}`)
  } else {
    console.log(`Price saved: ${price.id}`)
  }
}

export const deletePriceRecord = async (
  c: AppContext,
  price: Stripe.Price,
) => {
  const { error } = await supabaseAdminClient(c)
    .from('prices')
    .delete()
    .eq('id', price.id)

  if (error) {
    console.error(`Error occurred while deleting the price: ${error.message}`)
  } else {
    console.log(`Price deleted: ${price.id}`)
  }
}
