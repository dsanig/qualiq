CREATE POLICY "Superadmins can delete audit trail"
ON public.audit_trail
FOR DELETE
TO authenticated
USING (is_superadmin(auth.uid()));