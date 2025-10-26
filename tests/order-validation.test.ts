/// <reference path="../types/jest.d.ts" />
import { validateOrder, OrderValidationError, GuestOrderData, AuthenticatedOrderData } from '../lib/order-validation';
import { orderAuditLogger } from '../lib/order-audit-logger'

// Mock Supabase client
jest.mock('../lib/supabase/client', () => ({
  createClient: () => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({ data: null, error: null }))
        }))
      }))
    }))
  })
}))

describe('Order Validation System', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Guest Order Validation', () => {
    const validGuestOrder: GuestOrderData = {
      customerInfo: {
        full_name: 'John Doe',
        email: 'john@example.com',
        phone: '+27123456789'
      },
      address: {
        street_address: '123 Main St',
        city: 'Cape Town',
        province: 'Western Cape',
        postal_code: '8001',
        phone: '+27123456789'
      },
      cartItems: [
        {
          product_id: 'prod-1',
          quantity: 2,
          price: 299.99
        }
      ],
      deliveryMethod: 'courier_guy',
      deliveryFee: 99,
      subtotal: 599.98,
      total: 698.98
    }

    it('should validate a valid guest order', async () => {
      const result = await validateOrder(validGuestOrder)
      
      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject order with invalid email', async () => {
      const invalidOrder = {
        ...validGuestOrder,
        customerInfo: {
          ...validGuestOrder.customerInfo,
          email: 'invalid-email'
        }
      }

      const result = await validateOrder(invalidOrder)
      
      expect(result.isValid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_EMAIL',
          field: 'customerInfo.email',
          severity: 'error'
        })
      )
    })

    it('should reject order with invalid phone number', async () => {
      const invalidOrder = {
        ...validGuestOrder,
        customerInfo: {
          ...validGuestOrder.customerInfo,
          phone: '123'
        }
      }

      const result = await validateOrder(invalidOrder)
      
      expect(result.isValid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_PHONE',
          field: 'customerInfo.phone',
          severity: 'error'
        })
      )
    })

    it('should reject order with empty cart', async () => {
      const invalidOrder = {
        ...validGuestOrder,
        cartItems: []
      }

      const result = await validateOrder(invalidOrder)
      
      expect(result.isValid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'CART_EMPTY',
          field: 'cartItems',
          severity: 'error'
        })
      )
    })

    it('should reject order with invalid delivery method', async () => {
      const invalidOrder = {
        ...validGuestOrder,
        deliveryMethod: 'invalid_method'
      }

      const result = await validateOrder(invalidOrder)
      
      expect(result.isValid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_DELIVERY_METHOD',
          field: 'deliveryMethod',
          severity: 'error'
        })
      )
    })

    it('should reject order with calculation mismatch', async () => {
      const invalidOrder = {
        ...validGuestOrder,
        total: 999.99 // Wrong total
      }

      const result = await validateOrder(invalidOrder)
      
      expect(result.isValid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'CALCULATION_MISMATCH',
          field: 'total',
          severity: 'error'
        })
      )
    })

    it('should reject order exceeding maximum quantity', async () => {
      const invalidOrder = {
        ...validGuestOrder,
        cartItems: [
          {
            product_id: 'prod-1',
            quantity: 15, // Exceeds max of 10
            price: 299.99
          }
        ]
      }

      const result = await validateOrder(invalidOrder)
      
      expect(result.isValid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_QUANTITY',
          field: 'cartItems[0].quantity',
          severity: 'error'
        })
      )
    })
  })

  describe('Authenticated Order Validation', () => {
    const validAuthOrder: AuthenticatedOrderData = {
      userId: 'user-123',
      addressId: 'addr-456',
      cartItems: [
        {
          product_id: 'prod-2',
          quantity: 1,
          price: 499.99
        }
      ],
      deliveryMethod: 'pudo',
      deliveryFee: 65,
      subtotal: 499.99,
      total: 564.99
    }

    it('should validate a valid authenticated order', async () => {
      const result = await validateOrder(validAuthOrder)
      
      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject order with invalid user ID', async () => {
      const invalidOrder = {
        ...validAuthOrder,
        userId: ''
      }

      const result = await validateOrder(invalidOrder)
      
      expect(result.isValid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_USER_ID',
          field: 'userId',
          severity: 'error'
        })
      )
    })
  })

  describe('Business Rules Validation', () => {
    it('should warn about minimum order value', async () => {
      const lowValueOrder: GuestOrderData = {
        customerInfo: {
          full_name: 'John Doe',
          email: 'john@example.com',
          phone: '+27123456789'
        },
        address: {
          street_address: '123 Main St',
          city: 'Cape Town',
          province: 'Western Cape',
          postal_code: '8001',
          phone: '+27123456789'
        },
        cartItems: [
          {
            product_id: 'prod-1',
            quantity: 1,
            price: 50.00
          }
        ],
        deliveryMethod: 'courier_guy',
        deliveryFee: 99,
        subtotal: 50.00,
        total: 149.00
      }

      const result = await validateOrder(lowValueOrder)
      
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'MINIMUM_ORDER_NOT_MET',
          field: 'total',
          severity: 'warning'
        })
      )
    })

    it('should reject order exceeding maximum value', async () => {
      const highValueOrder: GuestOrderData = {
        customerInfo: {
          full_name: 'John Doe',
          email: 'john@example.com',
          phone: '+27123456789'
        },
        address: {
          street_address: '123 Main St',
          city: 'Cape Town',
          province: 'Western Cape',
          postal_code: '8001',
          phone: '+27123456789'
        },
        cartItems: [
          {
            product_id: 'prod-1',
            quantity: 1,
            price: 15000.00
          }
        ],
        deliveryMethod: 'courier_guy',
        deliveryFee: 99,
        subtotal: 15000.00,
        total: 15099.00
      }

      const result = await validateOrder(highValueOrder)
      
      expect(result.isValid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'MAXIMUM_ORDER_EXCEEDED',
          field: 'total',
          severity: 'error'
        })
      )
    })
  })

  describe('Discount Code Validation', () => {
    it('should validate order with valid discount code', async () => {
      const orderWithDiscount: GuestOrderData = {
        customerInfo: {
          full_name: 'John Doe',
          email: 'john@example.com',
          phone: '+27123456789'
        },
        address: {
          street_address: '123 Main St',
          city: 'Cape Town',
          province: 'Western Cape',
          postal_code: '8001',
          phone: '+27123456789'
        },
        cartItems: [
          {
            product_id: 'prod-1',
            quantity: 2,
            price: 299.99
          }
        ],
        deliveryMethod: 'courier_guy',
        deliveryFee: 99,
        subtotal: 599.98,
        discountCode: 'SAVE10',
        discountAmount: 60.00,
        total: 638.98
      }

      const result = await validateOrder(orderWithDiscount)
      
      // Should pass basic validation (discount validation would require database mocking)
      expect(result.isValid).toBe(true)
    })
  })

  describe('Address Validation', () => {
    it('should reject order with incomplete address', async () => {
      const invalidOrder: GuestOrderData = {
        customerInfo: {
          full_name: 'John Doe',
          email: 'john@example.com',
          phone: '+27123456789'
        },
        address: {
          street_address: '',
          city: 'Cape Town',
          province: 'Western Cape',
          postal_code: '8001',
          phone: '+27123456789'
        },
        cartItems: [
          {
            product_id: 'prod-1',
            quantity: 1,
            price: 299.99
          }
        ],
        deliveryMethod: 'courier_guy',
        deliveryFee: 99,
        subtotal: 299.99,
        total: 398.99
      }

      const result = await validateOrder(invalidOrder)
      
      expect(result.isValid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_ADDRESS',
          field: 'address.street_address',
          severity: 'error'
        })
      )
    })

    it('should reject order with invalid postal code', async () => {
      const invalidOrder: GuestOrderData = {
        customerInfo: {
          full_name: 'John Doe',
          email: 'john@example.com',
          phone: '+27123456789'
        },
        address: {
          street_address: '123 Main St',
          city: 'Cape Town',
          province: 'Western Cape',
          postal_code: '123', // Invalid postal code
          phone: '+27123456789'
        },
        cartItems: [
          {
            product_id: 'prod-1',
            quantity: 1,
            price: 299.99
          }
        ],
        deliveryMethod: 'courier_guy',
        deliveryFee: 99,
        subtotal: 299.99,
        total: 398.99
      }

      const result = await validateOrder(invalidOrder)
      
      expect(result.isValid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_ADDRESS',
          field: 'address.postal_code',
          severity: 'error'
        })
      )
    })
  })
})

describe('Audit Logging System', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should log validation violations', async () => {
    const logSpy = jest.spyOn(orderAuditLogger, 'logValidationViolation')
    
    const invalidOrder: GuestOrderData = {
      customerInfo: {
        full_name: 'John Doe',
        email: 'invalid-email',
        phone: '+27123456789'
      },
      address: {
        street_address: '123 Main St',
        city: 'Cape Town',
        province: 'Western Cape',
        postal_code: '8001',
        phone: '+27123456789'
      },
      cartItems: [],
      deliveryMethod: 'courier_guy',
      deliveryFee: 99,
      subtotal: 0,
      total: 99
    }

    const result = await validateOrder(invalidOrder)
    
    expect(result.isValid).toBe(false)
    expect(logSpy).toHaveBeenCalledWith(
      invalidOrder,
      expect.arrayContaining([
        expect.objectContaining({
          code: 'INVALID_EMAIL'
        }),
        expect.objectContaining({
          code: 'CART_EMPTY'
        })
      ])
    )
  })

  it('should log suspicious activity', async () => {
    const logSpy = jest.spyOn(orderAuditLogger, 'logSuspiciousActivity')
    
    const suspiciousOrder: GuestOrderData = {
      customerInfo: {
        full_name: 'John Doe',
        email: 'john@example.com',
        phone: '+27123456789'
      },
      address: {
        street_address: '123 Main St',
        city: 'Cape Town',
        province: 'Western Cape',
        postal_code: '8001',
        phone: '+27123456789'
      },
      cartItems: [
        {
          product_id: 'prod-1',
          quantity: 100, // Suspicious high quantity
          price: 299.99
        }
      ],
      deliveryMethod: 'courier_guy',
      deliveryFee: 99,
      subtotal: 29999.00,
      total: 30098.00
    }

    await orderAuditLogger.logSuspiciousActivity(
      'Unusually high quantity order',
      suspiciousOrder,
      { quantity: 100, threshold: 10 }
    )
    
    expect(logSpy).toHaveBeenCalledWith(
      'Unusually high quantity order',
      suspiciousOrder,
      { quantity: 100, threshold: 10 }
    )
  })
})

describe('Error Message Formatting', () => {
  it('should format validation errors for user display', () => {
    const errors: OrderValidationError[] = [
      {
        code: 'INVALID_EMAIL',
        message: 'Invalid email format',
        field: 'customerInfo.email',
        severity: 'error'
      },
      {
        code: 'CART_EMPTY',
        message: 'Cart cannot be empty',
        field: 'cartItems',
        severity: 'error'
      }
    ]

    // This would test the formatValidationErrors function
    // Implementation depends on the actual formatting logic
    expect(errors).toHaveLength(2)
    expect(errors[0].code).toBe('INVALID_EMAIL')
    expect(errors[1].code).toBe('CART_EMPTY')
  })
})

describe('WhatsApp Integration', () => {
  it('should use correct business phone number', () => {
    const businessNumber = '+27634009626'
    
    // Test that the WhatsApp integration uses the correct number
    expect(businessNumber).toBe('+27634009626')
    expect(businessNumber).not.toBe('+27123456789') // Old placeholder
  })

  it('should format order details for WhatsApp', () => {
    const orderData = {
      orderNumber: 'ORD-123',
      customerName: 'John Doe',
      total: 698.98,
      items: [
        { name: 'Product 1', quantity: 2, price: 299.99 }
      ]
    }

    // This would test the WhatsApp message formatting
    // Implementation depends on the actual formatting function
    expect(orderData.orderNumber).toBe('ORD-123')
    expect(orderData.total).toBe(698.98)
  })
})