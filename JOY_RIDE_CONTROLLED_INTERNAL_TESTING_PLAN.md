\# Joy Ride Controlled Internal Testing Plan



\## Purpose



This plan is for controlled internal testing of the Joy Ride MVP before any public launch.



The goal is not to add new features yet.



The goal is to prove that the current MVP workflow works reliably with a small group of trusted testers.



\---



\## MVP Rule



Do not overbuild the first version.



The current MVP is successful if this workflow works repeatedly:



1\. Rider requests a ride.

2\. Admin views the ride request.

3\. Admin assigns a driver.

4\. Driver sees the assigned ride.

5\. Driver moves the ride through completion.

6\. Backend creates receipt and settlement.

7\. Rider views the receipt.

8\. Admin reviews the settlement.

9\. Admin marks the settlement as paid.



Do not add authentication, promotions, real payments, live maps, push notifications, dashboards, accounting exports, or wallet payouts during this test phase.



\---



\## Testing Scope



\### Included In This Test



\- Rider ride request

\- Admin ride request review

\- Admin driver assignment

\- Driver availability

\- Driver assigned ride lookup

\- Driver ride lifecycle

\- Receipt creation

\- Rider receipt lookup

\- Admin settlement review

\- Admin mark settlement paid

\- Basic error handling

\- Basic app usability



\### Not Included In This Test



\- Real customer accounts

\- Real driver accounts

\- Real online payments

\- Real driver payouts

\- Real GPS tracking

\- Live maps

\- Push notifications

\- Promo codes

\- Public launch

\- App Store / Play Store release

\- Production customer support

\- Accounting export



\---



\## Test Environment



\### Backend



\- Local backend server

\- URL: `http://localhost:3000`

\- Database: current local development database

\- Test data only



\### Apps



\- Joy Ride Rider App

\- Joy Ride Driver App

\- Joy Ride Admin App



\### Test Driver



```text

Driver Name: Test Driver Two

Driver ID: cmqxiib050000dcrih388jp0a

Phone: +67570000002

Vehicle: White Toyota HiAce

Plate: PMV-002

