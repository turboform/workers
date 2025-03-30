import Stripe from 'stripe'
import { supabaseAdminClient } from 'utils/clients/supabase/admin'

export const upsertProductRecord = async (product: Stripe.Product) => {
  const { error } = await supabaseAdminClient
    .from('products')
    .upsert({
      id: product.id,
      active: product.active,
      name: product.name,
      description: product.description,
      image: product.images?.[0] ?? null,
      metadata: product.metadata
    })

  if (error) {
    console.error(`Error occurred while saving the product: ${error.message}`)
  } else {
    console.log(`Product saved: ${product.id}`)
  }
}

export const deleteProductRecord = async (product: Stripe.Product) => {
  const { error: priceDeleteError } = await supabaseAdminClient
    .from('prices')
    .delete()
    .match({ product_id: product.id })

  if (!priceDeleteError) {
    const { error: productDeleteError } = await supabaseAdminClient
      .from('products')
      .delete()
      .match({ id: product.id })

    if (productDeleteError) {
      console.error(`Error occurred while deleting the product: ${productDeleteError.message}`)
    } else {
      console.log(`Prices and product deleted: ${product.id}`)
    }
  } else {
    console.error(`Error occurred while deleting the prices for product: ${priceDeleteError.message}`)
  }
}
