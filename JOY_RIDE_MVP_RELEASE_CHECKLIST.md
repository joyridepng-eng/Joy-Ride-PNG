\# Joy Ride MVP Release Checklist



\## MVP Rule



Do not overbuild the first version.



The first release only needs to prove this:



\- Can a rider request a ride from a phone?

\- Can an admin view the request and assign a driver?

\- Can a driver see the assigned ride and complete it?

\- Can the backend create a receipt and settlement?

\- Can the admin review and mark the settlement as paid?



Do not add authentication, promotions, real payments, live maps, push notifications, dashboards, wallet payouts, or accounting exports until this checklist is stable.



\---



\## 1. Backend Checklist



\### Ride Request



\- \[ ] `POST /rides` creates a new ride.

\- \[ ] New ride status is `REQUESTED`.

\- \[ ] Ride stores rider name.

\- \[ ] Ride stores rider phone.

\- \[ ] Ride stores pickup label/address.

\- \[ ] Ride stores dropoff label/address.

\- \[ ] Ride stores estimated fare.



\### Ride Lookup



\- \[ ] `GET /rides` returns rides.

\- \[ ] `GET /rides/:id` returns one ride.

\- \[ ] `GET /rides?status=REQUESTED` works.

\- \[ ] `GET /rides?status=COMPLETED` works.



\### Driver Assignment



\- \[ ] `PATCH /rides/:id/assign-driver` works for a requested ride.

\- \[ ] Assigned ride changes to `ACCEPTED`.

\- \[ ] Driver is attached to the ride.

\- \[ ] Active vehicle is attached to the ride.

\- \[ ] Driver becomes unavailable after assignment.

\- \[ ] Invalid driver assignment is rejected.



\### Driver Availability



\- \[ ] Driver can be set online.

\- \[ ] Driver can be set offline.

\- \[ ] Driver can be set available.

\- \[ ] Driver can be set unavailable.

\- \[ ] Driver status is visible from the backend.



\### Ride Lifecycle



\- \[ ] Driver can mark ride as `DRIVER\_ARRIVED`.

\- \[ ] Driver can mark ride as `IN\_PROGRESS`.

\- \[ ] Driver can mark ride as `COMPLETED`.

\- \[ ] Completed ride creates a settlement.

\- \[ ] Completed ride releases the driver correctly.

\- \[ ] Invalid status changes are rejected.



\### Settlement / Receipt



\- \[ ] Completed ride has a receipt number.

\- \[ ] Completed ride has final fare.

\- \[ ] Completed ride has driver share.

\- \[ ] Completed ride has company share.

\- \[ ] Settlement starts as `PENDING`.

\- \[ ] `GET /rides/:id/settlement` returns the receipt.

\- \[ ] `PATCH /rides/:id/settlement/paid` changes settlement to `PAID`.

\- \[ ] Non-settled rides cannot be marked paid.



\---



\## 2. Rider App Checklist



\### Home



\- \[ ] Rider App opens successfully.

\- \[ ] Home screen clearly explains Joy Ride.

\- \[ ] Home screen has a path to request a ride.



\### Request Ride



\- \[ ] Rider can enter name.

\- \[ ] Rider can enter PNG phone number.

\- \[ ] Rider can enter pickup details.

\- \[ ] Rider can enter dropoff details.

\- \[ ] Rider can enter estimated fare.

\- \[ ] Request Ride button creates a ride.

\- \[ ] Success message shows the new ride ID.



\### Ride Status



\- \[ ] Rider can check ride status by ride ID.

\- \[ ] Requested ride shows `REQUESTED`.

\- \[ ] Assigned ride shows `ACCEPTED`.

\- \[ ] Active ride statuses display correctly.

\- \[ ] Completed ride shows `COMPLETED`.

\- \[ ] Completed ride provides a path to receipt.



\### Receipt



\- \[ ] Rider can view receipt by ride ID.

\- \[ ] Receipt number displays.

\- \[ ] Rider details display.

\- \[ ] Pickup and dropoff display.

\- \[ ] Driver details display.

\- \[ ] Vehicle details display.

\- \[ ] Final fare displays.

\- \[ ] Settlement status displays.



\---



\## 3. Driver App Checklist



\### Home



\- \[ ] Driver App opens successfully.

\- \[ ] Home screen clearly explains driver workflow.

\- \[ ] Driver knows which test Driver ID to use.



\### Availability



\- \[ ] Driver can load current availability.

\- \[ ] Driver can go online.

\- \[ ] Driver can go offline.

\- \[ ] Driver can mark available.

\- \[ ] Driver can mark unavailable.



\### Assigned Ride



\- \[ ] Driver can enter Driver ID.

\- \[ ] Driver can find assigned ride.

\- \[ ] Assigned ride details display.

\- \[ ] Rider details display.

\- \[ ] Pickup and dropoff display.

\- \[ ] Fare displays.

\- \[ ] Vehicle details display.

\- \[ ] Driver can mark arrived.

\- \[ ] Driver can start ride.

\- \[ ] Driver can complete ride.

\- \[ ] Completed ride shows receipt/settlement summary if available.



\---



\## 4. Admin App Checklist



\### Home



\- \[ ] Admin App opens successfully.

\- \[ ] Home screen clearly explains admin workflow.



\### Requested Rides



\- \[ ] Admin can load requested rides.

\- \[ ] Requested rides show ride ID.

\- \[ ] Requested rides show rider details.

\- \[ ] Requested rides show pickup and dropoff.

\- \[ ] Requested rides show estimated fare.

\- \[ ] Requested rides show requested time.



\### Assign Driver



\- \[ ] Admin can paste Ride ID.

\- \[ ] Admin can use test Driver ID.

\- \[ ] Admin can assign driver.

\- \[ ] Successful assignment displays ride details.

\- \[ ] Successful assignment displays driver details.

\- \[ ] Successful assignment displays vehicle details.

\- \[ ] Assigned ride becomes visible in Driver App.



\### Ride Operations



\- \[ ] Admin can load operational rides.

\- \[ ] Admin can see accepted rides.

\- \[ ] Admin can see driver arrived rides.

\- \[ ] Admin can see in-progress rides.

\- \[ ] Admin can see completed rides.

\- \[ ] Admin can see cancelled rides.

\- \[ ] Admin can see settlement details for completed rides.



\### Settlements



\- \[ ] Admin can load settlements.

\- \[ ] Completed receipts count displays.

\- \[ ] Total final fare displays.

\- \[ ] Total driver share displays.

\- \[ ] Total company share displays.

\- \[ ] Pending settlement shows `Mark Paid`.

\- \[ ] Clicking `Mark Paid` changes status to `PAID`.

\- \[ ] `Mark Paid` button disappears after payment status changes.

\- \[ ] Paid settlement remains visible as `PAID`.



\---



\## 5. Full End-to-End Test



Run this before calling the MVP release-ready.



\### Test Flow



\- \[ ] Start backend server.

\- \[ ] Start Rider App.

\- \[ ] Start Driver App.

\- \[ ] Start Admin App.

\- \[ ] Driver is online and available.

\- \[ ] Rider creates a new ride.

\- \[ ] Admin loads requested rides.

\- \[ ] Admin copies the ride ID.

\- \[ ] Admin assigns Test Driver Two.

\- \[ ] Driver loads assigned ride.

\- \[ ] Driver marks arrived.

\- \[ ] Driver starts ride.

\- \[ ] Driver completes ride.

\- \[ ] Rider checks receipt.

\- \[ ] Admin loads settlements.

\- \[ ] Admin marks settlement paid.

\- \[ ] Admin confirms settlement status is `PAID`.



\### Pass Criteria



The MVP passes only when:



\- \[ ] Rider request works.

\- \[ ] Admin assignment works.

\- \[ ] Driver completion works.

\- \[ ] Receipt creation works.

\- \[ ] Admin settlement review works.

\- \[ ] Admin mark paid works.

\- \[ ] No app has lint errors.

\- \[ ] Git status is clean in backend.

\- \[ ] Git status is clean in Rider App.

\- \[ ] Git status is clean in Driver App.

\- \[ ] Git status is clean in Admin App.



\---



\## 6. Known MVP Limitations



These are acceptable for the first version:



\- No customer login.

\- No driver login.

\- No admin login.

\- No real payment gateway.

\- No wallet payout.

\- No live map tracking.

\- No push notifications.

\- No promotions.

\- No automatic driver matching.

\- No production database.

\- No public app store deployment yet.

\- No audit dashboard.

\- No PDF receipts.

\- No accounting export.



These are future milestones, not MVP blockers.



\---



\## 7. Future Milestones



Only start these after the MVP checklist passes:



1\. Authentication

2\. Production environment configuration

3\. Safer admin access

4\. Real rider accounts

5\. Real driver accounts

6\. Promotions

7\. Payment gateway

8\. Driver payout tracking

9\. Live maps

10\. Push notifications

11\. Admin dashboard polish

12\. Audit logs

13\. PDF receipts

14\. Production deployment

15\. App store packaging



\---



\## 8. Current Test Driver



Use this for MVP testing:



```text

Driver Name: Test Driver Two

Driver ID: cmqxiib050000dcrih388jp0a

Phone: +67570000002

Vehicle: White Toyota HiAce

Plate: PMV-002

