-- 010: Fix Security Advisor warning "Clients can list all files in this bucket".
--
-- The policy "Public read access - product images" allowed ANYONE (including
-- anonymous visitors with the public anon key) to use the Storage API to
-- enumerate every object name/metadata inside the public product-images
-- bucket via list(). Because the bucket's public flag already serves files
-- directly by URL to everyone, listing is the only thing that needed to be
-- locked down — the storefront never calls list(); it only loads images by
-- public URL (which the public bucket flag still permits), and the backend
-- admin library lists files through the service key, which bypasses RLS.
--
-- Result: visitors can still see every image and video on the store, but
-- no client can programmatically enumerate the bucket's contents.

DROP POLICY IF EXISTS "Public read access - product images" ON storage.objects;
