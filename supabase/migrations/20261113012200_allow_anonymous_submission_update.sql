-- 通訊稿收集（project ref upbjjbrqtlrpznnyydbx）only.
-- Lets anon and authenticated UPDATE public.submissions (edit + reorder).
-- DELETE stays on submissions_admin_delete (authenticated + private.is_admin()).
-- Safe to re-run. Does not change table data.
--
-- Rollback:
--   drop policy if exists submissions_public_update on public.submissions;

drop policy if exists submissions_public_update on public.submissions;

create policy submissions_public_update
  on public.submissions
  for update
  to anon, authenticated
  using (true)
  with check (true);
