import { uiPoolDataProviderV3Abi } from '@neverland-money/contract-types';
import { getNumber, isAddress } from 'ethers';
import { AbiBaseService } from '../commons/base-service';
import type { ReservesHelperInput, UserReservesHelperInput } from '../commons/read-types';
import type {
  EModeCategoryHumanized,
  EModeData,
  EmodeDataHumanized,
  PoolBaseCurrencyHumanized,
  ReserveDataHumanized,
  ReservesData,
  ReservesDataHumanized,
  UiPoolDataProviderContext,
  UserReserveData,
  UserReserveDataHumanized,
} from './types';
export type * from './types';
const EMODE_BITMAP_BITS = 256;

/** Reserve fields that carry lending-core 1.1 embedded E-mode membership. */
export type EModeReserveFields = Pick<
  ReserveDataHumanized,
  | 'originalId'
  | 'borrowingEnabled'
  | 'eModeCategoryId'
  | 'eModeLtv'
  | 'eModeLiquidationThreshold'
  | 'eModeLiquidationBonus'
  | 'eModeLabel'
>;

/**
 * Rebuild lending-core 1.1 embedded E-mode categories as the bitmap data the math-utils formatters
 * read. GenericLogic applies a category's LTV and liquidation threshold to every member collateral,
 * even one with a zero base LTV, so collateral membership follows eModeCategoryId alone; borrowing in
 * E-mode also needs borrowingEnabled. Category price sources are not represented: for a category with
 * one, pass legacyEMode with its price to formatUserSummary.
 */
export function synthesizeEModesFromReserves(
  reserves: readonly EModeReserveFields[],
): EmodeDataHumanized[] {
  const categories = new Map<
    number,
    {
      eMode: Omit<EModeCategoryHumanized, 'collateralBitmap' | 'borrowableBitmap'>;
      collateral: string[];
      borrowable: string[];
    }
  >();
  for (const reserve of reserves) {
    if (reserve.eModeCategoryId === 0) continue;
    if (
      !Number.isSafeInteger(reserve.originalId) ||
      reserve.originalId < 0 ||
      reserve.originalId >= EMODE_BITMAP_BITS
    ) {
      throw new RangeError(`Reserve id ${reserve.originalId} is outside the E-mode bitmap`);
    }

    let category = categories.get(reserve.eModeCategoryId);
    if (!category) {
      category = {
        eMode: {
          ltv: String(reserve.eModeLtv),
          liquidationThreshold: String(reserve.eModeLiquidationThreshold),
          liquidationBonus: String(reserve.eModeLiquidationBonus),
          label: reserve.eModeLabel,
        },
        collateral: Array<string>(EMODE_BITMAP_BITS).fill('0'),
        borrowable: Array<string>(EMODE_BITMAP_BITS).fill('0'),
      };
      categories.set(reserve.eModeCategoryId, category);
    }

    // Bit i of a bitmap is character (length - i - 1) of its binary string.
    const index = EMODE_BITMAP_BITS - reserve.originalId - 1;
    category.collateral[index] = '1';
    if (reserve.borrowingEnabled) category.borrowable[index] = '1';
  }

  return [...categories.entries()]
    .sort(([left], [right]) => left - right)
    .map(([id, { eMode, collateral, borrowable }]) => ({
      id,
      eMode: {
        ...eMode,
        collateralBitmap: collateral.join(''),
        borrowableBitmap: borrowable.join(''),
      },
    }));
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface UiPoolDataProviderInterface {
  getReservesList: (args: ReservesHelperInput) => Promise<string[]>;
  getReservesData: (args: ReservesHelperInput) => Promise<ReservesData>;
  getUserReservesData: (args: UserReservesHelperInput) => Promise<UserReserveData>;
  getReservesHumanized: (args: ReservesHelperInput) => Promise<ReservesDataHumanized>;
  getUserReservesHumanized: (args: UserReservesHelperInput) => Promise<{
    userReserves: UserReserveDataHumanized[];
    userEmodeCategoryId: number;
  }>;
  getEModes: (args: ReservesHelperInput) => Promise<EModeData[]>;
  getEModesHumanized: (args: ReservesHelperInput) => Promise<EmodeDataHumanized[]>;
}

/** Active Neverland lending 1.1 UI decoder, including stable-debt and embedded E-mode fields. */
export class UiPoolDataProvider
  extends AbiBaseService<typeof uiPoolDataProviderV3Abi>
  implements UiPoolDataProviderInterface
{
  private readonly chainId: number;
  /**
   * Constructor
   * @param context The ui pool data provider context
   */
  public constructor(context: UiPoolDataProviderContext) {
    super(context.provider, uiPoolDataProviderV3Abi, context.uiPoolDataProviderAddress);
    if (!isAddress(context.uiPoolDataProviderAddress)) {
      throw new Error('contract address is not valid');
    }

    this.chainId = context.chainId;
  }

  /**
   * Get the underlying asset address for each lending pool reserve
   */
  public async getReservesList({
    lendingPoolAddressProvider,
  }: ReservesHelperInput): Promise<string[]> {
    if (!isAddress(lendingPoolAddressProvider)) {
      throw new Error('Lending pool address is not valid');
    }

    return [
      ...(await this.readContract(this.defaultAddress!, 'getReservesList', [
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- ABI address/hex typing preserves the public string API; ethers retains the existing runtime encoding and address validation.
        lendingPoolAddressProvider as `0x${string}`,
      ])),
    ];
  }

  /**
   * Get data for each lending pool reserve
   */
  public async getReservesData({
    lendingPoolAddressProvider,
  }: ReservesHelperInput): Promise<ReservesData> {
    if (!isAddress(lendingPoolAddressProvider)) {
      throw new Error('Lending pool address is not valid');
    }

    return this.readContract(this.defaultAddress!, 'getReservesData', [
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- ABI address/hex typing preserves the public string API; ethers retains the existing runtime encoding and address validation.
      lendingPoolAddressProvider as `0x${string}`,
    ]);
  }

  /**
   * Get data for each user reserve on the lending pool
   */
  public async getUserReservesData({
    lendingPoolAddressProvider,
    user,
  }: UserReservesHelperInput): Promise<UserReserveData> {
    if (!isAddress(lendingPoolAddressProvider)) {
      throw new Error('Lending pool address is not valid');
    }

    if (!isAddress(user)) {
      throw new Error('User address is not a valid ethereum address');
    }

    return this.readContract(this.defaultAddress!, 'getUserReservesData', [
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- ABI address/hex typing preserves the public string API; ethers retains the existing runtime encoding and address validation.
      lendingPoolAddressProvider as `0x${string}`,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- ABI address/hex typing preserves the public string API; ethers retains the existing runtime encoding and address validation.
      user as `0x${string}`,
    ]);
  }

  public async getReservesHumanized({
    lendingPoolAddressProvider,
  }: ReservesHelperInput): Promise<ReservesDataHumanized> {
    const { 0: reservesRaw, 1: poolBaseCurrencyRaw }: ReservesData = await this.getReservesData({
      lendingPoolAddressProvider,
    });

    const reservesData: ReserveDataHumanized[] = reservesRaw.map((reserveRaw, index) => ({
      originalId: index,
      id: `${this.chainId}-${reserveRaw.underlyingAsset}-${lendingPoolAddressProvider}`.toLowerCase(),
      underlyingAsset: reserveRaw.underlyingAsset.toLowerCase(),
      name: reserveRaw.name,
      symbol: reserveRaw.symbol,
      decimals: getNumber(reserveRaw.decimals),
      baseLTVasCollateral: reserveRaw.baseLTVasCollateral.toString(),
      reserveLiquidationThreshold: reserveRaw.reserveLiquidationThreshold.toString(),
      reserveLiquidationBonus: reserveRaw.reserveLiquidationBonus.toString(),
      reserveFactor: reserveRaw.reserveFactor.toString(),
      usageAsCollateralEnabled: reserveRaw.usageAsCollateralEnabled,
      borrowingEnabled: reserveRaw.borrowingEnabled,
      stableBorrowRateEnabled: reserveRaw.stableBorrowRateEnabled,
      isActive: reserveRaw.isActive,
      isFrozen: reserveRaw.isFrozen,
      liquidityIndex: reserveRaw.liquidityIndex.toString(),
      variableBorrowIndex: reserveRaw.variableBorrowIndex.toString(),
      liquidityRate: reserveRaw.liquidityRate.toString(),
      variableBorrowRate: reserveRaw.variableBorrowRate.toString(),
      stableBorrowRate: reserveRaw.stableBorrowRate.toString(),
      lastUpdateTimestamp: getNumber(reserveRaw.lastUpdateTimestamp),
      aTokenAddress: reserveRaw.aTokenAddress.toString(),
      stableDebtTokenAddress: reserveRaw.stableDebtTokenAddress.toString(),
      variableDebtTokenAddress: reserveRaw.variableDebtTokenAddress.toString(),
      interestRateStrategyAddress: reserveRaw.interestRateStrategyAddress.toString(),
      availableLiquidity: reserveRaw.availableLiquidity.toString(),
      totalPrincipalStableDebt: reserveRaw.totalPrincipalStableDebt.toString(),
      averageStableRate: reserveRaw.averageStableRate.toString(),
      stableDebtLastUpdateTimestamp: getNumber(reserveRaw.stableDebtLastUpdateTimestamp),
      totalScaledVariableDebt: reserveRaw.totalScaledVariableDebt.toString(),
      priceInMarketReferenceCurrency: reserveRaw.priceInMarketReferenceCurrency.toString(),
      priceOracle: reserveRaw.priceOracle,
      variableRateSlope1: reserveRaw.variableRateSlope1.toString(),
      variableRateSlope2: reserveRaw.variableRateSlope2.toString(),
      stableRateSlope1: reserveRaw.stableRateSlope1.toString(),
      stableRateSlope2: reserveRaw.stableRateSlope2.toString(),
      baseStableBorrowRate: reserveRaw.baseStableBorrowRate.toString(),
      baseVariableBorrowRate: reserveRaw.baseVariableBorrowRate.toString(),
      optimalUsageRatio: reserveRaw.optimalUsageRatio.toString(),
      // new fields
      isPaused: reserveRaw.isPaused,
      debtCeiling: reserveRaw.debtCeiling.toString(),
      eModeCategoryId: getNumber(reserveRaw.eModeCategoryId),
      borrowCap: reserveRaw.borrowCap.toString(),
      supplyCap: reserveRaw.supplyCap.toString(),
      eModeLtv: getNumber(reserveRaw.eModeLtv),
      eModeLiquidationThreshold: getNumber(reserveRaw.eModeLiquidationThreshold),
      eModeLiquidationBonus: getNumber(reserveRaw.eModeLiquidationBonus),
      eModePriceSource: reserveRaw.eModePriceSource.toString(),
      eModeLabel: reserveRaw.eModeLabel.toString(),
      borrowableInIsolation: reserveRaw.borrowableInIsolation,
      accruedToTreasury: reserveRaw.accruedToTreasury.toString(),
      unbacked: reserveRaw.unbacked.toString(),
      isolationModeTotalDebt: reserveRaw.isolationModeTotalDebt.toString(),
      debtCeilingDecimals: getNumber(reserveRaw.debtCeilingDecimals),
      isSiloedBorrowing: reserveRaw.isSiloedBorrowing,
      flashLoanEnabled: reserveRaw.flashLoanEnabled,
      virtualAccActive: false,
      virtualUnderlyingBalance: '0',
    }));

    const baseCurrencyData: PoolBaseCurrencyHumanized = {
      // this is to get the decimals from the unit so 1e18 = string length of 19 - 1 to get the number of 0
      marketReferenceCurrencyDecimals:
        poolBaseCurrencyRaw.marketReferenceCurrencyUnit.toString().length - 1,
      marketReferenceCurrencyPriceInUsd:
        poolBaseCurrencyRaw.marketReferenceCurrencyPriceInUsd.toString(),
      networkBaseTokenPriceInUsd: poolBaseCurrencyRaw.networkBaseTokenPriceInUsd.toString(),
      networkBaseTokenPriceDecimals: getNumber(poolBaseCurrencyRaw.networkBaseTokenPriceDecimals),
    };

    return {
      reservesData,
      baseCurrencyData,
    };
  }

  public async getUserReservesHumanized({
    lendingPoolAddressProvider,
    user,
  }: UserReservesHelperInput): Promise<{
    userReserves: UserReserveDataHumanized[];
    userEmodeCategoryId: number;
  }> {
    const { 0: userReservesRaw, 1: userEmodeCategoryId }: UserReserveData =
      await this.getUserReservesData({ lendingPoolAddressProvider, user });

    return {
      userReserves: userReservesRaw.map(userReserveRaw => ({
        id: `${this.chainId}-${user}-${userReserveRaw.underlyingAsset}-${lendingPoolAddressProvider}`.toLowerCase(),
        underlyingAsset: userReserveRaw.underlyingAsset.toLowerCase(),
        scaledATokenBalance: userReserveRaw.scaledATokenBalance.toString(),
        usageAsCollateralEnabledOnUser: userReserveRaw.usageAsCollateralEnabledOnUser,
        scaledVariableDebt: userReserveRaw.scaledVariableDebt.toString(),
      })),
      userEmodeCategoryId: getNumber(userEmodeCategoryId),
    };
  }

  /** E-mode categories rebuilt from the reserves' embedded category fields; see synthesizeEModesFromReserves. */
  public async getEModes({
    lendingPoolAddressProvider,
  }: ReservesHelperInput): Promise<EModeData[]> {
    const eModes = await this.getEModesHumanized({ lendingPoolAddressProvider });
    return eModes.map(({ id, eMode }) => ({
      id,
      eMode: {
        ltv: Number(eMode.ltv),
        liquidationThreshold: Number(eMode.liquidationThreshold),
        liquidationBonus: Number(eMode.liquidationBonus),
        collateralBitmap: BigInt(`0b${eMode.collateralBitmap}`),
        label: eMode.label,
        borrowableBitmap: BigInt(`0b${eMode.borrowableBitmap}`),
      },
    }));
  }

  /** E-mode categories rebuilt from the reserves' embedded category fields; see synthesizeEModesFromReserves. */
  public async getEModesHumanized({
    lendingPoolAddressProvider,
  }: ReservesHelperInput): Promise<EmodeDataHumanized[]> {
    if (!isAddress(lendingPoolAddressProvider)) {
      throw new Error('Lending pool address is not valid');
    }

    const { reservesData } = await this.getReservesHumanized({ lendingPoolAddressProvider });
    return synthesizeEModesFromReserves(reservesData);
  }
}
