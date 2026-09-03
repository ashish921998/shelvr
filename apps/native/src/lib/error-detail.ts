function stringifyDiagnostic(value: unknown): string {
  const seen = new WeakSet<object>();

  try {
    const serialized = JSON.stringify(value, (_key, nestedValue: unknown) => {
      if (typeof nestedValue === 'bigint') return `${nestedValue}n`;

      if (typeof nestedValue === 'object' && nestedValue !== null) {
        if (seen.has(nestedValue)) return '[Circular]';
        seen.add(nestedValue);
      }

      return nestedValue;
    });

    if (serialized !== undefined) return serialized;
  } catch {
    // Fall through to a string representation for values JSON cannot serialize.
  }

  try {
    return String(value);
  } catch {
    return 'Unknown error';
  }
}

export function formatErrorDetail(error: unknown): string {
  if (!(error instanceof Error)) return stringifyDiagnostic(error);

  const errorData = 'data' in error ? error.data : undefined;
  return `${error.name}: ${error.message}${
    errorData ? ` | data=${stringifyDiagnostic(errorData)}` : ''
  }`;
}
