// Comprehensive order validation system
// This module validates orders against all database constraints and business rules

import { createClient } from "@/lib/supabase/client"

export interface OrderValidationError {
  field: string
  message: string
  code: string
  severity: 'error' | 'warning'
}

export interface OrderValidationResult {
  isValid: boolean
  errors: OrderValidationError[]
  warnings: OrderValidationError[]
}

export interface GuestOrderData {
  customerInfo: {
    full_name: string
    email: string
    phone: string
  }
  address: {
    street_address: string
    city: string
    province: string
    postal_code: string
    phone: string
  }
  cartItems: Array<{
    product_id: string
    quantity: number
    price: number
  }>
  deliveryMethod: string
  deliveryFee: number
  subtotal: number
  discountCode?: string
  discountAmount?: number
  total: number
}

export interface AuthenticatedOrderData {
  userId: string
  addressId: string
  cartItems: Array<{
    product_id: string
    quantity: number
    price: number
  }>
  deliveryMethod: string
  deliveryFee: number
  subtotal: number
  discountCode?: string
  discountAmount?: number
  total: number
}

// Database constraint validation
export async function validateDatabaseConstraints(
  orderData: GuestOrderData | AuthenticatedOrderData
): Promise<OrderValidationResult> {
  const errors: OrderValidationError[] = []
  const warnings: OrderValidationError[] = []
  const supabase = createClient()

  try {
    // Validate delivery method against enum constraints
    const validDeliveryMethods = ['standard', 'express', 'collection']
    if (!validDeliveryMethods.includes(orderData.deliveryMethod)) {
      errors.push({
        field: 'deliveryMethod',
        message: `Invalid delivery method. Must be one of: ${validDeliveryMethods.join(', ')}`,
        code: 'INVALID_DELIVERY_METHOD',
        severity: 'error'
      })
    }

    // Validate cart items exist and are available
    if (!orderData.cartItems || orderData.cartItems.length === 0) {
      errors.push({
        field: 'cartItems',
        message: 'Order must contain at least one item',
        code: 'EMPTY_CART',
        severity: 'error'
      })
    } else {
      // Check each product exists and is available
      for (const item of orderData.cartItems) {
        const { data: product, error } = await supabase
          .from('products')
          .select('id, name, price, is_available, stock_quantity')
          .eq('id', item.product_id)
          .single()

        if (error || !product) {
          errors.push({
            field: 'cartItems',
            message: `Product with ID ${item.product_id} not found`,
            code: 'PRODUCT_NOT_FOUND',
            severity: 'error'
          })
          continue
        }

        if (!product.is_available) {
          errors.push({
            field: 'cartItems',
            message: `Product "${product.name}" is not available`,
            code: 'PRODUCT_UNAVAILABLE',
            severity: 'error'
          })
        }

        if (product.stock_quantity !== null && product.stock_quantity < item.quantity) {
          errors.push({
            field: 'cartItems',
            message: `Insufficient stock for "${product.name}". Available: ${product.stock_quantity}, Requested: ${item.quantity}`,
            code: 'INSUFFICIENT_STOCK',
            severity: 'error'
          })
        }

        // Validate price hasn't changed
        if (Math.abs(product.price - item.price) > 0.01) {
          warnings.push({
            field: 'cartItems',
            message: `Price for "${product.name}" has changed. Current: R${product.price}, Cart: R${item.price}`,
            code: 'PRICE_CHANGED',
            severity: 'warning'
          })
        }

        // Validate quantity is positive
        if (item.quantity <= 0) {
          errors.push({
            field: 'cartItems',
            message: `Invalid quantity for "${product.name}". Must be greater than 0`,
            code: 'INVALID_QUANTITY',
            severity: 'error'
          })
        }
      }
    }

    // Validate guest order specific constraints
    if ('customerInfo' in orderData) {
      const guestData = orderData as GuestOrderData
      
      // Check guest_name constraint (NOT NULL when is_guest_order = true)
      if (!guestData.customerInfo.full_name?.trim()) {
        errors.push({
          field: 'customerInfo.full_name',
          message: 'Full name is required for guest orders',
          code: 'GUEST_NAME_REQUIRED',
          severity: 'error'
        })
      }

      // Check guest_email constraint (NOT NULL when is_guest_order = true)
      if (!guestData.customerInfo.email?.trim()) {
        errors.push({
          field: 'customerInfo.email',
          message: 'Email is required for guest orders',
          code: 'GUEST_EMAIL_REQUIRED',
          severity: 'error'
        })
      } else if (!/\S+@\S+\.\S+/.test(guestData.customerInfo.email)) {
        errors.push({
          field: 'customerInfo.email',
          message: 'Please enter a valid email address',
          code: 'INVALID_EMAIL_FORMAT',
          severity: 'error'
        })
      }

      // Validate guest address fields
      if (!guestData.address.street_address?.trim()) {
        errors.push({
          field: 'address.street_address',
          message: 'Street address is required',
          code: 'ADDRESS_REQUIRED',
          severity: 'error'
        })
      }

      if (!guestData.address.city?.trim()) {
        errors.push({
          field: 'address.city',
          message: 'City is required',
          code: 'CITY_REQUIRED',
          severity: 'error'
        })
      }

      if (!guestData.address.province?.trim()) {
        errors.push({
          field: 'address.province',
          message: 'Province is required',
          code: 'PROVINCE_REQUIRED',
          severity: 'error'
        })
      }

      if (!guestData.address.postal_code?.trim()) {
        errors.push({
          field: 'address.postal_code',
          message: 'Postal code is required',
          code: 'POSTAL_CODE_REQUIRED',
          severity: 'error'
        })
      }
    }

    // Validate authenticated order specific constraints
    if ('userId' in orderData) {
      const authData = orderData as AuthenticatedOrderData
      
      // Validate user exists
      const { data: user } = await supabase.auth.getUser()
      if (!user.user || user.user.id !== authData.userId) {
        errors.push({
          field: 'userId',
          message: 'Invalid user authentication',
          code: 'INVALID_USER',
          severity: 'error'
        })
      }

      // Validate address belongs to user
      const { data: address, error: addressError } = await supabase
        .from('addresses')
        .select('id, user_id')
        .eq('id', authData.addressId)
        .eq('user_id', authData.userId)
        .single()

      if (addressError || !address) {
        errors.push({
          field: 'addressId',
          message: 'Invalid delivery address',
          code: 'INVALID_ADDRESS',
          severity: 'error'
        })
      }
    }

    // Validate discount code if provided
    if (orderData.discountCode) {
      const userId = 'userId' in orderData ? orderData.userId : null
      const discountValidation = await validateDiscountCode(
        orderData.discountCode,
        userId,
        orderData.subtotal
      )

      if (!discountValidation.isValid) {
        errors.push({
          field: 'discountCode',
          message: discountValidation.error || 'Invalid discount code',
          code: 'INVALID_DISCOUNT',
          severity: 'error'
        })
      }
    }

    // Validate monetary amounts
    if (orderData.total <= 0) {
      errors.push({
        field: 'total',
        message: 'Order total must be greater than 0',
        code: 'INVALID_TOTAL',
        severity: 'error'
      })
    }

    if (orderData.deliveryFee < 0) {
      errors.push({
        field: 'deliveryFee',
        message: 'Delivery fee cannot be negative',
        code: 'INVALID_DELIVERY_FEE',
        severity: 'error'
      })
    }

    // Validate total calculation
    const expectedTotal = orderData.subtotal + orderData.deliveryFee - (orderData.discountAmount || 0)
    if (Math.abs(orderData.total - expectedTotal) > 0.01) {
      errors.push({
        field: 'total',
        message: `Order total calculation error. Expected: R${expectedTotal.toFixed(2)}, Received: R${orderData.total.toFixed(2)}`,
        code: 'TOTAL_CALCULATION_ERROR',
        severity: 'error'
      })
    }

  } catch (error) {
    console.error('Order validation error:', error)
    errors.push({
      field: 'general',
      message: 'An error occurred during validation. Please try again.',
      code: 'VALIDATION_ERROR',
      severity: 'error'
    })
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

// Validate discount code
async function validateDiscountCode(
  code: string,
  userId: string | null,
  orderTotal: number
): Promise<{ isValid: boolean; error?: string; discountAmount?: number }> {
  const supabase = createClient()

  try {
    // Call the database function for discount validation
    const { data, error } = await supabase.rpc('validate_discount_code', {
      code_text: code,
      user_uuid: userId,
      order_total: orderTotal
    })

    if (error) {
      console.error('Discount validation error:', error)
      return { isValid: false, error: 'Failed to validate discount code' }
    }

    return {
      isValid: data.valid,
      error: data.error,
      discountAmount: data.discount_amount
    }
  } catch (error) {
    console.error('Discount validation exception:', error)
    return { isValid: false, error: 'Failed to validate discount code' }
  }
}

// Business rule validation
export function validateBusinessRules(
  orderData: GuestOrderData | AuthenticatedOrderData
): OrderValidationResult {
  const errors: OrderValidationError[] = []
  const warnings: OrderValidationError[] = []

  // Minimum order value (example business rule)
  const minimumOrderValue = 50
  if (orderData.subtotal < minimumOrderValue) {
    warnings.push({
      field: 'subtotal',
      message: `Orders under R${minimumOrderValue} may have extended processing times`,
      code: 'LOW_ORDER_VALUE',
      severity: 'warning'
    })
  }

  // Maximum order value (fraud prevention)
  const maximumOrderValue = 10000
  if (orderData.total > maximumOrderValue) {
    errors.push({
      field: 'total',
      message: `Order total exceeds maximum allowed amount of R${maximumOrderValue}`,
      code: 'EXCESSIVE_ORDER_VALUE',
      severity: 'error'
    })
  }

  // Maximum quantity per item
  const maxQuantityPerItem = 10
  for (const item of orderData.cartItems) {
    if (item.quantity > maxQuantityPerItem) {
      errors.push({
        field: 'cartItems',
        message: `Maximum quantity per item is ${maxQuantityPerItem}`,
        code: 'EXCESSIVE_QUANTITY',
        severity: 'error'
      })
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

// Complete order validation
export async function validateOrder(
  orderData: GuestOrderData | AuthenticatedOrderData
): Promise<OrderValidationResult> {
  // Run both database and business rule validations
  const [dbValidation, businessValidation] = await Promise.all([
    validateDatabaseConstraints(orderData),
    Promise.resolve(validateBusinessRules(orderData))
  ])

  return {
    isValid: dbValidation.isValid && businessValidation.isValid,
    errors: [...dbValidation.errors, ...businessValidation.errors],
    warnings: [...dbValidation.warnings, ...businessValidation.warnings]
  }
}

// Format validation errors for user display
export function formatValidationErrors(errors: OrderValidationError[]): string {
  if (errors.length === 0) return ''
  
  const errorMessages = errors.map(error => error.message)
  return errorMessages.join('\n')
}

/**
 * Log validation violations for audit trail
 * @deprecated Use orderAuditLogger.logValidationViolation instead
 */
export const logValidationViolation = (
  orderData: GuestOrderData | AuthenticatedOrderData,
  errors: OrderValidationError[]
): void => {
  // Import here to avoid circular dependencies
  import('./order-audit-logger').then(({ orderAuditLogger }) => {
    orderAuditLogger.logValidationViolation(orderData, errors)
  }).catch(console.error)
}