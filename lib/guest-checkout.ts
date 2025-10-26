// Guest checkout types and utilities for localStorage management

export interface GuestCartItem {
  id: string // temporary ID for guest cart
  product_id: string
  quantity: number
  size: string
  color: string
  product?: {
    id: string
    name: string
    price: number
    image_url: string
    stock_quantity: number
  }
}

export interface GuestCustomerInfo {
  full_name: string
  email: string
  phone: string
}

export interface GuestAddress {
  street_address: string
  city: string
  province: string
  postal_code: string
  country: string
}

export interface GuestCheckoutData {
  customer: GuestCustomerInfo
  address: GuestAddress
  delivery_method: string
  applied_discount?: {
    code: string
    amount: number
    codeId: string
  }
}

// localStorage keys
const GUEST_CART_KEY = 'caarl_guest_cart'
const GUEST_CHECKOUT_KEY = 'caarl_guest_checkout'

// Guest cart management
export const guestCartUtils = {
  // Get guest cart from localStorage
  getCart: (): GuestCartItem[] => {
    if (typeof window === 'undefined') return []
    try {
      const cart = localStorage.getItem(GUEST_CART_KEY)
      return cart ? JSON.parse(cart) : []
    } catch {
      return []
    }
  },

  // Save guest cart to localStorage
  saveCart: (cart: GuestCartItem[]): void => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(GUEST_CART_KEY, JSON.stringify(cart))
    } catch (error) {
      console.error('Failed to save guest cart:', error)
    }
  },

  // Add item to guest cart
  addItem: (item: Omit<GuestCartItem, 'id'>): void => {
    const cart = guestCartUtils.getCart()
    const existingItemIndex = cart.findIndex(
      cartItem => 
        cartItem.product_id === item.product_id &&
        cartItem.size === item.size &&
        cartItem.color === item.color
    )

    if (existingItemIndex >= 0) {
      // Update quantity of existing item
      cart[existingItemIndex].quantity += item.quantity
    } else {
      // Add new item with temporary ID
      const newItem: GuestCartItem = {
        ...item,
        id: `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }
      cart.push(newItem)
    }

    guestCartUtils.saveCart(cart)
  },

  // Update item quantity in guest cart
  updateQuantity: (itemId: string, quantity: number): void => {
    const cart = guestCartUtils.getCart()
    const itemIndex = cart.findIndex(item => item.id === itemId)
    
    if (itemIndex >= 0) {
      if (quantity <= 0) {
        cart.splice(itemIndex, 1)
      } else {
        cart[itemIndex].quantity = quantity
      }
      guestCartUtils.saveCart(cart)
    }
  },

  // Remove item from guest cart
  removeItem: (itemId: string): void => {
    const cart = guestCartUtils.getCart()
    const filteredCart = cart.filter(item => item.id !== itemId)
    guestCartUtils.saveCart(filteredCart)
  },

  // Clear guest cart
  clearCart: (): void => {
    if (typeof window === 'undefined') return
    localStorage.removeItem(GUEST_CART_KEY)
  },

  // Get cart item count
  getItemCount: (): number => {
    const cart = guestCartUtils.getCart()
    return cart.reduce((total, item) => total + item.quantity, 0)
  },

  // Calculate cart subtotal
  getSubtotal: (): number => {
    const cart = guestCartUtils.getCart()
    return cart.reduce((total, item) => {
      const price = item.product?.price || 0
      return total + (price * item.quantity)
    }, 0)
  }
}

// Guest checkout data management
export const guestCheckoutUtils = {
  // Get guest checkout data from localStorage
  getCheckoutData: (): GuestCheckoutData | null => {
    if (typeof window === 'undefined') return null
    try {
      const data = localStorage.getItem(GUEST_CHECKOUT_KEY)
      return data ? JSON.parse(data) : null
    } catch {
      return null
    }
  },

  // Save guest checkout data to localStorage
  saveCheckoutData: (data: GuestCheckoutData): void => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(GUEST_CHECKOUT_KEY, JSON.stringify(data))
    } catch (error) {
      console.error('Failed to save guest checkout data:', error)
    }
  },

  // Clear guest checkout data
  clearCheckoutData: (): void => {
    if (typeof window === 'undefined') return
    localStorage.removeItem(GUEST_CHECKOUT_KEY)
  }
}

// Utility to check if user is guest (not authenticated)
export const isGuestUser = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return false
  
  try {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return !user
  } catch {
    return true // Assume guest if auth check fails
  }
}

// Migrate guest cart to user cart when user logs in
export const migrateGuestCartToUser = async (userId: string): Promise<void> => {
  const guestCart = guestCartUtils.getCart()
  if (guestCart.length === 0) return

  try {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()

    // Add each guest cart item to user's cart
    for (const item of guestCart) {
      // Check if item already exists in user's cart
      const { data: existingItem } = await supabase
        .from('cart_items')
        .select('*')
        .eq('user_id', userId)
        .eq('product_id', item.product_id)
        .eq('size', item.size)
        .eq('color', item.color)
        .single()

      if (existingItem) {
        // Update quantity
        await supabase
          .from('cart_items')
          .update({ 
            quantity: existingItem.quantity + item.quantity,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingItem.id)
      } else {
        // Insert new item
        await supabase
          .from('cart_items')
          .insert({
            user_id: userId,
            product_id: item.product_id,
            quantity: item.quantity,
            size: item.size,
            color: item.color
          })
      }
    }

    // Clear guest cart after migration
    guestCartUtils.clearCart()
  } catch (error) {
    console.error('Failed to migrate guest cart:', error)
  }
}