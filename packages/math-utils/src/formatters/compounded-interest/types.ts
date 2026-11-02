import { type BigNumberValue } from '../../bignumber';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface CalculateCompoundedRateRequest {
  rate: BigNumberValue;
  duration: BigNumberValue;
}
