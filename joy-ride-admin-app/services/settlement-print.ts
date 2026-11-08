import * as Print from "expo-print";
import {
  buildSettlementReceiptHtml,
  type PrintableSettlementRide,
} from "./settlement-receipt";

export async function printSettlementReceipt(
  ride: PrintableSettlementRide,
): Promise<void> {
  await Print.printAsync({ html: buildSettlementReceiptHtml(ride) });
}
