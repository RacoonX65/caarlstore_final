-- Create order audit logs table for comprehensive validation tracking
CREATE TABLE IF NOT EXISTS public.order_audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type TEXT NOT NULL CHECK (event_type IN ('validation_failure', 'validation_warning', 'order_blocked', 'suspicious_activity')),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    session_id TEXT NOT NULL,
    order_data JSONB NOT NULL,
    validation_errors JSONB NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    ip_address TEXT,
    user_agent TEXT,
    additional_context JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_order_audit_logs_timestamp ON public.order_audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_order_audit_logs_user_id ON public.order_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_order_audit_logs_event_type ON public.order_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_order_audit_logs_severity ON public.order_audit_logs(severity);
CREATE INDEX IF NOT EXISTS idx_order_audit_logs_session_id ON public.order_audit_logs(session_id);

-- Create composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_order_audit_logs_user_timestamp ON public.order_audit_logs(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_order_audit_logs_severity_timestamp ON public.order_audit_logs(severity, timestamp DESC);

-- Add RLS policies for security
ALTER TABLE public.order_audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can view audit logs
CREATE POLICY "Admin can view all audit logs" ON public.order_audit_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Policy: System can insert audit logs (service role)
CREATE POLICY "System can insert audit logs" ON public.order_audit_logs
    FOR INSERT
    WITH CHECK (true);

-- Policy: No updates or deletes allowed (audit logs are immutable)
CREATE POLICY "No updates allowed" ON public.order_audit_logs
    FOR UPDATE
    USING (false);

CREATE POLICY "No deletes allowed" ON public.order_audit_logs
    FOR DELETE
    USING (false);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
CREATE TRIGGER update_order_audit_logs_updated_at
    BEFORE UPDATE ON public.order_audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create a view for critical violations (for monitoring dashboards)
CREATE OR REPLACE VIEW public.critical_order_violations AS
SELECT 
    id,
    timestamp,
    event_type,
    user_id,
    session_id,
    validation_errors,
    ip_address,
    user_agent,
    created_at
FROM public.order_audit_logs
WHERE severity IN ('high', 'critical')
ORDER BY timestamp DESC;

-- Grant appropriate permissions
GRANT SELECT ON public.critical_order_violations TO authenticated;
GRANT SELECT ON public.order_audit_logs TO service_role;
GRANT INSERT ON public.order_audit_logs TO service_role;

-- Create a function to get audit log statistics
CREATE OR REPLACE FUNCTION get_audit_log_stats(
    start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
    end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
    total_violations BIGINT,
    critical_violations BIGINT,
    high_violations BIGINT,
    medium_violations BIGINT,
    low_violations BIGINT,
    unique_users BIGINT,
    unique_sessions BIGINT,
    most_common_error TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_violations,
        COUNT(*) FILTER (WHERE severity = 'critical') as critical_violations,
        COUNT(*) FILTER (WHERE severity = 'high') as high_violations,
        COUNT(*) FILTER (WHERE severity = 'medium') as medium_violations,
        COUNT(*) FILTER (WHERE severity = 'low') as low_violations,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT session_id) as unique_sessions,
        (
            SELECT jsonb_extract_path_text(validation_errors, '0', 'code')
            FROM public.order_audit_logs
            WHERE timestamp BETWEEN start_date AND end_date
            GROUP BY jsonb_extract_path_text(validation_errors, '0', 'code')
            ORDER BY COUNT(*) DESC
            LIMIT 1
        ) as most_common_error
    FROM public.order_audit_logs
    WHERE timestamp BETWEEN start_date AND end_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the stats function
GRANT EXECUTE ON FUNCTION get_audit_log_stats TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE public.order_audit_logs IS 'Comprehensive audit trail for order validation violations and suspicious activities';
COMMENT ON COLUMN public.order_audit_logs.event_type IS 'Type of event: validation_failure, validation_warning, order_blocked, suspicious_activity';
COMMENT ON COLUMN public.order_audit_logs.severity IS 'Severity level: low, medium, high, critical';
COMMENT ON COLUMN public.order_audit_logs.order_data IS 'Sanitized order data (sensitive information masked)';
COMMENT ON COLUMN public.order_audit_logs.validation_errors IS 'Array of validation errors with codes, messages, and fields';
COMMENT ON COLUMN public.order_audit_logs.session_id IS 'Unique session identifier for tracking user sessions';
COMMENT ON VIEW public.critical_order_violations IS 'View of high and critical severity violations for monitoring';
COMMENT ON FUNCTION get_audit_log_stats IS 'Function to get audit log statistics for a given date range';