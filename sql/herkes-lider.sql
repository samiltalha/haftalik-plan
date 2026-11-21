-- Ekipteki herkesi ekip lideri yap
-- Supabase > SQL Editor'a yapıştırıp "Run" deyin. ("guncelleme.sql"den SONRA çalıştırın.)
update public.profiles set is_leader = true where is_member;

select p.full_name as ad, u.email as eposta, p.is_leader as lider
from public.profiles p join auth.users u on u.id = p.id
where p.is_member order by p.full_name;
