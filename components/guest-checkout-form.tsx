"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DiscountCodeInput } from "@/components/discount-code-input"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import Image from "next/image"
import { MessageCircle, Check } from "lucide-react"
import { WhatsAppMessageButton } from "@/components/whatsapp-message-button"
import { formatOrderDetailsForCaarl, formatCustomerOrderConfirmation } from "@/lib/whatsapp"
import { guestCartUtils, type GuestCartItem, type GuestCustomerInfo, type GuestAddress } from "@/lib/guest-checkout"
import { validateOrderClient, formatValidationErrors, type GuestOrderData } from "@/lib/order-validation-client"

interface GuestCheckoutFormProps {
  cartItems: GuestCartItem[]
  products: any[]
  subtotal: number
}

const DELIVERY_OPTIONS = [
  { id: "courier_guy", name: "Courier Guy", price: 99, description: "3-5 business days" },
  { id: "pudo", name: "Pudo Locker", price: 65, description: "Collect from nearest locker" },
]

export function GuestCheckoutForm({ cartItems, products, subtotal }: GuestCheckoutFormProps) {
  const [customerInfo, setCustomerInfo] = useState<GuestCustomerInfo>({
    full_name: "",
    email: "",
    phone: "",
  })
  
  const [address, setAddress] = useState<GuestAddress>({
    street_address: "",
    city: "",
    province: "",
    postal_code: "",
    country: "South Africa",
  })
  
  const [deliveryMethod, setDeliveryMethod] = useState(DELIVERY_OPTIONS[0].id)
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string; amount: number; codeId: string } | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [orderCreated, setOrderCreated] = useState<any>(null)
  const [showWhatsAppMessages, setShowWhatsAppMessages] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  const deliveryFee = DELIVERY_OPTIONS.find((opt) => opt.id === deliveryMethod)?.price || 0
  const discountAmount = appliedDiscount?.amount || 0
  const total = subtotal + deliveryFee - discountAmount

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    // Customer info validation
    if (!customerInfo.full_name.trim()) {
      newErrors.full_name = "Full name is required"
    }
    if (!customerInfo.email.trim()) {
      newErrors.email = "Email is required"
    } else if (!/\S+@\S+\.\S+/.test(customerInfo.email)) {
      newErrors.email = "Please enter a valid email address"
    }
    if (!customerInfo.phone.trim()) {
      newErrors.phone = "Phone number is required"
    }

    // Address validation
    if (!address.street_address.trim()) {
      newErrors.street_address = "Street address is required"
    }
    if (!address.city.trim()) {
      newErrors.city = "City is required"
    }
    if (!address.province.trim()) {
      newErrors.province = "Province is required"
    }
    if (!address.postal_code.trim()) {
      newErrors.postal_code = "Postal code is required"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleCheckout = async () => {
    if (!validateForm()) {
      toast({
        title: "Please complete all required fields",
        description: "Check the form for any missing information.",
        variant: "destructive",
      })
      return
    }

    if (isProcessing) return

    setIsProcessing(true)
    try {
      // Prepare order data for comprehensive validation
      const validationOrderData: GuestOrderData = {
        customerInfo: {
          full_name: customerInfo.full_name,
          email: customerInfo.email,
          phone: customerInfo.phone,
        },
        address: {
          street_address: address.street_address,
          city: address.city,
          province: address.province,
          postal_code: address.postal_code,
          phone: customerInfo.phone,
        },
        cartItems: cartItems.map(item => {
          const product = products.find(p => p.id === item.product_id)
          return {
            product_id: item.product_id,
            quantity: item.quantity,
            price: product?.price || 0,
          }
        }),
        deliveryMethod: deliveryMethod,
        deliveryFee: deliveryFee,
        subtotal: subtotal,
        discountCode: appliedDiscount?.code,
        discountAmount: discountAmount,
        total: total,
      }

      // Run client-side validation
      const validationResult = validateOrderClient(validationOrderData)

      // Handle validation errors
      if (!validationResult.isValid) {
        const errorMessage = formatValidationErrors(validationResult.errors)
        
        toast({
          title: "Order validation failed",
          description: errorMessage,
          variant: "destructive",
        })
        setIsProcessing(false)
        return
      }

      // Show warnings if any
      if (validationResult.warnings.length > 0) {
        const warningMessage = formatValidationErrors(validationResult.warnings)
        toast({
          title: "Order warnings",
          description: warningMessage,
          variant: "default",
        })
      }
      // Generate order number
      const orderNumber = `GUEST-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`

      // Create guest order in database
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: null, // Guest order
          order_number: orderNumber,
          total_amount: total,
          delivery_fee: deliveryFee,
          delivery_method: deliveryMethod,
          address_id: null, // Guest address stored in order
          discount_code_id: appliedDiscount?.codeId || null,
          discount_amount: discountAmount,
          status: "pending",
          payment_status: "awaiting_payment",
          // Store guest customer info
          guest_name: customerInfo.full_name,
          guest_email: customerInfo.email,
          guest_phone: customerInfo.phone,
          // Store guest address
          guest_address_line1: address.street_address,
          guest_city: address.city,
          guest_province: address.province,
          guest_postal_code: address.postal_code,
          is_guest_order: true,
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
      const orderItems = cartItems.map((item) => {
        const product = products.find(p => p.id === item.product_id)
        return {
          order_id: order.id,
          product_id: item.product_id,
          quantity: item.quantity,
          price: product?.price || 0,
          size: item.size,
          color: item.color,
        }
      })

      const { error: itemsError } = await supabase.from("order_items").insert(orderItems)

      if (itemsError) {
        console.error("Order items creation error:", itemsError)
        throw new Error(`Failed to create order items: ${itemsError.message}`)
      }

      // Clear guest cart after successful order creation
      guestCartUtils.clearCart()

      // Prepare order data for WhatsApp messages
      const whatsappOrderData = {
        orderNumber,
        customerName: customerInfo.full_name,
        customerEmail: customerInfo.email,
        customerPhone: customerInfo.phone,
        deliveryAddress: address,
        deliveryMethod,
        deliveryFee,
        items: cartItems.map(item => {
          const product = products.find(p => p.id === item.product_id)
          return {
            name: product?.name || "Unknown Product",
            price: product?.price || 0,
            quantity: item.quantity,
            size: item.size,
            color: item.color,
          }
        }),
        subtotal,
        discountAmount,
        discountCode: appliedDiscount?.code,
        total,
      }

      setOrderCreated({ order, orderData: whatsappOrderData })
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
      }

      toast({
        title: "Order Failed",
        description: errorMessage,
        variant: "destructive",
      })
      setIsProcessing(false)
    }
  }

  const updateCustomerInfo = (field: keyof GuestCustomerInfo, value: string) => {
    setCustomerInfo(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }))
    }
  }

  const updateAddress = (field: keyof GuestAddress, value: string) => {
    setAddress(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }))
    }
  }

  if (showWhatsAppMessages && orderCreated) {
    const { orderData } = orderCreated
    const caarlMessage = formatOrderDetailsForCaarl(orderData)
    const customerMessage = formatCustomerOrderConfirmation(orderData)

    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl text-green-600">Order Created Successfully!</CardTitle>
            <p className="text-muted-foreground">
              Order #{orderData.orderNumber}
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-800 mb-2">Complete Your Order</h3>
              <p className="text-blue-700 text-sm mb-4">
                Send these WhatsApp messages to finalize your order and arrange payment:
              </p>
              
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-blue-800 mb-2">1. Send Order to Caarl:</p>
                  <WhatsAppMessageButton
                    phoneNumber="+27634009626"
                    message={caarlMessage}
                    label="Send Order to Caarl"
                  />
                </div>
                
                <div>
                  <p className="text-sm font-medium text-blue-800 mb-2">2. Send Confirmation to Yourself:</p>
                  <WhatsAppMessageButton
                    phoneNumber={orderData.customerPhone}
                    message={customerMessage}
                    label="Send Confirmation to Myself"
                  />
                </div>
              </div>
            </div>

            <div className="text-center">
              <Button 
                onClick={() => router.push("/products")} 
                variant="outline"
                className="w-full"
              >
                Continue Shopping
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Checkout Form */}
      <div className="lg:col-span-2 space-y-6">
        {/* Customer Information */}
        <Card>
          <CardHeader>
            <CardTitle>Customer Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="full_name">Full Name *</Label>
              <Input
                id="full_name"
                value={customerInfo.full_name}
                onChange={(e) => updateCustomerInfo("full_name", e.target.value)}
                placeholder="Enter your full name"
                className={errors.full_name ? "border-red-500" : ""}
              />
              {errors.full_name && <p className="text-sm text-red-500 mt-1">{errors.full_name}</p>}
            </div>
            
            <div>
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                value={customerInfo.email}
                onChange={(e) => updateCustomerInfo("email", e.target.value)}
                placeholder="Enter your email address"
                className={errors.email ? "border-red-500" : ""}
              />
              {errors.email && <p className="text-sm text-red-500 mt-1">{errors.email}</p>}
            </div>
            
            <div>
              <Label htmlFor="phone">Phone Number *</Label>
              <Input
                id="phone"
                value={customerInfo.phone}
                onChange={(e) => updateCustomerInfo("phone", e.target.value)}
                placeholder="Enter your phone number"
                className={errors.phone ? "border-red-500" : ""}
              />
              {errors.phone && <p className="text-sm text-red-500 mt-1">{errors.phone}</p>}
            </div>
          </CardContent>
        </Card>

        {/* Delivery Address */}
        <Card>
          <CardHeader>
            <CardTitle>Delivery Address</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="street_address">Street Address *</Label>
              <Input
                id="street_address"
                value={address.street_address}
                onChange={(e) => updateAddress("street_address", e.target.value)}
                placeholder="Enter your street address"
                className={errors.street_address ? "border-red-500" : ""}
              />
              {errors.street_address && <p className="text-sm text-red-500 mt-1">{errors.street_address}</p>}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  value={address.city}
                  onChange={(e) => updateAddress("city", e.target.value)}
                  placeholder="Enter your city"
                  className={errors.city ? "border-red-500" : ""}
                />
                {errors.city && <p className="text-sm text-red-500 mt-1">{errors.city}</p>}
              </div>
              
              <div>
                <Label htmlFor="province">Province *</Label>
                <Input
                  id="province"
                  value={address.province}
                  onChange={(e) => updateAddress("province", e.target.value)}
                  placeholder="Enter your province"
                  className={errors.province ? "border-red-500" : ""}
                />
                {errors.province && <p className="text-sm text-red-500 mt-1">{errors.province}</p>}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="postal_code">Postal Code *</Label>
                <Input
                  id="postal_code"
                  value={address.postal_code}
                  onChange={(e) => updateAddress("postal_code", e.target.value)}
                  placeholder="Enter postal code"
                  className={errors.postal_code ? "border-red-500" : ""}
                />
                {errors.postal_code && <p className="text-sm text-red-500 mt-1">{errors.postal_code}</p>}
              </div>
              
              <div>
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value={address.country}
                  onChange={(e) => updateAddress("country", e.target.value)}
                  placeholder="Country"
                  disabled
                />
              </div>
            </div>
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
                <div key={option.id} className="flex items-center space-x-2 border rounded-lg p-4">
                  <RadioGroupItem value={option.id} id={option.id} />
                  <div className="flex-1">
                    <Label htmlFor={option.id} className="font-medium cursor-pointer">
                      {option.name} - R{option.price}
                    </Label>
                    <p className="text-sm text-muted-foreground">{option.description}</p>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Discount Code */}
        <Card>
          <CardHeader>
            <CardTitle>Discount Code</CardTitle>
          </CardHeader>
          <CardContent>
            <DiscountCodeInput
              onDiscountApplied={(discount) => setAppliedDiscount(discount)}
              onDiscountRemoved={() => setAppliedDiscount(null)}
              subtotal={subtotal + deliveryFee}
            />
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
            <div className="space-y-3">
              {cartItems.map((item) => {
                const product = products.find(p => p.id === item.product_id)
                if (!product) return null
                
                return (
                  <div key={item.id} className="flex gap-3">
                    <div className="w-16 h-20 relative flex-shrink-0 overflow-hidden rounded-md bg-muted">
                      <Image
                        src={product.image_url || `/placeholder.svg?height=80&width=64&query=${encodeURIComponent(product.name)}`}
                        alt={product.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm truncate">{product.name}</h4>
                      <div className="text-xs text-muted-foreground">
                        {item.size && <span>Size: {item.size}</span>}
                        {item.size && item.color && <span> • </span>}
                        {item.color && <span>Color: {item.color}</span>}
                      </div>
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-sm">Qty: {item.quantity}</span>
                        <span className="font-medium text-sm">R{(product.price * item.quantity).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Subtotal</span>
                <span>R{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Delivery</span>
                <span>R{deliveryFee.toFixed(2)}</span>
              </div>
              {appliedDiscount && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Discount ({appliedDiscount.code})</span>
                  <span>-R{discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-lg border-t pt-2">
                <span>Total</span>
                <span>R{total.toFixed(2)}</span>
              </div>
            </div>

            <Button 
              onClick={handleCheckout} 
              disabled={isProcessing}
              className="w-full h-12"
              size="lg"
            >
              {isProcessing ? "Processing..." : "Place Order"}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              By placing your order, you agree to our terms and conditions.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}