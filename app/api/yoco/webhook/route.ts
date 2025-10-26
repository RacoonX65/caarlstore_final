import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { sendOrderConfirmationEmail } from "@/lib/email"
import { createHmac } from "crypto"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const signature = request.headers.get("x-yoco-signature")
    const webhookSecret = process.env.YOCO_WEBHOOK_SECRET

    console.log("Yoco webhook received:", {
      signature: !!signature,
      hasSecret: !!webhookSecret,
      body
    })

    // Verify webhook signature if secret is configured
    if (webhookSecret && signature) {
      // Basic signature verification (you may want to implement more robust verification)
      const expectedSignature = createHmac('sha256', webhookSecret)
        .update(JSON.stringify(body))
        .digest('hex')

      if (!signature.includes(expectedSignature)) {
        console.error("Invalid webhook signature")
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
      }
    }

    const supabaseServiceRole = createServiceClient()

    // Handle different webhook event types
    if (body.event === "checkout.completed" || body.event === "payment.succeeded") {
      const checkout = body.data?.object
      const orderId = checkout?.metadata?.order_id

      if (orderId) {
        console.log("Processing successful payment for order:", orderId)

        // Update order status
        const { error: updateError } = await supabaseServiceRole
          .from("orders")
          .update({
            payment_reference: checkout.id,
            payment_status: "paid",
            status: "processing",
            updated_at: new Date().toISOString(),
          })
          .eq("id", orderId)

        if (updateError) {
          console.error("Order update error:", updateError)
          return NextResponse.json({ error: "Failed to update order" }, { status: 500 })
        }

        // Clear user's cart
        const { data: order } = await supabaseServiceRole
          .from("orders")
          .select("user_id")
          .eq("id", orderId)
          .single()

        if (order) {
          const { error: cartError } = await supabaseServiceRole
            .from("cart_items")
            .delete()
            .eq("user_id", order.user_id)

          if (cartError) {
            console.error("Error clearing cart:", cartError)
          }
        }

        // Send confirmation email
        const { data: orderDetails, error: orderError } = await supabaseServiceRole
          .from("orders")
          .select("*")
          .eq("id", orderId)
          .single()

        if (orderDetails && !orderError) {
          const { data: orderItems, error: itemsError } = await supabaseServiceRole
            .from("order_items")
            .select(
              `
              *,
              products (
                name,
                image_url
              )
            `,
            )
            .eq("order_id", orderId)

          if (!itemsError && orderItems) {
            const emailItems = orderItems.map((item) => ({
              id: item.id,
              product_id: item.product_id,
              quantity: item.quantity,
              price: item.price,
              products: {
                name: (item.products as any).name,
                image_url: (item.products as any).image_url
              }
            }))

            const emailResult = await sendOrderConfirmationEmail(
              orderDetails.user_id,
              orderDetails.order_number,
              orderDetails.total_amount,
              emailItems
            )

            if (emailResult.success) {
              console.log("Order confirmation email sent successfully")
            } else {
              console.error("Failed to send order confirmation email:", emailResult.error)
            }
          }
        }

        console.log("Payment processed successfully for order:", orderId)
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("Yoco webhook error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}