# GearTrack — Development Milestones & Project Guide

## Project Overview

GearTrack is an equipment management and borrowing system based on the existing `geartrack.html` prototype.

The current prototype contains:
- Dashboard
- Inventory
- Checkouts
- Maintenance
- Procurement
- Responsive UI
- JavaScript-rendered sample data

The current prototype stores its data directly in JavaScript arrays. The goal is to convert it into a real, database-backed application.

## Final Technology Architecture

Use this architecture:

- Frontend: HTML, CSS, JavaScript
- Database: Supabase PostgreSQL
- Authentication: Supabase Auth
- Authorization/security: Supabase Row Level Security (RLS)
- Hosting: Netlify
- Version control: Git/GitHub
- Local testing: local development server / Live Server
- Do NOT use XAMPP, PHP, MySQL, or InfinityFree for the planned final architecture.

Final structure:

Browser
    |
    v
Netlify-hosted GearTrack frontend
    |
    v
Supabase
    |- Authentication
    |- PostgreSQL database
    |- Row Level Security
    `- Storage if needed later

## Important Development Principle

Do not rebuild the existing UI unnecessarily.

The existing `geartrack.html` is the starting point for the frontend. Preserve its visual design and functionality where appropriate, then progressively replace hard-coded JavaScript data with Supabase data.

Work incrementally. Each milestone should be tested before moving to the next.

Do not make large unrelated changes.

---

# Milestone 0 — System Planning

Goal: Define the exact system before implementation.

Define:

1. Admin capabilities
2. Borrower/user capabilities
3. Equipment workflow
4. Borrowing request workflow
5. Approval/rejection workflow
6. Checkout workflow
7. Return workflow
8. Overdue workflow
9. Maintenance workflow
10. Procurement workflow
11. User roles
12. Database relationships
13. Security requirements

Basic user direction:

USER
- Login
- Browse equipment
- Request equipment
- View pending requests
- View current loans
- View borrowing history
- View overdue equipment

ADMIN
- Login
- Dashboard
- Manage equipment
- Manage borrowing requests
- Approve/reject requests
- Process returns
- Manage maintenance
- Manage procurement
- Manage users
- View reports/history

Milestone 0 result:
A documented and agreed system flow.

---

# Milestone 1 — Development Environment

Goal: Prepare the local development environment.

Use:
- VS Code
- Git/GitHub
- A local development server (for example VS Code Live Server)
- Supabase account/project
- Netlify account

Do NOT install or configure XAMPP for this architecture.

The project should run locally in the browser.

Milestone 1 result:
GearTrack can be opened locally and the existing frontend can be tested.

---

# Milestone 2 — Supabase Database

Goal: Create the PostgreSQL database structure.

Initial tables are expected to include:

- profiles
- equipment_categories
- equipment
- borrow_requests
- borrow_request_items
- checkouts
- maintenance
- purchase_orders
- activity_logs

Potential relationship:

profiles
  |
  +--> borrow_requests
  |       |
  |       +--> borrow_request_items --> equipment
  |
  +--> activity_logs

equipment
  |
  +--> equipment_categories
  |
  +--> maintenance

Create and test the database through Supabase.

Milestone 2 result:
Supabase contains the initial working database schema.

---

# Milestone 3 — Authentication

Goal: Implement login using Supabase Auth.

Required functionality:
- Login
- Logout
- Session persistence
- Authentication checks
- User profile retrieval
- Redirect based on role

Basic direction:

Login
  |
  v
Supabase Auth
  |
  v
User profile / role
  |
  +--> admin --> Admin interface
  |
  `--> user --> User interface

Do not build a custom password authentication system if Supabase Auth can handle it.

Milestone 3 result:
Separate test admin and user accounts can log in successfully.

---

# Milestone 4 — Role-Based Security / RLS

Goal: Secure the application at the database level.

Do NOT rely only on hiding buttons or pages in JavaScript.

Use Supabase Row Level Security (RLS).

Regular users should generally be able to:
- View permitted equipment
- Create borrowing requests
- View their own requests
- View their own loans/history

Regular users should NOT be able to:
- Modify equipment
- Delete equipment
- Approve requests
- Manage users
- Manage maintenance
- Manage procurement

Admins should be able to manage the required system data.

Milestone 4 result:
The database itself enforces role and ownership permissions.

---

# Milestone 5 — Inventory

Goal: Convert the current hard-coded inventory into Supabase-backed data.

Current prototype has inventory fields such as:
- ID
- Equipment name
- Category
- Available quantity
- Total quantity
- Condition
- Location
- Status

Replace JavaScript hard-coded inventory with Supabase queries.

Implement:
- View inventory
- Category filtering
- Search if needed
- Add equipment
- Edit equipment
- Deactivate equipment
- Quantity management
- Condition
- Location
- Status

Milestone 5 result:
Inventory is persistent and database-driven.

---

# Milestone 6 — User Borrowing

Goal: Allow users to submit real borrowing requests.

A request should contain appropriate information such as:
- User
- Equipment
- Quantity
- Borrow date
- Expected return date
- Purpose if required
- Request status
- Creation timestamp

Basic workflow:

User
  |
  v
Select equipment
  |
  v
Enter quantity/dates
  |
  v
Submit request
  |
  v
Supabase
  |
  v
Pending request

Milestone 6 result:
A user can submit a borrowing request and the request persists in Supabase.

---

# Milestone 7 — Admin Borrowing Management

Goal: Allow administrators to process requests.

Admin should be able to:
- View pending requests
- View request details
- Approve
- Reject
- See requester
- See requested equipment
- See requested quantity
- See requested dates

Example state flow:

Pending
  |
  +--> Rejected
  |
  `--> Approved
          |
          v
       Borrowed
          |
          v
       Returned

Milestone 7 result:
Complete request approval/rejection workflow.

---

# Milestone 8 — Returns and Overdue Tracking

Goal: Make checkout and return tracking persistent.

Current prototype has a JavaScript-only "Mark Returned" action. Replace this with a Supabase database update.

Expected flow:

Admin clicks "Mark Returned"
  |
  v
Supabase update
  |
  v
Checkout becomes Returned
  |
  v
Equipment availability is updated
  |
  v
Dashboard reflects the new values

Overdue status should preferably be determined from dates rather than manually maintained boolean values when practical.

Milestone 8 result:
Borrow → checkout → return is persistent and accurate.

---

# Milestone 9 — Maintenance

Goal: Convert maintenance into persistent database records.

Implement:
- Create maintenance task
- Equipment association
- Maintenance type
- Priority
- Scheduled date
- Technician
- Status
- Mark complete
- View completed tasks

Milestone 9 result:
Maintenance records persist in Supabase and are associated with equipment.

---

# Milestone 10 — Procurement

Goal: Convert procurement into database-backed records.

Implement:
- Create purchase order
- Equipment
- Quantity
- Cost
- Order date
- Status/stage
- Update order status
- View pending/completed orders

Consider whether receiving an order should automatically increase inventory.

Milestone 10 result:
Procurement is database-driven.

---

# Milestone 11 — Dynamic Dashboard

Goal: Replace hard-coded dashboard statistics with actual database calculations.

The dashboard should dynamically calculate things such as:
- Total equipment
- Available equipment
- Checked-out equipment
- Overdue equipment
- Pending maintenance
- Pending borrowing requests
- Other relevant statistics

Dashboard data should reflect changes made elsewhere in the system.

Milestone 11 result:
Dashboard represents actual current system data.

---

# Milestone 12 — UI/UX Refinement

Only after core functionality works.

Improve:
- Mobile responsiveness
- Loading indicators
- Error messages
- Confirmation dialogs
- Empty states
- Form validation
- Notifications
- Navigation
- Admin interface
- User interface
- Profile display

Preserve the existing GearTrack visual style unless there is a functional reason to change it.

Milestone 12 result:
Consistent and usable interface across admin and user areas.

---

# Milestone 13 — Security and Testing

Test authentication:
- Login
- Logout
- Invalid credentials
- Session persistence
- Unauthorized access

Test authorization:
- User cannot perform admin actions
- User cannot modify equipment directly
- User can only access permitted records
- Admin has required management access

Test borrowing:
- Submit request
- Approve
- Reject
- Checkout
- Return
- Overdue

Test data validation:
- Missing fields
- Invalid quantities
- Invalid dates
- Duplicate records
- Insufficient available equipment
- Unauthorized database operations

Milestone 13 result:
System is tested for functionality and security before deployment.

---

# Milestone 14 — Netlify Deployment

Goal: Deploy the finished frontend.

Expected deployment:

GitHub
  |
  v
Netlify
  |
  v
Public GearTrack website
  |
  v
Supabase

Configure:
- GitHub repository
- Netlify site
- Deployment settings
- Environment variables
- Supabase project URL
- Supabase publishable key
- Production testing

Never expose Supabase secret/service-role keys in the frontend.

Milestone 14 result:
GearTrack is publicly accessible through Netlify and communicates with Supabase.

---

# Milestone 15 — Production Finalization

Complete:
- Production database cleanup
- Real admin account
- Remove test accounts/data where appropriate
- Final RLS review
- Backup strategy
- Final functionality test
- Custom domain if desired
- Production documentation

Milestone 15 result:
GearTrack is ready for real use.

---

# Development Rules for AI Assistance

When modifying this project:

1. Work on one milestone at a time.
2. Do not skip milestones unless explicitly requested.
3. Do not replace the entire project unnecessarily.
4. Preserve existing UI/design unless a change is required.
5. Explain what files are being created or modified.
6. Give exact code and exact placement when code changes are needed.
7. Do not invent database columns or relationships without explaining why they are needed.
8. Before modifying the database schema, explain the proposed change.
9. Use Supabase Auth for authentication.
10. Use Supabase RLS for authorization/security.
11. Never put Supabase secret/service-role keys in client-side code.
12. Test each feature before moving to the next milestone.
13. Keep the application compatible with Netlify deployment.
14. The final architecture is Netlify + Supabase.
15. XAMPP, PHP, MySQL, and InfinityFree are NOT part of the planned final architecture.

## Current Starting Point

The existing `geartrack.html` is the frontend prototype.

It contains the following current sections:
- Dashboard
- Inventory
- Checkouts
- Maintenance
- Procurement

Its data is currently hard-coded in JavaScript arrays.

The first development objective is NOT to redesign the interface. The objective is to progressively convert the prototype into a secure, database-backed application.

## Current Project Status

Milestone 0 — NOT STARTED
Milestone 1 — NOT STARTED
Milestone 2 — NOT STARTED
Milestone 3 — NOT STARTED
Milestone 4 — NOT STARTED
Milestone 5 — NOT STARTED
Milestone 6 — NOT STARTED
Milestone 7 — NOT STARTED
Milestone 8 — NOT STARTED
Milestone 9 — NOT STARTED
Milestone 10 — NOT STARTED
Milestone 11 — NOT STARTED
Milestone 12 — NOT STARTED
Milestone 13 — NOT STARTED
Milestone 14 — NOT STARTED
Milestone 15 — NOT STARTED

When asked to continue development, identify the current milestone and work only on the appropriate next step unless the user explicitly requests otherwise.
