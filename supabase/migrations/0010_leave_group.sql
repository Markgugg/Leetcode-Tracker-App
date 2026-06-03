-- RPC: leave a group and auto-delete it if no members remain.
-- security definer lets it delete the groups row regardless of RLS.
create or replace function leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from group_members
    where group_id = p_group_id and user_id = auth.uid();

  delete from groups
    where id = p_group_id
      and not exists (
        select 1 from group_members where group_id = p_group_id
      );
end;
$$;
