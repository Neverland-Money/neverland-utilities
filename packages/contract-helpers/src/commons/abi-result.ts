import type { Interface, ParamType } from 'ethers';

/** Copy ABI arrays before inspecting tuple components: tuple arrays are arrays of rows. */
function materializeValue(parameter: ParamType, value: unknown): unknown {
  if (parameter.baseType === 'array') {
    const child = parameter.arrayChildren;
    if (
      !Array.isArray(value) ||
      !child ||
      (parameter.arrayLength !== -1 && value.length !== parameter.arrayLength)
    )
      throw new Error(`Invalid ABI array for ${parameter.name}`);
    return Array.from(value, (item: unknown) => materializeValue(child, item));
  }

  if (parameter.baseType === 'tuple') {
    if (!parameter.components)
      throw new Error(`Missing ABI tuple components for ${parameter.name}`);
    return materializeOutputs(parameter.components, value, parameter.name);
  }

  return value;
}

function materializeOutputs(
  parameters: readonly ParamType[],
  value: unknown,
  context: string,
): unknown {
  if (!Array.isArray(value) || value.length !== parameters.length)
    throw new Error(`Invalid ABI tuple for ${context}`);
  const entries = parameters.map((parameter, index) => [
    parameter.name,
    materializeValue(parameter, value[index]),
  ]);
  return parameters.every(parameter => parameter.name)
    ? Object.fromEntries(entries)
    : entries.map(([, item]) => item);
}

/**
 * Copy an ethers contract-call result into mutable arrays and named records, preserving scalars.
 * Contract calls unwrap a single output; multiple outputs remain an outer Result on input.
 */
export function materializeContractResult(
  iface: Interface,
  method: string,
  value: unknown,
): unknown {
  const fragment = iface.getFunction(method);
  if (!fragment) throw new Error(`Unknown ABI function ${method}`);
  if (fragment.outputs.length === 1) return materializeValue(fragment.outputs[0], value);
  return materializeOutputs(fragment.outputs, value, method);
}
