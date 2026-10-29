import { composeAuditActions, validateAuditMetadata } from './audit-registry';

describe('extension audit registry', () => {
  const core = { 'billing.portal.created': { metadata: ['provider'] } };
  const extension = { 'document.shared': { metadata: ['name', 'roles'], stringListMetadata: ['roles'] } };
  const actions = composeAuditActions(core, extension);
  it('preserves core allowlists and accepts only explicitly declared string lists', () => {
    expect(() => validateAuditMetadata(actions, 'document.shared', { name: 'guide', roles: ['reader'] })).not.toThrow();
    expect(() => validateAuditMetadata(actions, 'billing.portal.created', { provider: ['stripe'] })).toThrow('scalar');
    expect(() => validateAuditMetadata(actions, 'document.shared', { name: ['guide'] })).toThrow('scalar');
    expect(() => validateAuditMetadata(actions, 'document.shared', { roles: ['reader', 1] as never })).toThrow('scalar');
    expect(() => validateAuditMetadata(actions, 'document.shared', { name: { secret: 'hidden' } as never })).toThrow('scalar');
    expect(() => validateAuditMetadata(actions, 'document.shared', { name: Number.NaN })).toThrow('scalar');
    expect(() => validateAuditMetadata(actions, 'document.shared', { token: 'secret' })).toThrow('not allowed');
    expect(() => validateAuditMetadata(actions, 'unknown.action', {})).toThrow('Unknown audit action');
  });
  it('rejects overrides and inconsistent list definitions', () => {
    expect(() => composeAuditActions(core, core)).toThrow('Duplicate audit action');
    expect(() => composeAuditActions({}, { bad: { metadata: [], stringListMetadata: ['secret'] } })).toThrow('Invalid');
  });
});
