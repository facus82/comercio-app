-- 011_productos_imagenes.sql
-- Imágenes de productos en Supabase Storage.
--   · productos.imagen_url ya existe en el schema (no se crea columna)
--   · Bucket público "productos": lectura libre (las imágenes se muestran en el POS)
--   · Cada comercio sólo puede subir/borrar dentro de su carpeta: <comercio_id>/archivo.webp
--   · Límite 200 KB por archivo: la app comprime a ~20-40 KB antes de subir

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('productos', 'productos', true, 204800, ARRAY['image/webp', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 204800,
      allowed_mime_types = ARRAY['image/webp', 'image/jpeg', 'image/png'];

-- Lectura pública
CREATE POLICY "prodimg_select" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'productos');

-- Escritura sólo en la carpeta del propio comercio
CREATE POLICY "prodimg_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'productos'
    AND (storage.foldername(name))[1] IN (SELECT comercio_id::text FROM public.usuarios WHERE id = auth.uid())
  );

CREATE POLICY "prodimg_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'productos'
    AND (storage.foldername(name))[1] IN (SELECT comercio_id::text FROM public.usuarios WHERE id = auth.uid())
  );

CREATE POLICY "prodimg_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'productos'
    AND (storage.foldername(name))[1] IN (SELECT comercio_id::text FROM public.usuarios WHERE id = auth.uid())
  );
