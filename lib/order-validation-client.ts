// Client-side order validation system
// This module provides validation that can be used in client components

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

/**
 * Client-side business rules validation
 * This runs basic validation that doesn't require database access
 */
export function validateBusinessRules(
  orderData: GuestOrderData | AuthenticatedOrderData
): OrderValidationResult {
  const errors: OrderValidationError[] = []
  const warnings: OrderValidationError[] = []

  // Validate cart items
  if (!orderData.cartItems || orderData.cartItems.length === 0) {
    errors.push({
      field: 'cartItems',
      message: 'Cart cannot be empty',
      code: 'EMPTY_CART',
      severity: 'error'
    })
  }

  // Validate quantities
  orderData.cartItems.forEach((item, index) => {
    if (item.quantity <= 0) {
      errors.push({
        field: `cartItems[${index}].quantity`,
        message: 'Quantity must be greater than 0',
        code: 'INVALID_QUANTITY',
        severity: 'error'
      })
    }
    if (item.quantity > 10) {
      warnings.push({
        field: `cartItems[${index}].quantity`,
        message: 'Large quantity order - please verify',
        code: 'LARGE_QUANTITY',
        severity: 'warning'
      })
    }
  })

  // Validate totals
  if (orderData.total <= 0) {
    errors.push({
      field: 'total',
      message: 'Order total must be greater than 0',
      code: 'INVALID_TOTAL',
      severity: 'error'
    })
  }

  // Validate delivery method
  if (!orderData.deliveryMethod) {
    errors.push({
      field: 'deliveryMethod',
      message: 'Delivery method is required',
      code: 'MISSING_DELIVERY_METHOD',
      severity: 'error'
    })
  }

  // Guest order specific validation
  if ('customerInfo' in orderData) {
    const { customerInfo, address } = orderData

    // Validate customer info
    if (!customerInfo.full_name?.trim()) {
      errors.push({
        field: 'customerInfo.full_name',
        message: 'Full name is required',
        code: 'MISSING_NAME',
        severity: 'error'
      })
    }

    if (!customerInfo.email?.trim()) {
      errors.push({
        field: 'customerInfo.email',
        message: 'Email is required',
        code: 'MISSING_EMAIL',
        severity: 'error'
      })
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerInfo.email)) {
      errors.push({
        field: 'customerInfo.email',
        message: 'Invalid email format',
        code: 'INVALID_EMAIL',
        severity: 'error'
      })
    }

    if (!customerInfo.phone?.trim()) {
      errors.push({
        field: 'customerInfo.phone',
        message: 'Phone number is required',
        code: 'MISSING_PHONE',
        severity: 'error'
      })
    }

    // Validate address
    if (!address.street_address?.trim()) {
      errors.push({
        field: 'address.street_address',
        message: 'Street address is required',
        code: 'MISSING_ADDRESS',
        severity: 'error'
      })
    }

    if (!address.city?.trim()) {
      errors.push({
        field: 'address.city',
        message: 'City is required',
        code: 'MISSING_CITY',
        severity: 'error'
      })
    }

    if (!address.province?.trim()) {
      errors.push({
        field: 'address.province',
        message: 'Province is required',
        code: 'MISSING_PROVINCE',
        severity: 'error'
      })
    }

    if (!address.postal_code?.trim()) {
      errors.push({
        field: 'address.postal_code',
        message: 'Postal code is required',
        code: 'MISSING_POSTAL_CODE',
        severity: 'error'
      })
    }
  }

  // Authenticated order specific validation
  if ('userId' in orderData) {
    if (!orderData.userId?.trim()) {
      errors.push({
        field: 'userId',
        message: 'User ID is required',
        code: 'MISSING_USER_ID',
        severity: 'error'
      })
    }

    if (!orderData.addressId?.trim()) {
      errors.push({
        field: 'addressId',
        message: 'Address ID is required',
        code: 'MISSING_ADDRESS_ID',
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

/**
 * Format validation errors for display
 */
export function formatValidationErrors(errors: OrderValidationError[]): string {
  if (errors.length === 0) return ''
  
  return errors
    .map(error => error.message)
    .join(', ')
}

/**
 * Client-side validation that doesn't require database access
 * For full validation including database constraints, use server-side validation
 */
export function validateOrderClient(
  orderData: GuestOrderData | AuthenticatedOrderData
): OrderValidationResult {
  return validateBusinessRules(orderData)
}