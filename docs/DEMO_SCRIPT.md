# Demo video script (~6 minutes)

1. **Problem (15s):** "HR manages pay for 10k people in 8 countries in spreadsheets. This replaces that, securely."
2. **Sign in (20s):** open `/employees` while signed out and get sent to the login page. Sign in as `hr@acme.example`
   and land back on the page you asked for. Point out the role in the header and the missing admin menu.
3. **Dashboard (60s):** the KPIs (payroll is gross pay in USD; median vs average). Toggle Median ↔ Payroll and
   group by Country, Department or Job title, with the table view under the chart. Filter to India to show
   the local-currency (₹) medians. Show the distribution and the highest-paid list.
4. **Directory (40s):** search "sharma", filter Germany → Sales → Sales Manager, sort by salary, copy the URL
   into a new tab. Switch Status to Inactive.
5. **Employee (90s):**
   * The pay breakdown (base + allowances + bonus = gross − deductions = net), the history with gross, %
     and "By", and the pay-vs-peers band.
   * Record salary change: the form is pre-filled. Cut base pay with reason "Promotion" and show the rule
     rejecting it. Switch to Annual review, raise base and bonus, and watch the gross % preview. Save, then
     show the history row, the new net pay, and the Activity entry with the before → after values.
   * Deactivate (record kept, removed from analytics), then Reactivate.
6. **AI assistant (45s):** click "Which department has the highest average salary?" and show the answer plus
   the verified table and chart. Type "Top 5 highest paid employees in India". Ask something unsupported
   ("weather") and show the graceful decline. Explain that the model only picks vetted queries, so the
   numbers come from SQL.
7. **Reports (30s):** filter Singapore, download the employee CSV and open it (gross/net columns), then the
   department report as Excel.
8. **Admin (45s):** sign in as `admin@acme.example`. Create a user (a weak password is rejected), sign in as
   them in another window, disable them, and their next click is rejected. Audit log → filter "salary
   changed" to see who changed what.
9. **Engineering (30s):** the requirements doc, the security table in DESIGN.md, `npm test` (~4s), and the
   Playwright run against the production containers.
