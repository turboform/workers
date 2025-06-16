import { AppContext } from 'lib/types/app-context'
import Stripe from 'stripe'
import { supabaseAdminClient } from 'utils/clients/supabase/admin'
import { Logger } from 'utils/error-handling'

export const upsertProductRecord = async (c: AppContext, product: Stripe.Product) => {
  const { error } = await supabaseAdminClient(c)
    .from('products')
    .upsert({
      id: product.id,
      active: product.active,
      name: product.name,
      description: product.description,
      image: product.images?.[0] ?? null,
      metadata: product.metadata,
    })

  if (error) {
    Logger.error(`Error occurred while saving the product: ${error.message}`, error, c)
  } else {
    Logger.info(`Product saved: ${product.id}`, c)
  }
}

export const deleteProductRecord = async (c: AppContext, product: Stripe.Product) => {
  const { error: priceDeleteError } = await supabaseAdminClient(c)
    .from('prices')
    .delete()
    .match({ product_id: product.id })

  if (!priceDeleteError) {
    const { error: productDeleteError } = await supabaseAdminClient(c)
      .from('products')
      .delete()
      .match({ id: product.id })

    if (productDeleteError) {
      Logger.error(`Error occurred while deleting the product: ${productDeleteError.message}`, productDeleteError, c)
    } else {
      Logger.info(`Prices and product deleted: ${product.id}`, c)
    }
  } else {
    Logger.error(
      `Error occurred while deleting the prices for product: ${priceDeleteError.message}`,
      priceDeleteError,
      c
    )
  }
}
