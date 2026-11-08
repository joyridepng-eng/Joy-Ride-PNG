import {
  buildSettlementReceiptHtml,
  type PrintableSettlementRide,
} from "./settlement-receipt";

export async function printSettlementReceipt(
  ride: PrintableSettlementRide,
): Promise<void> {
  const html = buildSettlementReceiptHtml(ride);
  const receiptWindow = window.open("", "_blank");
  if (!receiptWindow) {
    throw new Error("Allow the receipt window to open, then try again.");
  }
  receiptWindow.opener = null;
  try {
    receiptWindow.document.open();
    receiptWindow.document.write(html);
    receiptWindow.document.close();
    receiptWindow.focus();
    receiptWindow.print();
  } catch {
    receiptWindow.close();
    throw new Error("Unable to open receipt printing.");
  }
}
