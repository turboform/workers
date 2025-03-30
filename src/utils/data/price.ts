import Stripe from 'stripe'
import { supabaseAdminClient } from 'utils/clients/supabase/admin'

export const upsertPriceRecord = async (price: Stripe.Price) => {
  const { error } = await supabaseAdminClient
    .from('prices')
    .upsert({
      id: price.id,
      product_id: price.product,
      active: price.active,
      currency: price.currency,
      description: price.nickname,
      type: price.type,
      unit_amount: price.unit_amount,
      interval: price.recurring?.interval ?? null,
      interval_count: price.recurring?.interval_count ?? null,
      trial_period_days: price.recurring?.trial_period_days ?? null,
      metadata: price.metadata
    })

  if (error) {
    console.error(`Error occurred while saving the price: ${error.message}`)
  } else {
    console.log(`Price saved: ${price.id}`)
  }
}

export const deletePriceRecord = async (price: Stripe.Price) => {
  const { error } = await supabaseAdminClient
    .from('prices')
    .delete()
    .match({ id: price.id })

  if (error) {
    console.error(`Error occurred while deleting the price: ${error.message}`)
  } else {
    console.log(`Price deleted: ${price.id}`)
  }
}
