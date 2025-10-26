// WhatsApp message templates for manual sending

// Format detailed order message for Caarl to receive
export function formatOrderDetailsForCaarl(orderData: {
  orderNumber: string
  customerName: string
  customerEmail: string
  customerPhone: string
  deliveryAddress: {
    full_name: string
    street_address: string
    city: string
    province: string
    postal_code: string
    phone: string
  }
  deliveryMethod: string
  deliveryFee: number
  items: Array<{
    name: string
    price: number
    quantity: number
    size?: string
    color?: string
  }>
  subtotal: number
  discountAmount?: number
  discountCode?: string
  total: number
}): string {
  const { 
    orderNumber, 
    customerName, 
    customerEmail, 
    customerPhone, 
    deliveryAddress, 
    deliveryMethod, 
    deliveryFee, 
    items, 
    subtotal, 
    discountAmount = 0, 
    discountCode, 
    total 
  } = orderData

  let message = `🛍️ *NEW ORDER RECEIVED* 🛍️

*Order Number:* ${orderNumber}
*Date:* ${new Date().toLocaleDateString('en-ZA', { 
  weekday: 'long', 
  year: 'numeric', 
  month: 'long', 
  day: 'numeric' 
})}

👤 *CUSTOMER DETAILS*
*Name:* ${customerName}
*Email:* ${customerEmail}
*Phone:* ${customerPhone}

📍 *DELIVERY ADDRESS*
*Name:* ${deliveryAddress.full_name}
*Address:* ${deliveryAddress.street_address}
*City:* ${deliveryAddress.city}
*Province:* ${deliveryAddress.province}
*Postal Code:* ${deliveryAddress.postal_code}
*Phone:* ${deliveryAddress.phone}

🚚 *DELIVERY METHOD*
*Method:* ${deliveryMethod.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
*Delivery Fee:* R ${deliveryFee.toFixed(2)}

🛒 *ORDER ITEMS*`

  items.forEach((item, index) => {
    message += `
${index + 1}. *${item.name}*
   Price: R ${item.price.toFixed(2)} x ${item.quantity}
   Total: R ${(item.price * item.quantity).toFixed(2)}`
    
    if (item.size) message += `\n   Size: ${item.size}`
    if (item.color) message += `\n   Color: ${item.color}`
  })

  message += `

💰 *ORDER SUMMARY*
*Subtotal:* R ${subtotal.toFixed(2)}
*Delivery:* R ${deliveryFee.toFixed(2)}`

  if (discountAmount > 0) {
    message += `
*Discount (${discountCode}):* -R ${discountAmount.toFixed(2)}`
  }

  message += `
*TOTAL:* R ${total.toFixed(2)}

⚠️ *PAYMENT REQUIRED*
Please contact the customer to arrange payment via:
• Bank transfer details
• Yoco payment link from your phone
• Cash on delivery (if applicable)

Once payment is confirmed, update the order status in the admin panel.

Customer contact: ${customerPhone}
Customer email: ${customerEmail}`

  return message
}

// Format customer confirmation message for WhatsApp payment flow
export function formatCustomerOrderConfirmation(orderData: {
  orderNumber: string
  customerName: string
  total: number
  items: Array<{
    name: string
    quantity: number
  }>
}): string {
  const { orderNumber, customerName, total, items } = orderData
  
  let message = `Hi ${customerName}! 🎉

Thank you for your order with Caarl! ✨

*Order Number:* ${orderNumber}
*Total Amount:* R ${total.toFixed(2)}

*Your Items:*`

  items.forEach((item, index) => {
    message += `
${index + 1}. ${item.name} (Qty: ${item.quantity})`
  })

  message += `

📞 *NEXT STEPS*
Caarl will contact you shortly via WhatsApp to arrange payment. You can pay via:
• Bank transfer (details will be shared)
• Yoco payment link
• Cash on delivery (where available)

Your order will be processed once payment is confirmed.

Track your order: ${process.env.NEXT_PUBLIC_APP_URL}/account/orders

Thank you for choosing Caarl! 💕

- Caarl Team`

  return message
}

export function formatOrderConfirmationMessage(orderNumber: string, orderTotal: number, customerName: string): string {
  return `Hi ${customerName}! 🎉

Thank you for your order at Caarl!

*Order Number:* ${orderNumber}
*Total:* R ${orderTotal.toFixed(2)}

Your order has been confirmed and will be processed shortly. We'll keep you updated on its progress.

Track your order: ${process.env.NEXT_PUBLIC_APP_URL}/account/orders

Thank you for shopping with us! 💕

- Caarl Team`
}

export function formatOrderUpdateMessage(orderNumber: string, newStatus: string, customerName: string): string {
  const statusEmojis: Record<string, string> = {
    confirmed: "✅",
    processing: "⚙️",
    shipped: "🚚",
    delivered: "📦",
    cancelled: "❌",
  }

  const statusMessages: Record<string, string> = {
    confirmed: "Your order has been confirmed!",
    processing: "Your order is being prepared.",
    shipped: "Your order is on its way!",
    delivered: "Your order has been delivered!",
    cancelled: "Your order has been cancelled.",
  }

  return `Hi ${customerName}! ${statusEmojis[newStatus] || "📢"}

*Order Update*

*Order Number:* ${orderNumber}
*Status:* ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}

${statusMessages[newStatus] || "Your order status has been updated."}

View details: ${process.env.NEXT_PUBLIC_APP_URL}/account/orders

- Caarl Team`
}
