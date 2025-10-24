
-- Silinmiş bir kullanıcıyı geri getirmek için örnek SQL
BEGIN;

UPDATE public.users
SET is_active = TRUE,
    deleted_by = NULL,
    deleted_by_role = NULL,
    deleted_by_id = NULL,
    deleted_at = NULL
WHERE id = 123   -- burada gerçek kullanıcı ID’sini yaz
  AND COALESCE(is_active, FALSE) = FALSE
RETURNING id, username, is_active;

COMMIT;
