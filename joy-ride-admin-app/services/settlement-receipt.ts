export type PrintableSettlementRide = {
  id: string;
  riderName: string;
  pickupLabel: string | null;
  pickupAddress: string | null;
  dropoffLabel: string | null;
  dropoffAddress: string | null;
  updatedAt: string;
  driver?: { fullName: string } | null;
  vehicle?: { plateNumber: string } | null;
  settlement?: {
    receiptNumber: string;
    finalFare: string | number;
    driverShare: string | number;
    companyShare: string | number;
    status: string;
    createdAt?: string;
    updatedAt?: string;
  } | null;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function money(value: string | number): string {
  if (typeof value === "string" &&
      !/^\d+(?:\.\d+)?$/.test(value.trim())) {
    throw new Error("Invalid receipt amount.");
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Invalid receipt amount.");
  }
  return "PGK " + amount.toFixed(2);
}

function dateLabel(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Invalid receipt date.");
  }
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Pacific/Port_Moresby",
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date) + " (Port Moresby, UTC+10)";
}

export function buildSettlementReceiptHtml(
  ride: PrintableSettlementRide,
): string {
  const settlement = ride.settlement;
  if (!settlement || !settlement.receiptNumber?.trim() ||
      !ride.id?.trim() || !settlement.status?.trim()) {
    throw new Error("Receipt unavailable.");
  }

  const row = (label: string, value: unknown) =>
    "<tr><th>" + escapeHtml(label) + "</th><td>" +
    escapeHtml(value || "Not recorded") + "</td></tr>";

  const details = [
    row("Receipt number", settlement.receiptNumber),
    row("Payment status", settlement.status),
    row("Ride ID", ride.id),
    row("Customer", ride.riderName),
    row("Driver", ride.driver?.fullName),
    row("Vehicle registration", ride.vehicle?.plateNumber),
    row("Pickup", ride.pickupLabel || ride.pickupAddress),
    row("Drop-off", ride.dropoffLabel || ride.dropoffAddress),
    row("Receipt date", dateLabel(settlement.createdAt || ride.updatedAt)),
  ].join("");

  const amounts = [
    row("Final fare", money(settlement.finalFare)),
    row("Driver share", money(settlement.driverShare)),
    row("Company share", money(settlement.companyShare)),
  ].join("");

  return '<!DOCTYPE html><html lang="en"><head>' +
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Joy Ride settlement receipt</title>' +
    '<style>@page{size:A4;margin:18mm}' +
    'body{font-family:Arial,sans-serif;color:#172033;font-size:12pt}' +
    'h1{font-size:24pt;margin-bottom:4mm}' +
    'h2{font-size:16pt}table{width:100%;border-collapse:collapse;' +
    'margin:7mm 0}th,td{text-align:left;vertical-align:top;' +
    'padding:3mm;border-bottom:1px solid #cbd5e1;overflow-wrap:anywhere}' +
    'th{width:34%}tr{break-inside:avoid}' +
    '.note{font-size:10pt;color:#475569}</style></head><body>' +
    '<h1>Joy Ride</h1><h2>Settlement receipt</h2>' +
    '<table>' + details + '</table><table>' + amounts + '</table>' +
    '<p class="note">Payment status is shown above. Printing this receipt ' +
    'does not change or confirm payment.</p></body></html>';
}
