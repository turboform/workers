import Stripe from 'stripe'
import { supabaseAdminClient } from 'utils/clients/supabase/admin'
import { supportedImageTypes } from 'lib/types/supported-image-types'
import { stripeClient } from 'utils/clients/stripe'
import { Database } from 'lib/types/database.types'
import { AppContext } from 'lib/types/app-context'
import { Logger } from 'utils/error-handling'

type Subscription = Database['public']['Tables']['subscriptions']['Row']

export const getSubscriptionForUser = async (c: AppContext, userId: string): Promise<Subscription | null> => {
  const { data, error } = await supabaseAdminClient(c)
    .from('subscriptions')
    .select('*, prices(*, products(*))')
    .in('status', ['active'])
    .eq('user_id', userId)
    .single()

  if (error) {
    return null
  } else {
    return data as Subscription
  }
}

export const manageSubscriptionStatusChange = async (
  c: AppContext,
  subscriptionId: string,
  customerId: string,
  createAction: boolean = false
) => {
  const { data, error: noCustomerError } = await supabaseAdminClient(c)
    .from('stripe_customers')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single()

  if (noCustomerError) {
    Logger.error(`Customer with Stripe ID ${customerId} not found.`, noCustomerError, c)
    return
  }

  const stripe = stripeClient(c.env.STRIPE_SECRET_KEY_LIVE)
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['default_payment_method'],
  })

  const { error } = await supabaseAdminClient(c)
    .from('subscriptions')
    .upsert([
      {
        id: subscription.id,
        user_id: data.user_id,
        metadata: subscription.metadata || null,
        status:
          subscription.status === 'active' ||
          subscription.status === 'canceled' ||
          subscription.status === 'incomplete' ||
          subscription.status === 'incomplete_expired' ||
          subscription.status === 'past_due' ||
          subscription.status === 'unpaid'
            ? subscription.status
            : null,
        price_id: subscription.items.data[0].price.id,
        quantity: subscription.items.data[0].quantity || null,
        cancel_at_period_end: subscription.cancel_at_period_end,
        cancel_at: subscription.cancel_at ? toDateTime(subscription.cancel_at) : null,
        canceled_at: subscription.canceled_at ? toDateTime(subscription.canceled_at) : null,
        current_period_start: toDateTime(subscription.current_period_start),
        current_period_end: toDateTime(subscription.current_period_end),
        created: toDateTime(subscription.created),
        ended_at: subscription.ended_at ? toDateTime(subscription.ended_at) : null,
      },
    ])

  if (error) {
    Logger.error(`An error occurred while saving subscription: ${error.message}`, error, c)
  } else {
    Logger.info(`Saved subscription ${subscription.id} for user ${data.user_id}`, c)
  }

  if (createAction && subscription.default_payment_method) {
    await copyBillingDetailsToCustomer(c, data.user_id, subscription.default_payment_method)
  }
}

export const updateStripeUserDetails = async (
  c: AppContext,
  customerId: string,
  address: Stripe.Address,
  payment_method: string
) => {
  const { data, error: noCustomerError } = await supabaseAdminClient(c)
    .from('stripe_customers')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single()

  if (noCustomerError) {
    Logger.error(`Customer with Stripe ID ${customerId} not found.`, noCustomerError, c)
    return
  }

  if (payment_method) {
    const stripe = stripeClient(c.env.STRIPE_SECRET_KEY_LIVE)
    const paymentMethod = await stripe.paymentMethods.retrieve(payment_method)
    const { error: updatePaymentMethodError } = await supabaseAdminClient(c)
      .from('user_details')
      .update({
        payment_method: paymentMethod[paymentMethod.type] as any,
      })
      .eq('id', data.user_id)

    if (updatePaymentMethodError) {
      Logger.error(
        `An error occurred while updating payment method: ${updatePaymentMethodError.message}`,
        updatePaymentMethodError,
        c
      )
    }
  }

  if (address) {
    const { error } = await supabaseAdminClient(c)
      .from('user_details')
      .update({
        billing_address: address as any,
      })
      .eq('id', data.user_id)

    if (error) {
      Logger.error(`An error occurred while updating user details: ${error.message}`, error, c)
    }
  }
}

export const deleteUser = async (c: AppContext, userId: string) => {
  // delete user profile pictures
  const fileName = Buffer.from(userId.replace(/-/g, ''), 'base64').toString('base64')
  const filePaths = supportedImageTypes.map((t) => `public/${fileName}${t.extension}`)
  const { error: profilePicError } = await supabaseAdminClient(c).storage.from('avatars').remove(filePaths)

  const { error: stripeCustomerError } = await supabaseAdminClient(c)
    .from('stripe_customers')
    .delete()
    .match({ user_id: userId })

  const { error: subscriptionError } = await supabaseAdminClient(c)
    .from('subscriptions')
    .delete()
    .match({ user_id: userId })

  const { error: userDetailError } = await supabaseAdminClient(c).from('user_details').delete().match({ id: userId })

  const { error: userDeleteError } = await supabaseAdminClient(c).auth.admin.deleteUser(userId)

  if (profilePicError || stripeCustomerError || subscriptionError || userDetailError || userDeleteError) {
    throw `Failed to delete user:
      Profile picture delete error: ${profilePicError?.message}
      Stripe customer delete error: ${stripeCustomerError?.message}
      Subscription delete error: ${subscriptionError?.message}
      User detail delete error: ${userDetailError?.message}
      User delete error: ${userDeleteError?.message}`
  }
}

const copyBillingDetailsToCustomer = async (
  c: AppContext,
  uuid: string,
  payment_method: Stripe.PaymentMethod | string
) => {
  if (typeof payment_method !== 'string') {
    const { address } = payment_method.billing_details
    const { error } = await supabaseAdminClient(c)
      .from('user_details')
      .update({
        billing_address: address as any,
        payment_method: payment_method[payment_method.type] as any,
      })
      .eq('id', uuid)

    if (error) {
      Logger.error(`An error occurred while updating user details: ${error.message}`, error, c)
    }
  }
}

const toDateTime = (secs: number) => {
  const date = new Date(secs * 1000)
  return date.toISOString()
}
