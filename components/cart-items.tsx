"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Minus, Plus, Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { guestCartUtils, type GuestCartItem } from "@/lib/guest-checkout"
import type { User } from "@supabase/supabase-js"

interface CartItemsProps {
  cartItems: any[]
  user: User | null
}

export function CartItems({ cartItems, user }: CartItemsProps) {
  const [isUpdating, setIsUpdating] = useState<string | null>(null)
  const [guestItems, setGuestItems] = useState<GuestCartItem[]>([])
  const [products, setProducts] = useState<any[]>([])
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  // Load guest cart items and fetch product details
  useEffect(() => {
    if (!user) {
      const loadGuestCart = async () => {
        const guestCart = guestCartUtils.getCart()
        setGuestItems(guestCart)

        // Fetch product details for guest cart items
        if (guestCart.length > 0) {
          const productIds = guestCart.map(item => item.product_id)
          const { data: productData } = await supabase
            .from("products")
            .select("*")
            .in("id", productIds)

          setProducts(productData || [])
        }
      }
      loadGuestCart()
    }
  }, [user, supabase])

  // Get the items to display (either authenticated user's cart or guest cart)
  const displayItems = user ? cartItems : guestItems.map(guestItem => {
    const product = products.find(p => p.id === guestItem.product_id)
    return {
      id: guestItem.id,
      quantity: guestItem.quantity,
      size: guestItem.size,
      color: guestItem.color,
      products: product
    }
  }).filter(item => item.products) // Only show items where we have product data

  // Calculate subtotal
  const subtotal = displayItems.reduce((sum, item) => {
    const product = item.products
    return sum + (product?.price || 0) * item.quantity
  }, 0)

  const updateQuantity = async (itemId: string, newQuantity: number, maxStock: number) => {
    if (newQuantity < 1 || newQuantity > maxStock) return

    setIsUpdating(itemId)
    try {
      if (user) {
        // Authenticated user - update in database
        const { error } = await supabase
          .from("cart_items")
          .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
          .eq("id", itemId)

        if (error) throw error
        router.refresh()
      } else {
        // Guest user - update in localStorage
        guestCartUtils.updateQuantity(itemId, newQuantity)
        const updatedCart = guestCartUtils.getCart()
        setGuestItems(updatedCart)
      }
    } catch (error) {
      console.error("Error updating quantity:", error)
      toast({
        title: "Error",
        description: "Failed to update quantity. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsUpdating(null)
    }
  }

  const removeItem = async (itemId: string) => {
    setIsUpdating(itemId)
    try {
      if (user) {
        // Authenticated user - remove from database
        const { error } = await supabase.from("cart_items").delete().eq("id", itemId)
        if (error) throw error
        router.refresh()
      } else {
        // Guest user - remove from localStorage
        guestCartUtils.removeItem(itemId)
        const updatedCart = guestCartUtils.getCart()
        setGuestItems(updatedCart)
      }

      toast({
        title: "Item removed",
        description: "Item has been removed from your cart.",
      })
    } catch (error) {
      console.error("Error removing item:", error)
      toast({
        title: "Error",
        description: "Failed to remove item. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsUpdating(null)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Cart Items */}
      <div className="lg:col-span-2">
        {displayItems.length > 0 ? (
          <div className="space-y-4">
            {displayItems.map((item) => {
              const product = item.products as any
              const itemTotal = product.price * item.quantity

              return (
                <div key={item.id} className="bg-card border rounded-lg p-4 flex gap-4">
                  {/* Product Image */}
                  <div className="w-24 h-32 relative flex-shrink-0 overflow-hidden rounded-md bg-muted">
                    <Image
                      src={
                        product.image_url || `/placeholder.svg?height=128&width=96&query=${encodeURIComponent(product.name)}`
                      }
                      alt={product.name}
                      fill
                      className="object-cover"
                    />
                  </div>

                  {/* Product Details */}
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-medium mb-1">{product.name}</h3>
                      <div className="text-sm text-muted-foreground space-y-1">
                        {item.size && <p>Size: {item.size}</p>}
                        {item.color && <p>Color: {item.color}</p>}
                        <p className="font-semibold text-foreground">R {product.price.toFixed(2)}</p>
                      </div>
                    </div>

                    {/* Quantity Controls */}
                    <div className="flex items-center justify-between mt-4">
                      <div className="flex items-center border rounded-md">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => updateQuantity(item.id, item.quantity - 1, product.stock_quantity)}
                          disabled={isUpdating === item.id || item.quantity <= 1}
                          className="h-8 w-8"
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-10 text-center text-sm font-medium">{item.quantity}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => updateQuantity(item.id, item.quantity + 1, product.stock_quantity)}
                          disabled={isUpdating === item.id || item.quantity >= product.stock_quantity}
                          className="h-8 w-8"
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>

                      <div className="flex items-center gap-4">
                        <span className="font-semibold">R {itemTotal.toFixed(2)}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItem(item.id)}
                          disabled={isUpdating === item.id}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-lg text-muted-foreground mb-4">Your cart is empty</p>
            <Link href="/products">
              <Button>Continue Shopping</Button>
            </Link>
          </div>
        )}
      </div>

      {/* Order Summary */}
      {displayItems.length > 0 && (
        <div className="lg:col-span-1">
          <div className="bg-card border rounded-lg p-6 sticky top-24">
            <h2 className="text-xl font-semibold mb-6">Order Summary</h2>
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">R {subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Delivery</span>
                <span className="font-medium">Calculated at checkout</span>
              </div>
              <div className="border-t pt-4">
                <div className="flex justify-between text-lg font-semibold">
                  <span>Total</span>
                  <span>R {subtotal.toFixed(2)}</span>
                </div>
              </div>
              <Button asChild className="w-full h-12 bg-primary hover:bg-accent" size="lg">
                <Link href="/checkout">Proceed to Checkout</Link>
              </Button>
              <Button asChild variant="outline" className="w-full bg-transparent" size="lg">
                <Link href="/products">Continue Shopping</Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
