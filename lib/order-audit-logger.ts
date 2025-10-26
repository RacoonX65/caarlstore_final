import { createClient } from '@/lib/supabase/server'
import { OrderValidationError, GuestOrderData, AuthenticatedOrderData } from './order-validation'

export interface AuditLogEntry {
  id?: string
  timestamp: string
  event_type: 'validation_failure' | 'validation_warning' | 'order_blocked' | 'suspicious_activity'
  user_id?: string
  session_id?: string
  order_data: any
  validation_errors: OrderValidationError[]
  severity: 'low' | 'medium' | 'high' | 'critical'
  ip_address?: string
  user_agent?: string
  additional_context?: any
}

export class OrderAuditLogger {
  private sessionId: string

  constructor() {
    // Generate a unique session ID for tracking
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Log validation violations for audit trail
   */
  async logValidationViolation(
    orderData: GuestOrderData | AuthenticatedOrderData,
    errors: OrderValidationError[],
    additionalContext?: any
  ): Promise<void> {
    try {
      const severity = this.determineSeverity(errors)
      const eventType = this.determineEventType(errors)

      const logEntry: AuditLogEntry = {
        timestamp: new Date().toISOString(),
        event_type: eventType,
        user_id: 'userId' in orderData ? orderData.userId : undefined,
        session_id: this.sessionId,
        order_data: this.sanitizeOrderData(orderData),
        validation_errors: errors,
        severity,
        ip_address: await this.getClientIP(),
        user_agent: navigator.userAgent,
        additional_context: additionalContext,
      }

      // Log to console for development
      if (process.env.NODE_ENV === 'development') {
        console.group('🚨 Order Validation Violation')
        console.log('Severity:', severity)
        console.log('Event Type:', eventType)
        console.log('Errors:', errors)
        console.log('Order Data:', this.sanitizeOrderData(orderData))
        console.groupEnd()
      }

      // Store in database for production audit trail
      await this.storeAuditLog(logEntry)

      // Send alerts for critical violations
      if (severity === 'critical') {
        await this.sendCriticalAlert(logEntry)
      }

    } catch (error) {
      console.error('Failed to log validation violation:', error)
      // Don't throw - logging failures shouldn't break the user flow
    }
  }

  /**
   * Log successful order validation for monitoring
   */
  async logValidationSuccess(
    orderData: GuestOrderData | AuthenticatedOrderData,
    warnings: OrderValidationError[] = []
  ): Promise<void> {
    try {
      if (warnings.length > 0) {
        const logEntry: AuditLogEntry = {
          timestamp: new Date().toISOString(),
          event_type: 'validation_warning',
          user_id: 'userId' in orderData ? orderData.userId : undefined,
          session_id: this.sessionId,
          order_data: this.sanitizeOrderData(orderData),
          validation_errors: warnings,
          severity: 'low',
          ip_address: await this.getClientIP(),
          user_agent: navigator.userAgent,
        }

        await this.storeAuditLog(logEntry)
      }
    } catch (error) {
      console.error('Failed to log validation success:', error)
    }
  }

  /**
   * Log suspicious activity patterns
   */
  async logSuspiciousActivity(
    description: string,
    orderData: GuestOrderData | AuthenticatedOrderData,
    context?: any
  ): Promise<void> {
    try {
      const logEntry: AuditLogEntry = {
        timestamp: new Date().toISOString(),
        event_type: 'suspicious_activity',
        user_id: 'userId' in orderData ? orderData.userId : undefined,
        session_id: this.sessionId,
        order_data: this.sanitizeOrderData(orderData),
        validation_errors: [{
          code: 'SUSPICIOUS_ACTIVITY',
          message: description,
          field: 'system',
          severity: 'error' as const,
        }],
        severity: 'high',
        ip_address: await this.getClientIP(),
        user_agent: navigator.userAgent,
        additional_context: context,
      }

      await this.storeAuditLog(logEntry)
      await this.sendCriticalAlert(logEntry)

    } catch (error) {
      console.error('Failed to log suspicious activity:', error)
    }
  }

  private determineSeverity(errors: OrderValidationError[]): 'low' | 'medium' | 'high' | 'critical' {
    const criticalCodes = [
      'PRODUCT_NOT_FOUND',
      'CALCULATION_MISMATCH',
      'CART_EMPTY',
      'INVALID_USER_ID'
    ]

    const highCodes = [
      'PRODUCT_OUT_OF_STOCK',
      'INVALID_DISCOUNT_CODE',
      'DISCOUNT_USAGE_EXCEEDED',
      'MAXIMUM_ORDER_EXCEEDED'
    ]

    const mediumCodes = [
      'PRODUCT_PRICE_CHANGED',
      'DISCOUNT_EXPIRED',
      'MINIMUM_ORDER_NOT_MET',
      'INVALID_QUANTITY'
    ]

    if (errors.some(e => criticalCodes.includes(e.code))) {
      return 'critical'
    }

    if (errors.some(e => highCodes.includes(e.code))) {
      return 'high'
    }

    if (errors.some(e => mediumCodes.includes(e.code))) {
      return 'medium'
    }

    return 'low'
  }

  private determineEventType(errors: OrderValidationError[]): AuditLogEntry['event_type'] {
    const hasErrors = errors.some(e => e.severity === 'error')
    const hasWarnings = errors.some(e => e.severity === 'warning')

    if (hasErrors) {
      return 'validation_failure'
    }

    if (hasWarnings) {
      return 'validation_warning'
    }

    return 'validation_failure'
  }

  private sanitizeOrderData(orderData: GuestOrderData | AuthenticatedOrderData): any {
    // Remove sensitive information before logging
    const sanitized = { ...orderData }

    // Check if this is guest order data (has customerInfo and address)
    if ('customerInfo' in sanitized && sanitized.customerInfo) {
      sanitized.customerInfo = {
        ...sanitized.customerInfo,
        email: this.maskEmail(sanitized.customerInfo.email),
        phone: this.maskPhone(sanitized.customerInfo.phone),
      }
    }

    if ('address' in sanitized && sanitized.address) {
      sanitized.address = {
        ...sanitized.address,
        phone: this.maskPhone(sanitized.address.phone),
      }
    }

    // For authenticated orders, we only have userId and addressId (no direct customer info to mask)
    
    return sanitized
  }

  private maskEmail(email: string): string {
    const [username, domain] = email.split('@')
    const maskedUsername = username.length > 2 
      ? username.substring(0, 2) + '*'.repeat(username.length - 2)
      : username
    return `${maskedUsername}@${domain}`
  }

  private maskPhone(phone: string): string {
    if (phone.length > 4) {
      return phone.substring(0, 3) + '*'.repeat(phone.length - 6) + phone.substring(phone.length - 3)
    }
    return phone
  }

  private async getClientIP(): Promise<string> {
    try {
      // In a real application, you might get this from headers or a service
      return 'client_ip_masked'
    } catch {
      return 'unknown'
    }
  }

  private async storeAuditLog(logEntry: AuditLogEntry): Promise<void> {
    try {
      // Store in a dedicated audit log table
      // Note: You would need to create this table in your database
      const supabase = await createClient()
      const { error } = await supabase
        .from('order_audit_logs')
        .insert({
          timestamp: logEntry.timestamp,
          event_type: logEntry.event_type,
          user_id: logEntry.user_id,
          session_id: logEntry.session_id,
          order_data: logEntry.order_data,
          validation_errors: logEntry.validation_errors,
          severity: logEntry.severity,
          ip_address: logEntry.ip_address,
          user_agent: logEntry.user_agent,
          additional_context: logEntry.additional_context,
        })

      if (error) {
        console.error('Failed to store audit log:', error)
      }
    } catch (error) {
      console.error('Error storing audit log:', error)
    }
  }

  private async sendCriticalAlert(logEntry: AuditLogEntry): Promise<void> {
    try {
      // In a real application, you might send this to a monitoring service
      // like Sentry, DataDog, or send an email/Slack notification
      console.error('🚨 CRITICAL ORDER VALIDATION VIOLATION:', {
        timestamp: logEntry.timestamp,
        eventType: logEntry.event_type,
        userId: logEntry.user_id,
        errors: logEntry.validation_errors,
        severity: logEntry.severity,
      })

      // You could also send to an external monitoring service:
      // await fetch('/api/alerts/critical', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(logEntry)
      // })

    } catch (error) {
      console.error('Failed to send critical alert:', error)
    }
  }
}

// Singleton instance for consistent session tracking
export const orderAuditLogger = new OrderAuditLogger()

// Convenience function for logging validation violations
export const logValidationViolation = (
  orderData: GuestOrderData | AuthenticatedOrderData,
  errors: OrderValidationError[],
  additionalContext?: any
) => {
  return orderAuditLogger.logValidationViolation(orderData, errors, additionalContext)
}

// Convenience function for logging suspicious activity
export const logSuspiciousActivity = (
  description: string,
  orderData: GuestOrderData | AuthenticatedOrderData,
  context?: any
) => {
  return orderAuditLogger.logSuspiciousActivity(description, orderData, context)
}