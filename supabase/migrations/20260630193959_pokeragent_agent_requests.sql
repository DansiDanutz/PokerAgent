-- Governance: agent status is request -> admin-approval (players cannot
-- self-promote or be promoted by other agents).
alter table pa_profiles add column agent_request text not null default 'none';
alter table pa_profiles add constraint pa_profiles_agent_request_check
  check (agent_request in ('none', 'pending', 'rejected'));
