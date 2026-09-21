-- Cover new foreign-key lookups identified by the hosted performance advisor.
-- Empty pre-launch tables; no data changes or permission changes.
create index account_closures_policy_idx on private.account_closures(policy_kind,disclosure_version);
create index campaign_awards_rule_idx on public.campaign_awards(campaign_id,campaign_version);
create index reward_rules_catalog_idx on public.reward_rules(reward_kind,reward_id);
