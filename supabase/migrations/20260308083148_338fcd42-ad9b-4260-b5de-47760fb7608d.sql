
-- Allow service role to delete predictive_insights (the edge function uses service role)
-- The existing INSERT policy already uses WITH CHECK (true) for service role
-- DELETE needs a similar policy for the cleanup step
CREATE POLICY "Service can delete predictive insights"
ON public.predictive_insights
FOR DELETE
TO authenticated
USING (true);
