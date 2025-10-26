import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, amount, orderId, orderNumber } = body

    if (!email || !amount || !orderId || !orderNumber) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const yocoSecretKey = process.env.YOCO_SECRET_KEY

    if (!yocoSecretKey) {
      return NextResponse.json({ error: "Yoco not configured" }, { status: 500 })
    }

    // Initialize Yoco payment
    // Note: Yoco uses a different API structure than Paystack
    // This is a basic implementation - you may need to adjust based on Yoco's specific requirements
    const response = await fetch("https://payments.yoco.com/api/checkouts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${yocoSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.round(amount), // Yoco expects amount in cents as integer
        currency: "ZAR",
        successUrl: `${request.nextUrl.origin}/checkout/success?order_id=${orderId}&reference=${orderNumber}`,
        cancelUrl: `${request.nextUrl.origin}/checkout`,
        failureUrl: `${request.nextUrl.origin}/checkout`,
        metadata: {
          order_id: orderId,
          order_number: orderNumber,
        },
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error("Yoco initialization error:", data)
      return NextResponse.json({ error: data.message || "Payment initialization failed" }, { status: response.status })
    }

    return NextResponse.json({
      checkout_url: data.checkoutUrl || data.url || `https://payments.yoco.com/checkouts/${data.id}`,
      id: data.id,
      reference: orderNumber,
    })
  } catch (error) {
    console.error("Yoco API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}