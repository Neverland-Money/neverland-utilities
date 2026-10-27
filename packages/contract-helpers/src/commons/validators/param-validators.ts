import 'reflect-metadata';

export const isEthAddressMetadataKey = Symbol('ethAddress');
export const isPositiveMetadataKey = Symbol('isPositive');
export const isPositiveOrMinusOneMetadataKey = Symbol('isPositiveOrMinusOne');
export const is0OrPositiveMetadataKey = Symbol('is0OrPositiveMetadataKey');

export type paramsType = {
  index: number;
  field: string | undefined;
};

export function isEthAddress(field?: string) {
  return function (target: any, propertyKey: string | symbol, parameterIndex: number): void {
    const existingPossibleAddresses: paramsType[] =
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Keep the historical fallback for every falsy reflected metadata value, including false, zero and empty string.
      getValidationMetadata(isEthAddressMetadataKey, target, propertyKey) || [];

    existingPossibleAddresses.push({
      index: parameterIndex,
      field,
    });

    setValidationMetadata(isEthAddressMetadataKey, existingPossibleAddresses, target, propertyKey);
  };
}

export function isPositiveAmount(field?: string) {
  return function (target: any, propertyKey: string | symbol, parameterIndex: number): void {
    const params: paramsType[] =
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Keep the historical fallback for every falsy reflected metadata value, including false, zero and empty string.
      getValidationMetadata(isPositiveMetadataKey, target, propertyKey) || [];

    params.push({ index: parameterIndex, field });

    setValidationMetadata(isPositiveMetadataKey, params, target, propertyKey);
  };
}

export function is0OrPositiveAmount(field?: string) {
  return function (target: any, propertyKey: string | symbol, parameterIndex: number): void {
    const params: paramsType[] =
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Keep the historical fallback for every falsy reflected metadata value, including false, zero and empty string.
      getValidationMetadata(is0OrPositiveMetadataKey, target, propertyKey) || [];

    params.push({ index: parameterIndex, field });

    setValidationMetadata(is0OrPositiveMetadataKey, params, target, propertyKey);
  };
}

export function isPositiveOrMinusOneAmount(field?: string) {
  return function (target: any, propertyKey: string | symbol, parameterIndex: number): void {
    const params: paramsType[] =
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Keep the historical fallback for every falsy reflected metadata value, including false, zero and empty string.
      getValidationMetadata(isPositiveOrMinusOneMetadataKey, target, propertyKey) || [];

    params.push({ index: parameterIndex, field });

    setValidationMetadata(isPositiveOrMinusOneMetadataKey, params, target, propertyKey);
  };
}

// export function optional(
//   target: any,
//   propertyKey: string | symbol,
//   parameterIndex: number,
// ): void {
//   const existingOptionalParameters =
//     getValidationMetadata(optionalMetadataKey, target, propertyKey) || [];
//   existingOptionalParameters.push(parameterIndex);
//   setValidationMetadata(
//     optionalMetadataKey,
//     existingOptionalParameters,
//     target,
//     propertyKey,
//   );
// }

/** The public decorators keep their legacy signatures; metadata belongs to these parameter decorators. */
export function getValidationMetadata(
  key: symbol,
  target: unknown,
  propertyKey: string | symbol,
): paramsType[] | undefined {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- reflect-metadata is untyped; these private keys store the parameter records declared above, and Reflect retains its original invalid-target errors.
  return Reflect.getOwnMetadata(key, target as object, propertyKey) as paramsType[] | undefined;
}

function setValidationMetadata(
  key: symbol,
  params: paramsType[],
  target: unknown,
  propertyKey: string | symbol,
): void {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Decorators receive class/prototype targets; this type-only view preserves Reflect's original validation and errors.
  Reflect.defineMetadata(key, params, target as object, propertyKey);
}
