import type { AppWallet } from "../../domain/users/types";

export const HYPERLIQUID_INFO_METHODS = [
  "activeAssetData",
  "alignedQuoteTokenInfo",
  "allBorrowLendReserveStates",
  "allMids",
  "allPerpMetas",
  "approvedBuilders",
  "blockDetails",
  "borrowLendReserveState",
  "borrowLendUserState",
  "candleSnapshot",
  "clearinghouseState",
  "delegations",
  "delegatorHistory",
  "delegatorRewards",
  "delegatorSummary",
  "exchangeStatus",
  "extraAgents",
  "frontendOpenOrders",
  "fundingHistory",
  "gossipRootIps",
  "historicalOrders",
  "isVip",
  "l2Book",
  "leadingVaults",
  "legalCheck",
  "liquidatable",
  "marginTable",
  "maxBuilderFee",
  "maxMarketOrderNtls",
  "meta",
  "metaAndAssetCtxs",
  "openOrders",
  "orderStatus",
  "outcomeMeta",
  "perpAnnotation",
  "perpCategories",
  "perpDeployAuctionStatus",
  "perpDexLimits",
  "perpDexStatus",
  "perpDexs",
  "perpsAtOpenInterestCap",
  "portfolio",
  "preTransferCheck",
  "predictedFundings",
  "recentTrades",
  "referral",
  "spotClearinghouseState",
  "spotDeployState",
  "spotMeta",
  "spotMetaAndAssetCtxs",
  "spotPairDeployAuctionStatus",
  "subAccounts",
  "subAccounts2",
  "tokenDetails",
  "twapHistory",
  "txDetails",
  "userAbstraction",
  "userBorrowLendInterest",
  "userDetails",
  "userDexAbstraction",
  "userFees",
  "userFills",
  "userFillsByTime",
  "userFunding",
  "userNonFundingLedgerUpdates",
  "userRateLimit",
  "userRole",
  "userToMultiSigSigners",
  "userTwapSliceFills",
  "userTwapSliceFillsByTime",
  "userVaultEquities",
  "validatorL1Votes",
  "validatorSummaries",
  "vaultDetails",
  "vaultSummaries",
  "webData2",
] as const;

export type HyperliquidInfoMethod = (typeof HYPERLIQUID_INFO_METHODS)[number];

export const HYPERLIQUID_EXCHANGE_ACTIONS = [
  "agentEnableDexAbstraction",
  "agentSetAbstraction",
  "approveAgent",
  "approveBuilderFee",
  "batchModify",
  "borrowLend",
  "cDeposit",
  "cSignerAction",
  "cValidatorAction",
  "cWithdraw",
  "cancel",
  "cancelByCloid",
  "claimRewards",
  "convertToMultiSigUser",
  "createSubAccount",
  "createVault",
  "evmUserModify",
  "linkStakingUser",
  "modify",
  "noop",
  "order",
  "perpDeploy",
  "registerReferrer",
  "reserveRequestWeight",
  "scheduleCancel",
  "sendAsset",
  "sendToEvmWithData",
  "setDisplayName",
  "setReferrer",
  "spotDeploy",
  "spotSend",
  "spotUser",
  "subAccountModify",
  "subAccountSpotTransfer",
  "subAccountTransfer",
  "tokenDelegate",
  "topUpIsolatedOnlyMargin",
  "twapCancel",
  "twapOrder",
  "updateIsolatedMargin",
  "updateLeverage",
  "usdClassTransfer",
  "usdSend",
  "userDexAbstraction",
  "userPortfolioMargin",
  "userSetAbstraction",
  "validatorL1Stream",
  "vaultDistribute",
  "vaultModify",
  "vaultTransfer",
  "withdraw3",
] as const;

export type HyperliquidExchangeAction = (typeof HYPERLIQUID_EXCHANGE_ACTIONS)[number];

export type HyperliquidOrderTif = "Gtc" | "Ioc" | "Alo" | "FrontendMarket";
export type HyperliquidOrderGrouping = "na" | "normalTpsl" | "positionTpsl";
export type HyperliquidTpslMode = "tp" | "sl";

export interface HyperliquidOrderTriggerInput {
  triggerPx: string;
  tpsl: HyperliquidTpslMode;
  isMarket?: boolean;
}

export interface HyperliquidOrderInput {
  market: string;
  side: "buy" | "sell";
  size: string;
  orderType?: "limit" | "market" | "trigger";
  price?: string;
  tif?: HyperliquidOrderTif;
  reduceOnly?: boolean;
  clientOrderId?: `0x${string}`;
  trigger?: HyperliquidOrderTriggerInput;
  grouping?: HyperliquidOrderGrouping;
}

export interface HyperliquidCancelInput {
  market: string;
  orderId?: number;
  clientOrderId?: `0x${string}`;
}

export interface HyperliquidModifyInput {
  market: string;
  orderId: number | `0x${string}`;
  side: "buy" | "sell";
  size: string;
  orderType?: "limit" | "market" | "trigger";
  price?: string;
  tif?: HyperliquidOrderTif;
  reduceOnly?: boolean;
  clientOrderId?: `0x${string}`;
  trigger?: HyperliquidOrderTriggerInput;
}

export interface HyperliquidLeverageInput {
  market: string;
  leverage: number;
  mode: "cross" | "isolated";
}

export interface HyperliquidUsdTransferInput {
  destination: `0x${string}`;
  amount: string;
}

export interface HyperliquidSpotTransferInput {
  destination: `0x${string}`;
  token: string;
  amount: string;
}

export interface HyperliquidSendAssetInput extends HyperliquidSpotTransferInput {
  sourceDex: string;
  destinationDex: string;
  fromSubAccount?: "" | `0x${string}`;
}

export interface HyperliquidWithdrawInput {
  destination: `0x${string}`;
  amount: string;
}

export interface HyperliquidMarketSearchInput {
  query?: string;
  kind?: "all" | "perp" | "spot";
  limit?: number;
  dex?: string;
}

export interface HyperliquidOrderBookInput {
  market: string;
  nSigFigs?: 2 | 3 | 4 | 5;
  mantissa?: 2 | 5;
}

export interface HyperliquidCandlesInput {
  market: string;
  interval: "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "8h" | "12h" | "1d" | "3d" | "1w" | "1M";
  startTime: number;
  endTime?: number;
}

export interface HyperliquidOrderStatusInput {
  user: `0x${string}`;
  orderId: number | `0x${string}`;
}

export interface HyperliquidInfoRequest {
  method: HyperliquidInfoMethod;
  params?: Record<string, unknown>;
}

export interface HyperliquidExchangeRequest {
  action: HyperliquidExchangeAction;
  params?: Record<string, unknown>;
}

export interface HyperliquidUserFacingService {
  searchMarkets(input?: HyperliquidMarketSearchInput): Promise<unknown>;
  getMarketSnapshot(coins?: string[]): Promise<unknown>;
  getOrderBook(input: HyperliquidOrderBookInput): Promise<unknown>;
  getCandles(input: HyperliquidCandlesInput): Promise<unknown>;
  getOrderStatus(input: HyperliquidOrderStatusInput): Promise<unknown>;
  getHistoricalOrders(address: `0x${string}`): Promise<unknown>;
  getSpotBalance(address: `0x${string}`, token?: string): Promise<unknown>;
  getUserSummary(address: `0x${string}`): Promise<unknown>;
  getOpenOrders(address: `0x${string}`): Promise<unknown>;
  getRecentFills(address: `0x${string}`, limit?: number): Promise<unknown>;
  queryInfo(method: HyperliquidInfoMethod, params?: Record<string, unknown>): Promise<unknown>;
  executeAction(
    wallet: AppWallet,
    action: HyperliquidExchangeAction,
    params?: Record<string, unknown>,
  ): Promise<unknown>;
  placeOrder(wallet: AppWallet, input: HyperliquidOrderInput): Promise<unknown>;
  cancelOrder(wallet: AppWallet, input: HyperliquidCancelInput): Promise<unknown>;
  modifyOrder(wallet: AppWallet, input: HyperliquidModifyInput): Promise<unknown>;
  updateLeverage(wallet: AppWallet, input: HyperliquidLeverageInput): Promise<unknown>;
  transferUsd(wallet: AppWallet, input: HyperliquidUsdTransferInput): Promise<unknown>;
  transferSpot(wallet: AppWallet, input: HyperliquidSpotTransferInput): Promise<unknown>;
  sendAsset(wallet: AppWallet, input: HyperliquidSendAssetInput): Promise<unknown>;
  withdraw(wallet: AppWallet, input: HyperliquidWithdrawInput): Promise<unknown>;
}
