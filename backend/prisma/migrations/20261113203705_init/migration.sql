-- CreateEnum
CREATE TYPE "SalaryChangeReason" AS ENUM ('HIRE', 'PROMOTION', 'ANNUAL_REVIEW', 'MARKET_ADJUSTMENT', 'CORRECTION');

-- CreateTable
CREATE TABLE "countries" (
    "code" CHAR(2) NOT NULL,
    "name" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "usd_rate" DECIMAL(14,8) NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" SERIAL NOT NULL,
    "employee_code" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "job_title" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "hire_date" DATE NOT NULL,
    "salary" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_changes" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "previous_salary" INTEGER,
    "new_salary" INTEGER NOT NULL,
    "effective_date" DATE NOT NULL,
    "reason" "SalaryChangeReason" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_employee_code_key" ON "employees"("employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "employees_email_key" ON "employees"("email");

-- CreateIndex
CREATE INDEX "employees_country_code_idx" ON "employees"("country_code");

-- CreateIndex
CREATE INDEX "employees_department_idx" ON "employees"("department");

-- CreateIndex
CREATE INDEX "employees_job_title_idx" ON "employees"("job_title");

-- CreateIndex
CREATE INDEX "employees_country_code_job_title_idx" ON "employees"("country_code", "job_title");

-- CreateIndex
CREATE INDEX "employees_last_name_first_name_idx" ON "employees"("last_name", "first_name");

-- CreateIndex
CREATE INDEX "salary_changes_employee_id_effective_date_idx" ON "salary_changes"("employee_id", "effective_date");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_changes" ADD CONSTRAINT "salary_changes_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
