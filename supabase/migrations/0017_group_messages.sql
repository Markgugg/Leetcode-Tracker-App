create table if not exists group_messages (
  id          uuid        primary key default gen_random_uuid(),
  group_id    uuid        references groups(id)   on delete cascade not null,
  user_id     uuid        references profiles(id) on delete cascade not null,
  content     text        not null check (char_length(content) between 1 and 500),
  created_at  timestamptz default now() not null
);

create index on group_messages (group_id, created_at desc);

alter table group_messages enable row level security;

create policy "members can read group messages"
  on group_messages for select
  using (
    exists (
      select 1 from group_members
      where group_members.group_id = group_messages.group_id
        and group_members.user_id  = auth.uid()
    )
  );

create policy "members can send group messages"
  on group_messages for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from group_members
      where group_members.group_id = group_messages.group_id
        and group_members.user_id  = auth.uid()
    )
  );
