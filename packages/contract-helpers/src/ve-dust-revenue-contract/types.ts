import type { Provider } from 'ethers';
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface VeDustNFTData {
  tokenId: number;
  votingPower: string;
  lockedAmount: string;
  rewardAmount: string;
  rewardAmountUSD: string;
  hasRewards: boolean;
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface VeDustRevenueData {
  totalRevenueUSD: string;
  rewardTokens: string[];
  rewardAmounts: string[];
  selfRepayEnabled: boolean;
  selfRepayTokenIds: number[];
  votingPower: string;
  lockedAmount: string;
  veNftCount: number;
  veNftIds: number[];
  veNftData?: VeDustNFTData[];
  individualNftRewards: Record<number, string[]>;
  individualNftVotingPower: Record<number, string>;
  individualNftLockedAmounts: Record<number, string>;
  individualNftEndTimes: Record<number, number>;
  pendingRewardsUSD: string;
  nextEpochTimestamp: number;
  totalVeDustSupply: string;
  selfRepayVotingPower: string;
  userRevenueShare: string;
  weeklyRevenueUSD: string;
  formattedRevenueUSD: string;
  hasRewards: boolean;
  hasVeNfts: boolean;
  /**
   * Each reward token's ERC20 decimals, aligned with `rewardTokens`. `null` marks a failed read or
   * a value above 36; that token's `individualNftRewards` entries are '0', and a nonzero amount is
   * listed in `unpricedRewardTokens`. Empty when no reward was queried.
   */
  rewardTokenDecimals?: Array<number | null>;
  /**
   * Reward tokens with a nonzero `rewardAmounts` entry that `totalRevenueUSD` leaves out, because
   * they are not USD reward tokens or their decimals are unknown. Also lists a USD reward token
   * that `pendingRewardsUSD` leaves out because its decimals are unreadable. When
   * `usdRewardTokens` is omitted and the reward-token list is incomplete (a failed
   * `rewardTokens(i)` read), no default USD token is selected. In `rewardTokens` order.
   */
  unpricedRewardTokens?: string[];
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface VeDustRevenueHelperContext {
  provider: Provider;
  chainId: number;
  revenueAddress: string;
  dustLockAddress: string;
  /**
   * Reward tokens valued at $1 per whole token in `totalRevenueUSD` and `pendingRewardsUSD`. Omit
   * it to count only the first registered reward token (USDC on Monad), which matches earlier
   * releases while USDC is the only reward token. Pass `[]` to count none.
   */
  usdRewardTokens?: readonly string[];
}
