import { AppContext } from 'lib/types/app-context'
import { stripeClient } from 'utils/clients/stripe'
import { supabaseAdminClient } from 'utils/clients/supabase/admin'
import { Logger } from 'utils/error-handling'

export const getOrCreateCustomer = async (c: AppContext, userId: string, email: string): Promise<string | null> => {
  const { data, error: selectError } = await supabaseAdminClient(c)
    .from('stripe_customers')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .single()

  if (selectError || !data) {
    const customerData = {
      email: email,
      metadata: {
        supabaseUUID: userId,
      },
    }

    const stripe = stripeClient(c.env.STRIPE_SECRET_KEY_LIVE)
    const customer = await stripe.customers.create(customerData)
    const { error: insertError } = await supabaseAdminClient(c)
      .from('stripe_customers')
      .insert([
        {
          user_id: userId,
          stripe_customer_id: customer.id,
        },
      ])

    if (insertError) {
      Logger.error('Error inserting customer', insertError, c)
      return null
    }

    return customer.id
  }

  return data?.stripe_customer_id
}

export const deleteCustomer = async (c: AppContext, stripeCustomerId: string) => {
  const { data, error: selectError } = await supabaseAdminClient(c)
    .from('stripe_customers')
    .select('user_id')
    .eq('stripe_customer_id', stripeCustomerId)
    .single()

  if (selectError) {
    Logger.warn(`Customer with ID '${stripeCustomerId}' does not exist. Error: ${selectError.message}`, c)
    return
  }

  const { error: deleteSubscriptionError } = await supabaseAdminClient(c)
    .from('subscriptions')
    .delete()
    .match({ user_id: data.user_id })

  if (deleteSubscriptionError) {
    Logger.warn(
      `Could not delete subscription for customer with ID '${stripeCustomerId}'. Error: ${deleteSubscriptionError.message}`,
      c
    )
    return
  }

  const { error: deleteCustomerError } = await supabaseAdminClient(c)
    .from('stripe_customers')
    .delete()
    .match({ stripe_customer_id: stripeCustomerId })

  if (deleteCustomerError) {
    Logger.warn(`Could not delete customer with ID '${stripeCustomerId}'. Error: ${deleteCustomerError.message}`, c)
  } else {
    Logger.info(`Customer with ID '${stripeCustomerId}' deleted successfully.`, c)
  }
}
