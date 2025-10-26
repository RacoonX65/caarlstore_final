import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sendOrderConfirmationEmail } from "@/lib/email"
import { createServiceClient } from "@/lib/supabase/service"

export async function GET(request: NextRequest) {
  console.log("Yoco payment verification request received")

  try {
    const searchParams = request.nextUrl.searchParams
    const checkoutId = searchParams.get("checkoutId")
    const reference = searchParams.get("reference")

    if (!checkoutId && !reference) {
      console.error("Payment verification failed: No checkout ID or reference provided")
      return NextResponse.json({ error: "Payment reference is required" }, { status: 400 })
    }

    console.log("Verifying Yoco payment with:", { checkoutId, reference })

    const yocoSecretKey = process.env.YOCO_SECRET_KEY

    if (!yocoSecretKey) {
      console.error("Payment verification failed: Yoco secret key not configured")
      return NextResponse.json({ error: "Payment service not configured" }, { status: 500 })
    }

    // Verify transaction with Yoco
    console.log("Making Yoco API call to verify transaction")

    // For Yoco, we'll use a different approach for verification
    // Since Yoco primarily uses webhooks for payment confirmation,
    // we'll implement a basic verification that checks if the checkout exists
    let verificationUrl = ""
    let verificationData = null

    if (checkoutId) {
      verificationUrl = `https://payments.yoco.com/api/checkouts/${checkoutId}`
    } else if (reference) {
      // For reference-based verification, we'll need to implement a different approach
      // For now, return a pending status and let webhooks handle the actual verification
      console.log("Reference-based verification not fully supported, returning pending status")
      return NextResponse.json({
        status: "pending",
        reference: reference,
        message: "Payment verification pending webhook confirmation"
      })
    }

    if (!verificationUrl) {
      return NextResponse.json({
        status: "pending",
        reference: reference || checkoutId,
        message: "No checkout ID provided for verification"
      })
    }

    const response = await fetch(verificationUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${yocoSecretKey}`,
      },
    })

    const data = await response.json()
    console.log("Yoco API response:", { status: response.status, success: data.status, data })

    if (!response.ok) {
      console.error("Yoco verification error:", data)
      return NextResponse.json({ error: data.message || "Payment verification failed" }, { status: response.status })
    }

    // Handle different response structures from Yoco
    let paymentStatus = "pending"
    let orderId = null

    if (checkoutId && data.status) {
      paymentStatus = data.status === "completed" ? "success" : data.status
      orderId = data.metadata?.order_id
    } else if (reference && Array.isArray(data) && data.length > 0) {
      // Handle search results
      const checkout = data.find((c: any) => c.metadata?.order_number === reference)
      if (checkout) {
        paymentStatus = checkout.status === "completed" ? "success" : checkout.status
        orderId = checkout.metadata?.order_id
      }
    }

    // Update order status in database if payment was successful
    if (paymentStatus === "success" && orderId) {
      console.log("Payment successful, updating order status for order ID:", orderId)

      // Use service role client to bypass RLS for payment verification
      const supabaseServiceRole = createServiceClient()

      // Update order with payment reference and status
      const { error: updateError, data: updateResult } = await supabaseServiceRole
        .from("orders")
        .update({
          payment_reference: checkoutId || reference,
          payment_status: "paid",
          status: "processing",
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId)

      if (updateError) {
        console.error("Order update error:", updateError)
        return NextResponse.json({ error: "Failed to update order" }, { status: 500 })
      }

      console.log("Order update result:", updateResult)
      console.log("Order status updated successfully")

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
      console.log("Fetching order details for email...")
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

          console.log("Attempting to send order confirmation email")
          const emailResult = await sendOrderConfirmationEmail(
            orderDetails.user_id, // We'll need to get email from user profile
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
    } else {
      console.log("Payment not successful, status:", paymentStatus)
    }

    console.log("Payment verification completed successfully")
    return NextResponse.json({
      status: paymentStatus,
      reference: checkoutId || reference,
    })
  } catch (error) {
    console.error("Yoco verify API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}