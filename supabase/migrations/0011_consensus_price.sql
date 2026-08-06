-- 컨센서스에 현재가·상승여력 추가. 소스: Naver 금융(키 X)
alter table public.consensus add column if not exists current_price numeric;
alter table public.consensus add column if not exists upside numeric;   -- 목표주가/현재가 - 1 (%)
create index if not exists idx_consensus_upside on public.consensus (upside desc);
