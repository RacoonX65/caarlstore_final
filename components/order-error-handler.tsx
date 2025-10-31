"use client"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { AlertTriangle, XCircle, Info, RefreshCw } from "lucide-react"
import { OrderValidationError } from "@/lib/order-validation-client"

interface OrderErrorHandlerProps {
  errors: OrderValidationError[]
  warnings?: OrderValidationError[]
  onRetry?: () => void
  onDismiss?: () => void
}export function OrderErrorHandler({ errors, onRetry, onDismiss }: OrderErrorHandlerProps) {
  if (errors.length === 0) return null

  // Categorize errors by severity
  const criticalErrors = errors.filter(e => e.severity === 'error')
  const warnings = errors.filter(e => e.severity === 'warning')

  const getIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return <XCircle className="h-4 w-4" />
      case 'warning':
        return <AlertTriangle className="h-4 w-4" />
      case 'info':
        return <Info className="h-4 w-4" />
      default:
        return <AlertTriangle className="h-4 w-4" />
    }
  }

  const getVariant = (severity: string) => {
    switch (severity) {
      case 'error':
        return 'destructive' as const
      case 'warning':
        return 'default' as const
      case 'info':
        return 'default' as const
      default:
        return 'default' as const
    }
  }

  const getActionableMessage = (error: OrderValidationError): string => {
    switch (error.code) {
      case 'PRODUCT_OUT_OF_STOCK':
        return "Please remove out-of-stock items from your cart or reduce quantities."
      case 'PRODUCT_PRICE_CHANGED':
        return "Product prices have been updated. Please review your cart."
      case 'INVALID_DISCOUNT_CODE':
        return "Please check your discount code or remove it to continue."
      case 'DISCOUNT_EXPIRED':
        return "This discount code has expired. Please remove it or use a different code."
      case 'DISCOUNT_USAGE_EXCEEDED':
        return "You've already used this discount code. Please remove it to continue."
      case 'MINIMUM_ORDER_NOT_MET':
        return "Add more items to your cart to meet the minimum order requirement."
      case 'MAXIMUM_ORDER_EXCEEDED':
        return "Please reduce your order total or split into multiple orders."
      case 'INVALID_DELIVERY_METHOD':
        return "Please select a valid delivery method."
      case 'INVALID_ADDRESS':
        return "Please check your delivery address details."
      case 'INVALID_PHONE':
        return "Please provide a valid phone number."
      case 'INVALID_EMAIL':
        return "Please provide a valid email address."
      case 'CART_EMPTY':
        return "Please add items to your cart before checking out."
      case 'PRODUCT_NOT_FOUND':
        return "Some products in your cart are no longer available. Please refresh your cart."
      case 'INVALID_QUANTITY':
        return "Please check the quantities in your cart."
      case 'CALCULATION_MISMATCH':
        return "There's an issue with the order total calculation. Please refresh and try again."
      default:
        return error.message
    }
  }

  return (
    <div className="space-y-4">
      {/* Critical Errors */}
      {criticalErrors.length > 0 && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Order Cannot Be Processed</AlertTitle>
          <AlertDescription>
            <div className="space-y-2">
              {criticalErrors.map((error, index) => (
                <div key={index} className="text-sm">
                  <strong>{error.field}:</strong> {getActionableMessage(error)}
                </div>
              ))}
              <div className="flex gap-2 mt-3">
                {onRetry && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={onRetry}
                    className="text-red-600 border-red-200 hover:bg-red-50"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Try Again
                  </Button>
                )}
                {onDismiss && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={onDismiss}
                    className="text-red-600 hover:bg-red-50"
                  >
                    Dismiss
                  </Button>
                )}
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <Alert variant="default" className="border-yellow-200 bg-yellow-50">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertTitle className="text-yellow-800">Please Review</AlertTitle>
          <AlertDescription>
            <div className="space-y-2">
              {warnings.map((warning, index) => (
                <div key={index} className="text-sm text-yellow-700">
                  <strong>{warning.field}:</strong> {getActionableMessage(warning)}
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}


    </div>
  )
}

// Hook for easy error handling in forms
export function useOrderErrorHandler() {
  const handleValidationErrors = (errors: OrderValidationError[]) => {
    // Group errors by field for better UX
    const errorsByField = errors.reduce((acc, error) => {
      if (!acc[error.field]) {
        acc[error.field] = []
      }
      acc[error.field].push(error)
      return acc
    }, {} as Record<string, OrderValidationError[]>)

    return {
      errorsByField,
      hasErrors: errors.some(e => e.severity === 'error'),
      hasWarnings: errors.some(e => e.severity === 'warning'),
      criticalErrors: errors.filter(e => e.severity === 'error'),
      warnings: errors.filter(e => e.severity === 'warning'),
    }
  }

  return { handleValidationErrors }
}