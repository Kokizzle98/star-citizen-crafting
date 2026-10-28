-- Run once in Supabase SQL Editor BEFORE using v1.2 inventory entry.
alter table public.inventory add column if not exists amount_micro_scu bigint;
alter table public.inventory add column if not exists input_unit text;
update public.inventory set amount_micro_scu = round(amount * 1000000)::bigint where amount_micro_scu is null;
alter table public.inventory alter column amount_micro_scu set not null;
alter table public.inventory add constraint inventory_amount_micro_scu_positive check (amount_micro_scu > 0) not valid;
alter table public.inventory validate constraint inventory_amount_micro_scu_positive;
create index if not exists inventory_material_quality_idx on public.inventory(material, quality desc);
