-- Beta metrics. READ-ONLY: paste a query into the Supabase SQL editor (it runs as
-- the project owner, so it sees every user — the app itself never can).
--
-- Reuse, not a second system: what they PICKED is decision_sessions.chosen_index
-- and whether they ATE it is meal_feedback.did_eat — both already written by the
-- core loop. product_events only adds what those rows can't say (how a decision
-- started, what failed, what was refused). None of these queries touches text a
-- person typed: that is never stored.
--
-- Proof-step framing (PRODUCT.md): the number that matters is "ate one of the
-- three", not opens or time in app.

-- 1. The core loop, per day: requests that produced cards → picked → ate.
select
  s.created_at::date                                           as day,
  count(*)                                                     as requests_with_cards,
  count(*) filter (where s.chosen_index is not null)           as picked,
  count(f.id) filter (where f.did_eat is true)                 as ate_it,
  count(f.id) filter (where f.did_eat is false)                as did_not_eat,
  round(100.0 * count(*) filter (where s.chosen_index is not null) / nullif(count(*), 0), 0) as pct_picked,
  round(100.0 * count(f.id) filter (where f.did_eat is true) / nullif(count(*) filter (where s.chosen_index is not null), 0), 0) as pct_of_picks_eaten
from public.decision_sessions s
left join public.meal_feedback f on f.session_id = s.id
group by 1
order by 1 desc;

-- 2. Active people per week, and how many came back (2+ distinct days).
select
  week,
  count(*)                              as people,
  count(*) filter (where days >= 2)     as came_back_2plus_days
from (
  select user_id, date_trunc('week', created_at)::date as week, count(distinct created_at::date) as days
  from public.decision_sessions
  group by 1, 2
) per_person
group by 1
order by 1 desc;

-- 3. How decisions start, and whether they work (sentence vs step by step vs "Last time").
select
  coalesce(props ->> 'entry', 'unknown')                        as entry,
  props ->> 'mode'                                              as mode,
  count(*)                                                      as requests,
  count(*) filter (where (props ->> 'ok')::boolean)             as ok,
  round(avg((props ->> 'ms')::int) filter (where (props ->> 'ok')::boolean)) as avg_ms_when_ok
from public.product_events
where name = 'recommend_done'
group by 1, 2
order by requests desc;

-- 4. Did the sentence get used instead of the questions, and did it get straight to cards?
--    (clarify_shown = the sentence left something out and a short follow-up was needed.)
select
  count(*) filter (where name = 'entry_selected' and props ->> 'entry' = 'sentence') as sentences_sent,
  count(*) filter (where name = 'entry_selected' and props ->> 'entry' = 'steps')    as step_by_step_started,
  count(*) filter (where name = 'entry_selected' and props ->> 'entry' = 'again')    as last_time_used,
  count(*) filter (where name = 'interpret_done' and (props ->> 'ok')::boolean)      as sentences_read_ok,
  count(*) filter (where name = 'interpret_done' and not (props ->> 'ok')::boolean)  as sentences_failed,
  count(*) filter (where name = 'clarify_shown')                                     as needed_a_followup
from public.product_events;

-- 5. What goes wrong: failures by code.
select props ->> 'code' as code, props ->> 'mode' as mode, count(*) as n
from public.product_events
where name = 'recommend_done' and not (props ->> 'ok')::boolean
group by 1, 2
order by n desc;

-- 6. Cost control: who is hitting the daily limits.
select props ->> 'kind' as limit_kind, count(*) as times, count(distinct user_id) as people
from public.product_events
where name = 'limit_hit'
group by 1
order by times desc;

-- 7. Today's allowance use per person (the counters themselves; UTC day).
select user_id, kind, count as used_today
from public.usage_counters
where day = (now() at time zone 'utc')::date
order by count desc
limit 50;

-- ===========================================================================
-- Public beta: feedback, cost guards, the off switch. (Run as the project owner.)
-- ===========================================================================

-- 8. Feedback people sent (newest first). `contact` is only what they chose to type.
select created_at, kind, page, app_version, contact, message
from public.feedback
order by created_at desc
limit 100;

-- 9. The whole app's use of each paid call TODAY (UTC) against its daily ceiling.
--    The ceilings are DEFAULT_GLOBAL_LIMITS in src/lib/usage/limits.ts (or USAGE_GLOBAL_<KIND>).
select kind, count as used_today
from public.global_usage
where day = (now() at time zone 'utc')::date
order by kind;

-- 10. Who used the most today — to spot one account behaving like a script.
--     (Shows user ids, not emails; look an id up in Authentication → Users.)
select user_id, kind, count
from public.usage_counters
where day = (now() at time zone 'utc')::date
order by count desc
limit 20;

-- 11. THE OFF SWITCH. Takes effect on the next request, no redeploy. Run ONE of these by hand:
--       update public.app_flags set value = 'all' where key = 'paused_kinds';                -- stop every paid call
--       update public.app_flags set value = 'recommend,image' where key = 'paused_kinds';   -- stop only these kinds
--       update public.app_flags set value = '' where key = 'paused_kinds';                   -- back on
--     Kinds: recommend, nearby, interpret, enrich, image, place_photo, feedback.
--     While paused, people see "unavailable right now" and nothing is counted against them.
select key, value from public.app_flags;
