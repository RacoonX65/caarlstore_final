import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { createClient } from "@/lib/supabase/server"
import { CartItems } from "@/components/cart-items"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default async function CartPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Fetch cart items with product details (only for authenticated users)
  let cartItems = null
  let subtotal = 0

  if (user) {
    const { data } = await supabase
      .from("cart_items")
      .select(
        `
        *,
        products (
          id,
          name,
          price,
          image_url,
          stock_quantity
        )
      `,
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    cartItems = data

    subtotal =
      cartItems?.reduce((sum, item) => {
        const product = item.products as any
        return sum + product.price * item.quantity
      }, 0) || 0
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="flex-1">
        <div className="container mx-auto px-4 py-12">
          <h1 className="text-4xl font-serif font-semibold mb-8">Shopping Cart</h1>

          {cartItems && cartItems.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Cart Items */}
              <div className="lg:col-span-2">
                <CartItems cartItems={cartItems || []} user={user} />
              </div>

              <div className="lg:col-span-1">
                <div className="mt-8">
                  {/* This div will be updated by the CartItems component based on cart state */}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-16">
              <p className="text-xl text-muted-foreground mb-6">Your cart is empty</p>
              <Button asChild size="lg" className="bg-primary hover:bg-accent">
                <Link href="/products">Start Shopping</Link>
              </Button>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
