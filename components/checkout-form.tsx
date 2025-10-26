"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DiscountCodeInput } from "@/components/discount-code-input"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import Image from "next/image"
import { Plus, MessageCircle, Check } from "lucide-react"
import { AddressDialog } from "@/components/address-dialog"
import { WhatsAppMessageButton } from "@/components/whatsapp-message-button"
import { formatOrderDetailsForCaarl, formatCustomerOrderConfirmation } from "@/lib/whatsapp"

interface CheckoutFormProps {
  cartItems: any[]
  addresses: any[]
  subtotal: number
  userEmail: string
  userPhone: string
}

const DELIVERY_OPTIONS = [
  { id: "courier_guy", name: "Courier Guy", price: 99, description: "3-5 business days" },
  { id: "pudo", name: "Pudo Locker", price: 65, description: "Collect from nearest locker" },
]

export function CheckoutForm({ cartItems, addresses, subtotal, userEmail, userPhone }: CheckoutFormProps) {
  const [selectedAddress, setSelectedAddress] = useState(addresses.find((a) => a.is_default)?.id || addresses[0]?.id)
  const [deliveryMethod, setDeliveryMethod] = useState(DELIVERY_OPTIONS[0].id)
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string; amount: number; codeId: string } | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showAddressDialog, setShowAddressDialog] = useState(false)
  const [orderCreated, setOrderCreated] = useState<any>(null)
  const [showWhatsAppMessages, setShowWhatsAppMessages] = useState(false)
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  const deliveryFee = DELIVERY_OPTIONS.find((opt) => opt.id === deliveryMethod)?.price || 0
  const discountAmount = appliedDiscount?.amount || 0
  const total = subtotal + deliveryFee - discountAmount

  const handleCheckout = async () => {
    if (!selectedAddress) {
      toast({
        title: "Address Required",
        description: "Please select a delivery address.",
        variant: "destructive",
      })
      return
    }

    // Prevent multiple clicks
    if (isProcessing) {
      return
    }

    setIsProcessing(true)
    try {
      // Check authentication with better error handling
      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (authError) {
        console.error("Auth error:", authError)
        throw new Error(`Authentication error: ${authError.message}`)
      }
      
      if (!user) {
        console.error("No user found in session")
        throw new Error("Not authenticated - please log in again")
      }

      console.log("User authenticated:", user.id)

      // Get selected address details
      const selectedAddressData = addresses.find(addr => addr.id === selectedAddress)
      if (!selectedAddressData) {
        throw new Error("Selected address not found")
      }

      // Get user profile for customer name
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single()

      const customerName = profile?.full_name || userEmail.split('@')[0]

      // Generate order number
      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`

      // Create order with WhatsApp payment status
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          order_number: orderNumber,
          total_amount: total,
          delivery_fee: deliveryFee,
          delivery_method: deliveryMethod,
          address_id: selectedAddress,
          discount_code_id: appliedDiscount?.codeId || null,
          discount_amount: discountAmount,
          status: "pending",
          payment_status: "awaiting_payment", // New status for WhatsApp flow
        })
        .select()
        .single()

      if (orderError) {
        console.error("Order creation error:", orderError)
        throw new Error(`Failed to create order: ${orderError.message}`)
      }

      if (!order) {
        throw new Error("Order creation failed: no order returned")
      }

      // Create order items
      const orderItems = cartItems.map((item) => ({
        order_id: order.id,
        product_id: item.product_id,
        quantity: item.quantity,
        price: (item.products as any).price,
        size: item.size,
        color: item.color,
      }))

      const { error: itemsError } = await supabase.from("order_items").insert(orderItems)

      if (itemsError) {
        console.error("Order items creation error:", itemsError)
        throw new Error(`Failed to create order items: ${itemsError.message}`)
      }

      // Clear cart after successful order creation
      const { error: clearCartError } = await supabase
        .from("cart_items")
        .delete()
        .eq("user_id", user.id)

      if (clearCartError) {
        console.error("Cart clearing error:", clearCartError)
        // Don't throw error here, order is already created
      }

      // Prepare order data for WhatsApp messages
      const orderData = {
        orderNumber,
        customerName,
        customerEmail: userEmail,
        customerPhone: userPhone || selectedAddressData.phone,
        deliveryAddress: selectedAddressData,
        deliveryMethod,
        deliveryFee,
        items: cartItems.map(item => ({
          name: (item.products as any).name,
          price: (item.products as any).price,
          quantity: item.quantity,
          size: item.size,
          color: item.color,
        })),
        subtotal,
        discountAmount,
        discountCode: appliedDiscount?.code,
        total,
      }

      setOrderCreated({ order, orderData })
      setShowWhatsAppMessages(true)
      setIsProcessing(false)

      toast({
        title: "Order Created Successfully! 🎉",
        description: "Please send the WhatsApp messages to complete your order.",
      })

    } catch (error) {
      console.error("Checkout error:", error)
      
      let errorMessage = "An unexpected error occurred. Please try again."
      
      if (error instanceof Error) {
        errorMessage = error.message
      } else if (typeof error === 'string') {
        errorMessage = error
      } else if (error && typeof error === 'object') {
        // Handle Supabase errors or other object errors
        if ('message' in error) {
          errorMessage = (error as any).message
        } else if ('error' in error) {
          errorMessage = (error as any).error
        } else {
          errorMessage = "Order processing failed. Please check your details and try again."
        }
      }
      
      toast({
        title: "Checkout failed",
        description: errorMessage,
        variant: "destructive",
      })
      setIsProcessing(false)
    }
  }

  const handleOrderComplete = () => {
    // Redirect to success page
    router.push(`/checkout/success?order_id=${orderCreated.order.id}`)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Checkout Form */}
      <div className="lg:col-span-2 space-y-6">
        {/* Delivery Address */}
        <Card>
          <CardHeader>
            <CardTitle>Delivery Address</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {addresses.length > 0 ? (
              <RadioGroup value={selectedAddress} onValueChange={setSelectedAddress}>
                {addresses.map((address) => (
                  <div key={address.id} className="flex items-start space-x-3 border rounded-lg p-4">
                    <RadioGroupItem value={address.id} id={`address-${address.id}`} className="mt-1" />
                    <Label htmlFor={`address-${address.id}`} className="flex-1 cursor-pointer">
                      <div className="font-medium">{address.full_name}</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {address.street_address}, {address.city}, {address.province} {address.postal_code}
                      </div>
                      <div className="text-sm text-muted-foreground">{address.phone}</div>
                      {address.is_default && (
                        <span className="inline-block mt-2 text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                          Default
                        </span>
                      )}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            ) : (
              <p className="text-sm text-muted-foreground">No saved addresses. Please add one below.</p>
            )}

            <Button
              type="button"
              variant="outline"
              className="w-full bg-transparent"
              onClick={() => setShowAddressDialog(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add New Address
            </Button>
          </CardContent>
        </Card>

        {/* Delivery Method */}
        <Card>
          <CardHeader>
            <CardTitle>Delivery Method</CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup value={deliveryMethod} onValueChange={setDeliveryMethod}>
              {DELIVERY_OPTIONS.map((option) => (
                <div key={option.id} className="flex items-start space-x-3 border rounded-lg p-4">
                  <RadioGroupItem value={option.id} id={`delivery-${option.id}`} className="mt-1" />
                  <Label htmlFor={`delivery-${option.id}`} className="flex-1 cursor-pointer">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">{option.name}</div>
                        <div className="text-sm text-muted-foreground">{option.description}</div>
                      </div>
                      <div className="font-semibold">R {option.price.toFixed(2)}</div>
                    </div>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>
      </div>

      {/* Order Summary */}
      <div className="lg:col-span-1">
        <Card className="sticky top-24">
          <CardHeader>
            <CardTitle>Order Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Cart Items */}
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {cartItems.map((item) => {
                const product = item.products as any
                return (
                  <div key={item.id} className="flex gap-3">
                    <div className="w-16 h-20 relative flex-shrink-0 overflow-hidden rounded bg-muted">
                      <Image
                        src={
                          product.image_url ||
                          `/placeholder.svg?height=80&width=64&query=${encodeURIComponent(product.name) || "/placeholder.svg"}`
                        }
                        alt={product.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="flex-1 text-sm">
                      <p className="font-medium line-clamp-2">{product.name}</p>
                      <p className="text-muted-foreground">Qty: {item.quantity}</p>
                      <p className="font-semibold">R {(product.price * item.quantity).toFixed(2)}</p>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="border-t pt-4 space-y-3">
              <DiscountCodeInput
                subtotal={subtotal}
                onDiscountApplied={setAppliedDiscount}
                onDiscountRemoved={() => setAppliedDiscount(null)}
                appliedDiscount={appliedDiscount}
              />

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">R {subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Delivery</span>
                  <span className="font-medium">R {deliveryFee.toFixed(2)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-green-600 bg-green-50 px-2 py-1 rounded">
                    <span className="font-medium">Discount Applied</span>
                    <span className="font-semibold">-R {discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="border-t pt-2">
                  <div className="flex justify-between text-lg font-semibold">
                    <span>Total</span>
                    <span className={discountAmount > 0 ? "text-green-600" : ""}>
                      R {total.toFixed(2)}
                    </span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="text-xs text-green-600 text-right mt-1">
                      You saved R {discountAmount.toFixed(2)}!
                    </div>
                  )}
                </div>
              </div>
            </div>

            {!showWhatsAppMessages ? (
              <Button
                onClick={handleCheckout}
                disabled={isProcessing || !selectedAddress}
                className="w-full bg-primary hover:bg-primary/90 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                {isProcessing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Creating Order...
                  </>
                ) : (
                  <>
                    <MessageCircle className="mr-2 h-4 w-4" />
                    Create Order
                  </>
                )}
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h3 className="font-semibold text-green-800 mb-2">Order Created Successfully! 🎉</h3>
                  <p className="text-green-700 text-sm mb-3">
                    Order #{orderCreated.orderData.orderNumber} has been created. Please send the WhatsApp messages below to complete your order.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-medium text-blue-800 mb-2">Step 1: Send Order Details to Caarl</h4>
                    <p className="text-blue-700 text-sm mb-3">
                      Send your order details to Caarl for payment processing:
                    </p>
                    <WhatsAppMessageButton
                      phoneNumber="+27123456789"
                      message={formatOrderDetailsForCaarl(orderCreated.orderData)}
                      label="Send Order to Caarl"
                    />
                  </div>

                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <h4 className="font-medium text-purple-800 mb-2">Step 2: Confirm Your Order</h4>
                    <p className="text-purple-700 text-sm mb-3">
                      Send yourself a copy of the order confirmation:
                    </p>
                    <WhatsAppMessageButton
                      phoneNumber={orderCreated.orderData.customerPhone}
                      message={formatCustomerOrderConfirmation(orderCreated.orderData)}
                      label="Send Confirmation to Myself"
                    />
                  </div>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="font-medium text-gray-800 mb-2">What happens next?</h4>
                  <ul className="text-gray-700 text-sm space-y-1">
                    <li>• Caarl will receive your order details via WhatsApp</li>
                    <li>• She will contact you with payment instructions</li>
                    <li>• Payment can be made via bank transfer or Yoco link</li>
                    <li>• Your order will be processed once payment is confirmed</li>
                  </ul>
                </div>

                <Button
                  onClick={handleOrderComplete}
                  className="w-full bg-primary hover:bg-primary/90 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  <Check className="mr-2 h-4 w-4" />
                  Complete Order
                </Button>
              </div>
            )}

            <p className="text-xs text-center text-muted-foreground">
                {showWhatsAppMessages 
                  ? "Secure payment processing via WhatsApp with Caarl" 
                  : "Secure payment processing via WhatsApp"
                }
              </p>
          </CardContent>
        </Card>
      </div>

      {/* Address Dialog */}
      <AddressDialog open={showAddressDialog} onOpenChange={setShowAddressDialog} />
    </div>
  )
}
