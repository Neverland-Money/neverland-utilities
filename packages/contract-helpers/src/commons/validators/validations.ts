import { isAddress, ZeroAddress } from 'ethers';

//
// import 'reflect-metadata';
import {
  getValidationMetadata,
  is0OrPositiveMetadataKey,
  isEthAddressMetadataKey,
  isPositiveMetadataKey,
  isPositiveOrMinusOneMetadataKey,
  // optionalMetadataKey,
  type paramsType,
} from './param-validators';

/** Lending inputs never target address(0); the Pool would otherwise credit it irrecoverably. */
function assertNotZeroAddress(value: unknown): void {
  if (typeof value === 'string' && value.toLowerCase() === ZeroAddress) {
    throw new Error(`Address: ${value} must not be the zero address`);
  }
}

export function isEthAddressValidator(
  target: any,
  propertyName: string,
  methodArguments: any,
  isParamOptional?: boolean[],
): void {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- The public legacy method argument vector is forwarded unchanged; this local view preserves exact indexing, getter order, coercions and invalid-vector errors.
  const args: Record<number, unknown> & { 0: Record<string, unknown> } = methodArguments;
  const addressParameters: paramsType[] | undefined = getValidationMetadata(
    isEthAddressMetadataKey,
    target,
    propertyName,
  );

  if (addressParameters) {
    addressParameters.forEach(storedParams => {
      if (storedParams.field) {
        if (args[0][storedParams.field] && !isAddress(args[0][storedParams.field])) {
          throw new Error(
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- Legacy validators interpolate invalid inputs with JavaScript template coercion; preserve their exact diagnostic values and coercion errors.
            `Address: ${args[0][storedParams.field]} is not a valid ethereum Address`,
          );
        }

        assertNotZeroAddress(args[0][storedParams.field]);
      } else {
        const isOptional = isParamOptional?.[storedParams.index];
        if (args[storedParams.index] && !isOptional && !isAddress(args[storedParams.index])) {
          throw new Error(
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- Legacy validators interpolate invalid inputs with JavaScript template coercion; preserve their exact diagnostic values and coercion errors.
            `Address: ${args[storedParams.index]} is not a valid ethereum Address`,
          );
        }

        if (!isOptional) assertNotZeroAddress(args[storedParams.index]);
      }
    });
  }
}

export function amountGtThan0Validator(
  target: any,
  propertyName: string,
  methodArguments: any,
  isParamOptional?: boolean[],
): void {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- The public legacy method argument vector is forwarded unchanged; this local view preserves exact indexing, getter order, coercions and invalid-vector errors.
  const args: Record<number, unknown> & { 0: Record<string, unknown> } = methodArguments;
  const amountParameters: paramsType[] | undefined = getValidationMetadata(
    isPositiveMetadataKey,
    target,
    propertyName,
  );

  if (amountParameters) {
    amountParameters.forEach(storedParams => {
      if (storedParams.field) {
        if (args[0][storedParams.field] && !(Number(args[0][storedParams.field]) > 0)) {
          throw new Error(
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- Legacy validators interpolate invalid inputs with JavaScript template coercion; preserve their exact diagnostic values and coercion errors.
            `Amount: ${args[0][storedParams.field]} needs to be greater than 0`,
          );
        }
      } else {
        const isOptional = isParamOptional?.[storedParams.index];
        if (!isOptional && !(Number(args[storedParams.index]) > 0)) {
          throw new Error(
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- Legacy validators interpolate invalid inputs with JavaScript template coercion; preserve their exact diagnostic values and coercion errors.
            `Amount: ${args[storedParams.index]} needs to be greater than 0`,
          );
        }
      }
    });
  }
}

export function amount0OrPositiveValidator(
  target: any,
  propertyName: string,
  methodArguments: any,
  isParamOptional?: boolean[],
): void {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- The public legacy method argument vector is forwarded unchanged; this local view preserves exact indexing, getter order, coercions and invalid-vector errors.
  const args: Record<number, unknown> & { 0: Record<string, unknown> } = methodArguments;
  const amountParameters: paramsType[] | undefined = getValidationMetadata(
    is0OrPositiveMetadataKey,
    target,
    propertyName,
  );

  if (amountParameters) {
    amountParameters.forEach(storedParams => {
      if (storedParams.field) {
        if (args[0][storedParams.field] && !(Number(args[0][storedParams.field]) >= 0)) {
          throw new Error(
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- Legacy validators interpolate invalid inputs with JavaScript template coercion; preserve their exact diagnostic values and coercion errors.
            `Amount: ${args[0][storedParams.field]} needs to be greater or equal than 0`,
          );
        }
      } else {
        const isOptional = isParamOptional?.[storedParams.index];
        if (!isOptional && !(Number(args[storedParams.index]) >= 0)) {
          throw new Error(
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- Legacy validators interpolate invalid inputs with JavaScript template coercion; preserve their exact diagnostic values and coercion errors.
            `Amount: ${args[storedParams.index]} needs to be greater or equal than 0`,
          );
        }
      }
    });
  }
}

export function amountGtThan0OrMinus1(
  target: any,
  propertyName: string,
  methodArguments: any,
  isParamOptional?: boolean[],
): void {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- The public legacy method argument vector is forwarded unchanged; this local view preserves exact indexing, getter order, coercions and invalid-vector errors.
  const args: Record<number, unknown> & { 0: Record<string, unknown> } = methodArguments;
  const amountMinusOneParameters: paramsType[] | undefined = getValidationMetadata(
    isPositiveOrMinusOneMetadataKey,
    target,
    propertyName,
  );

  if (amountMinusOneParameters) {
    amountMinusOneParameters.forEach(storedParams => {
      if (storedParams.field) {
        if (
          args[0][storedParams.field] &&
          !(Number(args[0][storedParams.field]) > 0 || args[0][storedParams.field] === '-1')
        ) {
          throw new Error(
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- Legacy validators interpolate invalid inputs with JavaScript template coercion; preserve their exact diagnostic values and coercion errors.
            `Amount: ${args[0][storedParams.field]} needs to be greater than 0 or -1`,
          );
        }
      } else {
        const isOptional = isParamOptional?.[storedParams.index];
        if (
          !isOptional &&
          !(Number(args[storedParams.index]) > 0 || args[storedParams.index] === '-1')
        ) {
          throw new Error(
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- Legacy validators interpolate invalid inputs with JavaScript template coercion; preserve their exact diagnostic values and coercion errors.
            `Amount: ${args[storedParams.index]} needs to be greater than 0 or -1`,
          );
        }
      }
    });
  }
}
