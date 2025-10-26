import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { CheckoutForm } from "@/components/checkout-form"
import { GuestCheckoutForm } from "@/components/guest-checkout-form"

export default async function CheckoutPage() {
  const supabase = await createClient()
  
  // Get user session
  const { data: { user } } = await supabase.auth.getUser()
  
  let cartItems: any[] | null = null
  let addresses: any[] | null = null
  let profile: any | null = null
  let guestProducts: any[] | null = null
  let subtotal = 0

  if (user) {
    // Fetch user-specific data only if authenticated
    const [cartResponse, addressResponse, profileResponse] = await Promise.all([
      supabase
        .from("cart_items")
        .select(`
          id,
          quantity,
          size,
          color,
          product:products (
            id,
            name,
            price,
            image_url,
            stock_quantity
          )
        `)
        .eq("user_id", user.id),
      
      supabase
        .from("addresses")
        .select("*")
        .eq("user_id", user.id),
      
      supabase
        .from("profiles")
        .select("phone")
        .eq("id", user.id)
        .single()
    ])

    cartItems = cartResponse.data
    addresses = addressResponse.data
    profile = profileResponse.data

    // Calculate subtotal for authenticated users
    if (cartItems) {
      subtotal = cartItems.reduce((total, item) => {
        return total + (item.product?.price || 0) * item.quantity
      }, 0)
    }
  } else {
    // For guest users, fetch all products so they can be matched with cart items
    const { data: productsData } = await supabase
      .from("products")
      .select("id, name, price, image_url, stock_quantity")
    
    guestProducts = productsData || []
  }

  // For guest users, we'll let the component handle cart loading from localStorage
  // No redirect for guest users - they should be able to checkout

  // If authenticated user has no cart items, redirect to cart
  if (user && (!cartItems || cartItems.length === 0)) {
    redirect("/cart")
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="flex-1">
        <div className="container mx-auto px-4 py-12">
          <h1 className="text-4xl font-serif font-semibold mb-8">Checkout</h1>

          {user ? (
            <CheckoutForm
              cartItems={cartItems || []}
              addresses={addresses || []}
              subtotal={subtotal}
              userEmail={user.email || ""}
              userPhone={profile?.phone || ""}
            />
          ) : (
            <GuestCheckoutForm 
              cartItems={[]}
              products={guestProducts || []}
              subtotal={0}
            />
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
