/* eslint-disable prefer-rest-params -- Legacy decorators pass the original arguments object through validators and apply; retain argument identity and dispatch. */

import { isAddress } from 'ethers';
import { isNativeSentinel, isZeroAddress } from '../address';
import { API_ETH_MOCK_ADDRESS } from '../utils';
import {
  amount0OrPositiveValidator,
  amountGtThan0OrMinus1,
  amountGtThan0Validator,
  // isEthAddressArrayValidatorNotEmpty,
  isEthAddressValidator,
} from './validations';

export function PoolValidator(
  target: any,
  propertyName: string,
  descriptor: TypedPropertyDescriptor<any>,
): any {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Legacy public decorator descriptors use any; decorated values are methods and the original apply/arguments dispatch is retained.
  const method: { apply: (receiver: unknown, args: IArguments) => unknown } = descriptor.value;
  descriptor.value = function (this: { poolAddress: string; wethGatewayAddress: string }) {
    if (!isAddress(this.poolAddress)) {
      console.error(`[PoolValidator] You need to pass valid addresses`);
      return [];
    }

    isEthAddressValidator(target, propertyName, arguments);

    amountGtThan0Validator(target, propertyName, arguments);

    amountGtThan0OrMinus1(target, propertyName, arguments);

    amount0OrPositiveValidator(target, propertyName, arguments);

    return method.apply(this, arguments);
  };
}

export function DebtTokenValidator(
  target: any,
  propertyName: string,
  descriptor: TypedPropertyDescriptor<any>,
): any {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Legacy public decorator descriptors use any; decorated values are methods and the original apply/arguments dispatch is retained.
  const method: { apply: (receiver: unknown, args: IArguments) => unknown } = descriptor.value;
  descriptor.value = function (this: { poolAddress: string; wethGatewayAddress: string }) {
    isEthAddressValidator(target, propertyName, arguments);

    amountGtThan0Validator(target, propertyName, arguments);

    return method.apply(this, arguments);
  };
}

export function ERC20Validator(
  target: any,
  propertyName: string,
  descriptor: TypedPropertyDescriptor<any>,
): any {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Legacy public decorator descriptors use any; decorated values are methods and the original apply/arguments dispatch is retained.
  const method: { apply: (receiver: unknown, args: IArguments) => unknown } = descriptor.value;
  descriptor.value = function (this: { poolAddress: string; wethGatewayAddress: string }) {
    isEthAddressValidator(target, propertyName, arguments);

    amountGtThan0Validator(target, propertyName, arguments);

    amountGtThan0OrMinus1(target, propertyName, arguments);

    return method.apply(this, arguments);
  };
}

export function WETHValidator(
  target: any,
  propertyName: string,
  descriptor: TypedPropertyDescriptor<any>,
): any {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Legacy public decorator descriptors use any; decorated values are methods and the original apply/arguments dispatch is retained.
  const method: { apply: (receiver: unknown, args: IArguments) => unknown } = descriptor.value;
  descriptor.value = function (this: { poolAddress: string; wethGatewayAddress: string }) {
    // Any spelling of zero throws; an unset or malformed gateway keeps the upstream [] result.
    if (isZeroAddress(this.wethGatewayAddress)) {
      throw new TypeError('WETH_GATEWAY must not be the zero address');
    }

    if (isNativeSentinel(this.wethGatewayAddress)) {
      throw new TypeError(`WETH_GATEWAY must not be the native sentinel ${API_ETH_MOCK_ADDRESS}`);
    }

    if (!isAddress(this.wethGatewayAddress)) {
      console.error(`[WethGatewayValidator] You need to pass valid addresses`);
      return [];
    }

    isEthAddressValidator(target, propertyName, arguments);

    amountGtThan0Validator(target, propertyName, arguments);

    amountGtThan0OrMinus1(target, propertyName, arguments);

    amount0OrPositiveValidator(target, propertyName, arguments);

    return method.apply(this, arguments);
  };
}
