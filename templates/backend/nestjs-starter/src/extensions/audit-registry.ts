export type AuditValue = string | number | boolean | null | readonly string[];
export type AuditActionDefinition = {
  metadata: readonly string[];
  stringListMetadata?: readonly string[];
};

/** Reject overrides rather than silently broadening an existing action's policy. */
export function composeAuditActions(
  core: Record<string, AuditActionDefinition>,
  extensions: Record<string, AuditActionDefinition>,
): ReadonlyMap<string, AuditActionDefinition> {
  const actions = new Map(Object.entries(core));
  for (const [name, definition] of Object.entries(extensions)) {
    if (actions.has(name)) throw new Error(`Duplicate audit action: ${name}`);
    if (new Set(definition.metadata).size !== definition.metadata.length
      || (definition.stringListMetadata ?? []).some((key) => !definition.metadata.includes(key))) {
      throw new Error(`Invalid audit metadata definition: ${name}`);
    }
    actions.set(name, definition);
  }
  return actions;
}

export function validateAuditMetadata(
  actions: ReadonlyMap<string, AuditActionDefinition>,
  action: string,
  metadata: Record<string, AuditValue>,
): void {
  const definition = actions.get(action);
  if (!definition) throw new Error(`Unknown audit action: ${action}`);
  const unexpected = Object.keys(metadata).filter((key) => !definition.metadata.includes(key));
  if (unexpected.length) throw new Error(`Audit metadata is not allowed for ${action}: ${unexpected.sort().join(', ')}`);
  for (const [key, value] of Object.entries(metadata)) {
    const scalar = value === null || typeof value === 'string' || typeof value === 'boolean'
      || (typeof value === 'number' && Number.isFinite(value));
    const list = definition.stringListMetadata?.includes(key) && Array.isArray(value)
      && value.every((item: unknown) => typeof item === 'string');
    if (!scalar && !list) throw new Error('Audit metadata values must be scalar or an explicitly allowed string list.');
  }
}
