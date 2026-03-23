import type { AppWallet } from "../../domain/users/types";

export interface HyperliquidOrderInput {
  market: string;
  side: "buy" | "sell";
  size: string;
  price?: string;
  tif?: "Gtc" | "Ioc" | "Alo" | "FrontendMarket";
  reduceOnly?: boolean;
}

export interface HyperliquidCancelInput {
  market: string;
  orderId: number;
}

export interface HyperliquidModifyInput {
  market: string;
  orderId: number;
  side: "buy" | "sell";
  size: string;
  price: string;
  tif?: "Gtc" | "Ioc" | "Alo" | "FrontendMarket";
  reduceOnly?: boolean;
}

export interface HyperliquidLeverageInput {
  market: string;
  leverage: number;
  mode: "cross" | "isolated";
}

export interface HyperliquidUserFacingService {
  getMarketSnapshot(coins?: string[]): Promise<unknown>;
  getUserSummary(address: `0x${string}`): Promise<unknown>;
  getOpenOrders(address: `0x${string}`): Promise<unknown>;
  getRecentFills(address: `0x${string}`, limit?: number): Promise<unknown>;
  placeOrder(wallet: AppWallet, input: HyperliquidOrderInput): Promise<unknown>;
  cancelOrder(wallet: AppWallet, input: HyperliquidCancelInput): Promise<unknown>;
  modifyOrder(wallet: AppWallet, input: HyperliquidModifyInput): Promise<unknown>;
  updateLeverage(wallet: AppWallet, input: HyperliquidLeverageInput): Promise<unknown>;
}
