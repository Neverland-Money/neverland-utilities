import { ethers } from 'ethers';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import * as contractTypes from '../index';
interface AbiItem {
  type: string;
}
const files = readdirSync(__dirname)
  .filter(file => file.endsWith('.json'))
  .sort();
const readAbi = (file: string): AbiItem[] =>
  JSON.parse(readFileSync(join(__dirname, file), 'utf8')) as AbiItem[];
describe('contract-types ABIs', () => {
  it('exposes the complete public contract catalog from the package entrypoint', () => {
    expect(Object.keys(contractTypes).sort()).toEqual(
      [
        'dustLockAbi',
        'erc20Abi',
        'wethGatewayLegacyAbi',
        'neverlandDustHelperAbi',
        'neverlandUiProviderAbi',
        'revenueRewardAbi',
        'multicall3Abi',
        'dustLockTransferStrategyAbi',
        'dustRewardsControllerAbi',
        'poolAbi',
        'aTokenAbi',
        'aaveOracleAbi',
        'aaveProtocolDataProviderAbi',
        'aclManagerAbi',
        'defaultReserveInterestRateStrategyAbi',
        'dustAbi',
        'dustLockLegendaryLedgerAbi',
        'dustLockLegendaryGatewayAbi',
        'epochManagerAbi',
        'erc4626Abi',
        'governedPriceOracleAbi',
        'hardcodedPriceOracleAbi',
        'leaderboardConfigAbi',
        'leaderboardKeeperAbi',
        'marketHoursPriceAdapterAbi',
        'marketHoursSentinelAbi',
        'nftPartnershipRegistryAbi',
        'neverlandAssetRedemptionAbi',
        'neverlandNativeGatewayAbi',
        'neverlandPendleLeveragerAbi',
        'neverlandPendleMaturityGatewayAbi',
        'neverlandProfileItemsSellerAbi',
        'neverlandTimelockControllerAbi',
        'pendlePtDiscountOracleAdapterAbi',
        'poolAddressesProviderAbi',
        'poolAddressesProviderRegistryAbi',
        'poolConfiguratorAbi',
        'ratioOracleAggregatorAbi',
        'sessionCalendarAbi',
        'specialEditionRegistryAbi',
        'stableDebtTokenAbi',
        'stataOracleAbi',
        'staticATokenAbi',
        'staticATokenFactoryAbi',
        'staticATokenLMAbi',
        'uiIncentiveDataProviderV3Abi',
        'uiPoolDataProviderV3Abi',
        'userVaultAbi',
        'userVaultFactoryAbi',
        'userVaultRegistryAbi',
        'variableDebtTokenAbi',
        'votingPowerMultiplierAbi',
        'walletBalanceProviderAbi',
        'wrappedTokenGatewayV3Abi',
        'yieldBearingOracleAdapterAbi',
      ].sort(),
    );
  });
  it('finds the ABI files', () => {
    expect(files.length).toBeGreaterThan(0);
  });
  it('includes ERC20 share-token methods in the standard ERC4626 interface', () => {
    const iface = new ethers.Interface(JSON.stringify(contractTypes.erc4626Abi));
    expect(iface.getFunction('balanceOf')!.format()).toBe('balanceOf(address)');
    expect(iface.getFunction('approve')!.format()).toBe('approve(address,uint256)');
    expect(iface.getFunction('deposit')!.format()).toBe('deposit(uint256,address)');
  });
  it.each(files)('exports %s from the package entry unchanged', file => {
    const name = file.replace(/\.json$/, '');
    expect((contractTypes as unknown as Record<string, unknown>)[name]).toEqual(readAbi(file));
  });
  it.each(files)('parses %s with no duplicate signatures', file => {
    const abi = readAbi(file);
    const iface = new ethers.Interface(abi);
    const declared = abi.filter(item => ['error', 'event', 'function'].includes(item.type)).length;
    // ethers keeps only the first fragment for a repeated signature, so a duplicate shows up as a
    // shortfall here.
    let parsed = 0;
    iface.forEachError(() => parsed++);
    iface.forEachEvent(() => parsed++);
    iface.forEachFunction(() => parsed++);
    expect(parsed).toBe(declared);
  });
});
