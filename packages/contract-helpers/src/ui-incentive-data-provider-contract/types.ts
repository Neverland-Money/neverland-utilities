import type { uiIncentiveDataProviderV3Abi } from '@neverland-money/contract-types';
import type { Provider } from 'ethers';
import type { AbiReadOutputs } from '../commons/base-service';
import type {
  LendingIncentiveDataHumanized,
  ReservesIncentiveDataHumanized,
  UserIncentiveDataHumanized,
  UserReservesIncentivesDataHumanized,
} from '../commons/incentive-types';

export type UiIncentiveDataProviderContext = {
  uiIncentiveDataProviderAddress: string;
  provider: Provider;
  chainId: number;
};
export type ReservesIncentiveData = AbiReadOutputs<
  typeof uiIncentiveDataProviderV3Abi,
  'getReservesIncentivesData'
>[0];
export type UserReservesIncentiveData = AbiReadOutputs<
  typeof uiIncentiveDataProviderV3Abi,
  'getUserReservesIncentivesData'
>[0];
export type FullReservesIncentiveData = AbiReadOutputs<
  typeof uiIncentiveDataProviderV3Abi,
  'getFullReservesIncentiveData'
>;
/** The lending 1.1 ABI includes stable debt alongside a-token and variable-debt incentives. */
export type StableReservesIncentiveDataHumanized = ReservesIncentiveDataHumanized & {
  sIncentiveData: LendingIncentiveDataHumanized;
};
export type StableUserReservesIncentivesDataHumanized = UserReservesIncentivesDataHumanized & {
  sTokenIncentivesUserData: UserIncentiveDataHumanized;
};
