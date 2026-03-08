
CREATE POLICY "Service can update download count"
  ON public.document_share_links FOR UPDATE
  USING (true)
  WITH CHECK (true);
